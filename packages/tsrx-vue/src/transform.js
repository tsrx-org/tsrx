/** @import * as AST from 'estree' */
/** @import * as ESTreeJSX from 'estree-jsx' */
/** @import { JsxHelperComponent, JsxPlatform, JsxTransformContext as TransformContext } from '@tsrx/core/types' */

import { walk } from 'zimmerframe';
import is_reference from 'is-reference';
import {
	builders as b,
	addJsxSetupDeclaration,
	clone_ast_node,
	clone_identifier,
	contains_component_jsx,
	createHookSafeHelper,
	create_generated_identifier,
	createJsxTransform,
	DIAGNOSTIC_CODES,
	error,
	has_location,
	is_component_like_element,
	MERGE_REFS_INTERNAL_NAME,
	NORMALIZE_SPREAD_PROPS_FOR_REF_ATTR_INTERNAL_NAME,
	NORMALIZE_SPREAD_PROPS_INTERNAL_NAME,
	setLocation,
} from '@tsrx/core';

/**
 * Minimal Vue platform descriptor consumed by `createJsxTransform`.
 *
 * Vue largely reuses the shared JSX lowering while wrapping compiled
 * components in `defineVaporComponent(...)` and handling its extra imports.
 * Async component bodies still stay explicitly unsupported.
 *
 * @type {JsxPlatform}
 */
const vue_platform = {
	name: 'Vue',
	imports: {
		suspense: 'vue',
		dynamic: '@tsrx/vue/dynamic',
		// Production output aliases dynamic tags to a scoped component const
		// inside an expression-child IIFE — vue-jsx-vapor's own render block
		// keeps the tag reactive, so no runtime import is needed; the type-only
		// transform keeps the `Dynamic` component shape.
		dynamicFactory: { renderBlock: true },
		errorBoundary: '@tsrx/vue/error-boundary',
		mergeRefs: '@tsrx/vue/ref',
		refProp: '@tsrx/vue/ref',
	},
	directRuntimeImports: {
		errorBoundary: '@tsrx/vue-runtime/error-boundary',
		mergeRefs: '@tsrx/vue-runtime/ref',
		refProp: '@tsrx/vue-runtime/ref',
	},
	jsx: {
		rewriteClassAttr: false,
		multiRefStrategy: 'merge-refs',
		hostSpreadRefStrategy: 'explicit-ref-attr',
		// vue-jsx-vapor escapes a string child into its HTML template, where a
		// `<script>` element's text isn't decoded, and writes a string
		// `innerHTML` there as an attribute. `v-html` sets the body as written
		// when the element is created, and the server renders it as written.
		scriptBody: 'v-html',
	},
	validation: {
		requireUseServerForAwait: true,
		scanUseServerDirectiveForAwaitWithCustomValidator: false,
	},
	hooks: {
		initialState: () => ({
			needs_define_vapor_component: false,
			needs_vapor_for: false,
		}),
		wrapHelperComponent(helper_fn, helper_id, ctx, source_node) {
			ctx.needs_define_vapor_component = true;
			return wrap_helper_component(helper_fn, helper_id, source_node);
		},
		canHoistStaticNode(node) {
			return !contains_component_jsx(node);
		},
		preprocessElementAttributes(attrs, ctx) {
			return preprocess_ref_attributes(attrs, ctx);
		},
		transformElementAttributes(attrs, ctx, element) {
			if (!ctx.typeOnly || is_component_like_element(element)) {
				return attrs;
			}
			return attrs.map(mark_type_only_host_ref_attribute);
		},
		renderForOf: (node, loop_params, body_statements, ctx) =>
			render_for_of_as_vapor_for(node, loop_params, body_statements, ctx),
		createPendingBoundary(try_content, fallback_content) {
			return create_vapor_pending_boundary(try_content, fallback_content);
		},
		createErrorFallbackComponent(catch_body_nodes, catch_params, ctx, node) {
			// Only the runtime `@pending` boundary renders the component (see
			// `createErrorBoundary`); anything else would be dead module code.
			if (ctx.typeOnly || !node.pending) return null;
			return create_module_scoped_error_fallback_component(
				catch_body_nodes,
				catch_params,
				ctx,
				node,
			);
		},
		createErrorBoundary(try_content, raw_try_content, fallback_fn, ctx, node, info) {
			if (!node.pending) {
				return null;
			}
			const fallback_content = try_content.metadata?.vapor_pending_fallback;
			if (!fallback_content) {
				return create_vapor_error_boundary(try_content, fallback_fn);
			}
			const fallback_component = info?.fallbackComponent ?? null;
			const default_slot = ctx.typeOnly
				? b.arrow([], jsx_child_to_expression(raw_try_content))
				: create_sync_error_boundary_slot(
						raw_try_content,
						fallback_fn,
						fallback_component,
						node.block,
						node,
					);
			const suspense = create_vapor_pending_boundary_from_default_slot(
				default_slot,
				fallback_content,
			);
			const boundary = create_vapor_error_boundary(suspense, fallback_fn);
			for (const statement of fallback_component?.setup_statements ?? []) {
				addJsxSetupDeclaration(boundary, statement);
			}
			return boundary;
		},
		createErrorBoundaryContent(try_content) {
			return b.arrow([], jsx_child_to_expression(try_content));
		},
		transformElementChildren(node, walked_children, raw_children, attributes, ctx) {
			return rewrite_host_text_children(node, walked_children, raw_children, attributes);
		},
		validateComponentAwait(await_expression, _component, ctx) {
			error(
				'`await` is not yet supported in Vue TSRX components.',
				ctx?.filename ?? null,
				await_expression,
				ctx?.errors,
				ctx?.comments,
				DIAGNOSTIC_CODES.TARGET_AWAIT_UNSUPPORTED,
			);
		},
		injectImports(program, ctx) {
			wrap_native_function_components(program, ctx);
			inject_vue_imports(program, ctx);
		},
	},
};

export const transform = createJsxTransform(vue_platform);

/**
 * @param {ESTreeJSX.JSXRenderNode} try_content
 * @param {ESTreeJSX.JSXRenderNode} fallback_content
 * @returns {AST.TSRXJSXElement}
 */
function create_vapor_pending_boundary(try_content, fallback_content) {
	return create_vapor_pending_boundary_from_default_slot(
		b.arrow([], jsx_child_to_expression(try_content)),
		fallback_content,
	);
}

/**
 * @param {AST.ArrowFunctionExpression} default_slot
 * @param {ESTreeJSX.JSXRenderNode} fallback_content
 * @returns {AST.TSRXJSXElement}
 */
function create_vapor_pending_boundary_from_default_slot(default_slot, fallback_content) {
	const fallback_expression = jsx_child_to_expression(fallback_content);
	const slots_properties = [b.init('_', b.literal(1)), b.init('default', default_slot)];

	if (fallback_expression.type !== 'Literal' || fallback_expression.value !== null) {
		slots_properties.push(b.init('fallback', b.arrow([], fallback_expression)));
	}

	const slots = b.object(slots_properties);

	const boundary = b.jsx_element_fresh(
		b.jsx_opening_element(
			b.jsx_id('Suspense'),
			[b.jsx_attribute(b.jsx_id('v-slots'), to_jsx_expression_container(slots))],
			true,
		),
		null,
		[],
	);
	boundary.metadata.vapor_pending_fallback = fallback_content;
	return boundary;
}

/**
 * @param {AST.Statement[]} catch_body_nodes
 * @param {AST.Pattern[]} catch_params
 * @param {TransformContext} ctx
 * @param {AST.TryStatement} node
 * @returns {JsxHelperComponent}
 */
function create_module_scoped_error_fallback_component(catch_body_nodes, catch_params, ctx, node) {
	const source = node.handler ?? node;
	return createHookSafeHelper(catch_body_nodes, has_location(source) ? source : undefined, ctx, {
		transientBindings: get_pattern_names(catch_params),
	});
}

/**
 * Catch synchronous setup errors directly in the Suspense default slot so
 * Suspense can still observe async children while `catch` handles immediate
 * render failures.
 *
 * @param {ESTreeJSX.JSXRenderNode} content
 * @param {AST.ArrowFunctionExpression} fallback_fn
 * @param {JsxHelperComponent | null} fallback_component
 * @param {AST.BlockStatement} source_block
 * @param {AST.TryStatement} source_try
 * @returns {AST.ArrowFunctionExpression}
 */
function create_sync_error_boundary_slot(
	content,
	fallback_fn,
	fallback_component,
	source_block,
	source_try,
) {
	const error_id = create_generated_identifier('_error');
	const content_expression = jsx_child_to_expression(content);
	const fallback_expression = fallback_component
		? create_fallback_component_element(fallback_component, fallback_fn, [
				error_id,
				b.arrow([], b.block([])),
			])
		: b.call(b.parenthesized(fallback_fn), clone_identifier(error_id), b.arrow([], b.block([])));
	const try_block = setLocation(
		b.block([b.return(content_expression)]),
		has_location(source_block) ? source_block : undefined,
		true,
	);
	const try_statement = setLocation(
		b.try(
			try_block,
			b.catch_clause(error_id, null, b.block([b.return(fallback_expression)])),
			null,
			null,
		),
		has_location(source_try) ? source_try : undefined,
		true,
	);
	return b.arrow([], b.block([try_statement]));
}

/**
 * @param {JsxHelperComponent} fallback_component
 * @param {AST.ArrowFunctionExpression} fallback_fn
 * @param {AST.Expression[]} [replacement_args]
 * @returns {AST.TSRXJSXElement}
 */
function create_fallback_component_element(fallback_component, fallback_fn, replacement_args = []) {
	const element = clone_ast_node(fallback_component.component_element, false);
	/** @type {Map<string, AST.Expression>} */
	const replacements = new Map();
	for (let i = 0; i < fallback_fn.params.length && i < replacement_args.length; i += 1) {
		const param = fallback_fn.params[i];
		if (param?.type === 'Identifier') {
			replacements.set(param.name, replacement_args[i]);
		}
	}

	for (const attr of element.openingElement?.attributes ?? []) {
		if (attr.type !== 'JSXAttribute' || attr.name.type !== 'JSXIdentifier') continue;
		const attr_name = attr.name.name;
		if (!attr_name || !replacements.has(attr_name)) continue;
		attr.value = to_jsx_expression_container(
			/** @type {AST.Expression} */ (replacements.get(attr_name)),
			attr.value ?? attr,
		);
	}

	return element;
}

/**
 * @param {AST.Pattern[]} patterns
 * @returns {Set<string>}
 */
function get_pattern_names(patterns) {
	const names = new Set();
	for (const pattern of patterns) {
		collect_pattern_names(pattern, names);
	}
	return names;
}

/**
 * @param {ESTreeJSX.JSXRenderNode} child
 * @returns {AST.Expression}
 */
function jsx_child_to_expression(child) {
	return child.type === 'JSXExpressionContainer'
		? /** @type {AST.Expression} */ (child.expression)
		: /** @type {AST.Expression} */ (child);
}

/**
 * @param {ESTreeJSX.JSXRenderNode} content
 * @param {AST.ArrowFunctionExpression} fallback_fn
 * @returns {AST.TSRXJSXElement}
 */
function create_vapor_error_boundary(content, fallback_fn) {
	return b.jsx_element_fresh(
		b.jsx_opening_element(
			b.jsx_id('TsrxErrorBoundary'),
			[
				b.jsx_attribute(b.jsx_id('fallback'), to_jsx_expression_container(fallback_fn)),
				b.jsx_attribute(
					b.jsx_id('content'),
					to_jsx_expression_container(b.arrow([], jsx_child_to_expression(content))),
				),
			],
			true,
		),
		null,
		[],
	);
}

/**
 * Vue's `VNodeRef` type is wider than TSRX host refs because it also supports
 * component instances and null teardown values. In editor-only TSX, keep the ref
 * expression unchanged but stop TypeScript verification from reporting that
 * Vue-specific assignability diagnostic on the generated `ref` prop token.
 *
 * @param {ESTreeJSX.JSXAttributeNode} attr
 * @returns {ESTreeJSX.JSXAttributeNode}
 */
function mark_type_only_host_ref_attribute(attr) {
	if (
		!attr ||
		attr.type !== 'JSXAttribute' ||
		attr.name?.type !== 'JSXIdentifier' ||
		attr.name.name !== 'ref'
	) {
		return attr;
	}

	const name = b.jsx_id(attr.name.name, has_location(attr.name) ? attr.name : undefined);
	name.metadata = { ...(attr.name.metadata || {}), disable_verification: true };
	return b.jsx_attribute(name, attr.value, attr.shorthand, has_location(attr) ? attr : undefined);
}

/**
 * @param {AST.FunctionDeclaration} helper_fn
 * @param {AST.Identifier} helper_id
 * @param {AST.NodeWithLocation | undefined} source_node
 * @returns {AST.VariableDeclaration}
 */
function wrap_helper_component(helper_fn, helper_id, source_node) {
	return setLocation(
		b.declaration('const', [
			b.declarator(
				clone_identifier(helper_id),
				create_define_vapor_component_call(function_declaration_to_expression(helper_fn), [], []),
			),
		]),
		source_node,
	);
}

/**
 * @param {AST.Program} program
 * @param {TransformContext} ctx
 * @returns {void}
 */
function wrap_native_function_components(program, ctx) {
	const wrapped = walk(program, ctx, {
		FunctionDeclaration: visit_function_component,
		FunctionExpression: visit_function_component,
		ArrowFunctionExpression: visit_function_component,
		Program: visit_statement_list_owner,
		BlockStatement: visit_statement_list_owner,
		StaticBlock: visit_statement_list_owner,
	});
	program.body = /** @type {AST.Program} */ (wrapped).body;
}

/**
 * @param {AST.Program | AST.BlockStatement | AST.StaticBlock} node
 * @param {import('zimmerframe').Context<AST.Node, TransformContext>} context
 * @returns {AST.Node | void}
 */
function visit_statement_list_owner(node, { next, state }) {
	const walked = /** @type {typeof node} */ (next() ?? node);
	const statements = split_default_exported_components(/** @type {AST.Node[]} */ (walked.body));
	const hoisted = hoist_component_bindings(statements, state);
	if (hoisted === walked.body) {
		return walked === node ? undefined : walked;
	}
	return /** @type {AST.Node} */ ({ ...walked, body: hoisted });
}

/**
 * `export default function Card` binds `Card` in the module too, so a wrapped
 * one becomes `const Card = defineVaporComponent(…); export default Card;`.
 *
 * @param {AST.Node[]} statements
 * @returns {AST.Node[]}
 */
function split_default_exported_components(statements) {
	if (!statements.some((statement) => get_default_exported_component(statement))) {
		return statements;
	}
	return statements.flatMap((statement) => {
		const declaration = get_default_exported_component(statement);
		if (!declaration) return [statement];
		const name = /** @type {string} */ (declaration.metadata.vue_component_binding);
		return [declaration, b.export_default(b.id(name))];
	});
}

/**
 * @param {AST.Node} statement
 * @returns {AST.VariableDeclaration | null}
 */
function get_default_exported_component(statement) {
	const declaration = /** @type {AST.Node | null} */ (
		statement.type === 'ExportDefaultDeclaration' ? statement.declaration : null
	);
	return declaration?.type === 'VariableDeclaration' && declaration.metadata?.vue_component_binding
		? declaration
		: null;
}

/**
 * Wrapping turns a component's function declaration into a `const`, which,
 * unlike the declaration, is not hoisted. When a statement above the
 * component reads it while its scope runs, such as
 * `const registry = { inner: Inner }` above `function Inner`, move the
 * component above that statement, but only when that changes nothing else:
 * vue-jsx-vapor evaluates a destructured prop default that names a binding
 * (`{ label = PREFIX }`) when the component is defined, so a default that
 * reads a binding declared, assigned or mutated in the statements the
 * component would move past is reported instead (TSRX2028).
 *
 * Reads that run later or not at all do not count: inside a function, a class
 * instance field or method, a type, an `export { … }` specifier, a branch a
 * constant condition skips, or a scope with its own binding of the name.
 * Calls are not followed, so these still go wrong: a call or IIFE that runs a
 * function reading the component during module evaluation hits the constant
 * before it is initialized, and a call in the skipped statements to a
 * function that assigns a binding a default reads (`bump()` setting `size`)
 * runs after the moved component has captured the old value. So do a read
 * from another `case` of the `switch` that declares the component and a
 * circular import that reads it before this module finishes.
 *
 * @param {AST.Node[]} statements
 * @param {TransformContext} ctx
 * @returns {AST.Node[]}
 */
function hoist_component_bindings(statements, ctx) {
	let result = statements;
	/** @type {Map<string, AST.Literal['value']> | null} */
	let constants = null;
	for (const statement of statements) {
		const declaration = get_component_declaration(statement);
		if (!declaration) continue;
		const name = /** @type {string} */ (declaration.metadata.vue_component_binding);

		const index = result.indexOf(statement);
		constants ??= collect_literal_constants(statements);
		let first_read = -1;
		/** @type {AST.Node | null} */
		let read = null;
		for (let i = 0; i < index && !read; i += 1) {
			read = find_eager_read(result[i], name, /** @type {Map<string, any>} */ (constants));
			if (read) first_read = i;
		}
		if (!read) continue;

		const passed = result.slice(first_read, index);
		if (initializer_reads_declared(declaration, passed)) {
			error(
				`'${name}' is read here before its declaration. Vue TSRX compiles the component to a constant, which is not hoisted like a function, and moving its declaration above this read would change what its prop defaults read. Move the declaration of '${name}' above this read.`,
				ctx.filename,
				read,
				ctx.errors,
				ctx.comments,
				DIAGNOSTIC_CODES.TARGET_COMPONENT_READ_BEFORE_DECLARATION,
			);
			continue;
		}

		result = [...result.slice(0, first_read), statement, ...passed, ...result.slice(index + 1)];
	}
	return result;
}

/**
 * @param {AST.Node} statement
 * @returns {(AST.VariableDeclaration & { metadata: { vue_component_binding: string } }) | null}
 */
function get_component_declaration(statement) {
	const declaration =
		statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
	return declaration?.type === 'VariableDeclaration' && declaration.metadata?.vue_component_binding
		? /** @type {any} */ (declaration)
		: null;
}

/**
 * `const NAME = <literal>` declarations in a statement list, for skipping the
 * branches a constant condition never takes (`const DEBUG = false; if (DEBUG)`).
 *
 * @param {AST.Node[]} statements
 * @returns {Map<string, AST.Literal['value']>}
 */
function collect_literal_constants(statements) {
	/** @type {Map<string, AST.Literal['value']>} */
	const constants = new Map();
	for (const statement of statements) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const declarator of declaration.declarations) {
			if (declarator.id.type === 'Identifier' && declarator.init?.type === 'Literal') {
				constants.set(declarator.id.name, declarator.init.value);
			}
		}
	}
	return constants;
}

/**
 * @param {AST.Node | null | undefined} node
 * @param {Map<string, AST.Literal['value']>} constants
 * @returns {boolean | null} the condition's truthiness, or null when unknown
 */
function constant_truthiness(node, constants) {
	if (node?.type === 'Literal') return !!node.value || 'regex' in node;
	if (node?.type === 'Identifier') {
		if (node.name === 'undefined') return false;
		return constants.has(node.name) ? !!constants.get(node.name) : null;
	}
	if (node?.type === 'UnaryExpression' && node.operator === '!') {
		const value = constant_truthiness(node.argument, constants);
		return value === null ? null : !value;
	}
	return null;
}

/**
 * TypeScript nodes that hold runtime code. Every other `TS*` node is a type,
 * which is erased and never reads a binding.
 */
const RUNTIME_TS_NODE_TYPES = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSInstantiationExpression',
	'TSTypeAssertion',
	'TSEnumDeclaration',
	'TSEnumMember',
	'TSModuleDeclaration',
	'TSModuleBlock',
	'TSExportAssignment',
	'TSParameterProperty',
]);

/**
 * The first read of `name` that evaluating `root` performs: not inside a
 * function, a class instance field or method, a type or an `export { … }`
 * specifier, not in a branch a constant condition skips, and not in a scope
 * with its own binding of `name`.
 *
 * @param {AST.Node} root
 * @param {string} name
 * @param {Map<string, AST.Literal['value']>} constants
 * @returns {AST.Node | null}
 */
function find_eager_read(root, name, constants) {
	/** @type {AST.Node | null} */
	let found = null;
	// The literal constants visible where the walk is: a scope that declares
	// its own binding of a name forgets that name's value.
	let visible = constants;

	/**
	 * @param {AST.Node[]} bindings patterns or declarations a scope introduces
	 * @param {() => void} walk_scope
	 */
	const in_scope = (bindings, walk_scope) => {
		const saved = visible;
		visible = forget_declared(visible, bindings);
		walk_scope();
		visible = saved;
	};

	/**
	 * @param {unknown} value
	 * @param {AST.Node | undefined} parent
	 */
	const visit = (value, parent) => {
		if (found || !value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const child of value) visit(child, parent);
			return;
		}
		const node = /** @type {AST.Node} */ (value);
		if (typeof node.type !== 'string') return;

		switch (node.type) {
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
			case 'ExportSpecifier':
				return;
			case 'Identifier':
				if (node.name === name && parent && is_reference(node, parent)) found = node;
				return;
			case 'JSXIdentifier':
				if (
					node.name === name &&
					((parent?.type === 'JSXOpeningElement' && parent.name === node) ||
						(parent?.type === 'JSXMemberExpression' && parent.object === node))
				) {
					found = node;
				}
				return;
			case 'BlockStatement':
			case 'StaticBlock':
				if (declares_lexically(node.body, name)) return;
				in_scope(node.body, () => visit(node.body, node));
				return;
			case 'SwitchStatement': {
				visit(node.discriminant, node);
				const declarations = node.cases.flatMap((c) => c.consequent);
				if (!declares_lexically(declarations, name)) {
					in_scope(declarations, () => visit(node.cases, node));
				}
				return;
			}
			case 'ForStatement':
			case 'ForInStatement':
			case 'ForOfStatement': {
				const head = node.type === 'ForStatement' ? node.init : node.left;
				if (head?.type === 'VariableDeclaration' && head.kind !== 'var') {
					if (declares_lexically([head], name)) return;
					in_scope([head], () => visit_children(node));
					return;
				}
				break;
			}
			case 'CatchClause':
				if (node.param && get_pattern_names([node.param]).has(name)) return;
				if (node.param) {
					in_scope([node.param], () => visit(node.body, node));
					return;
				}
				break;
			case 'IfStatement': {
				visit(node.test, node);
				const truthy = constant_truthiness(node.test, visible);
				if (truthy !== false) visit(node.consequent, node);
				if (truthy !== true) visit(node.alternate, node);
				return;
			}
			case 'ConditionalExpression': {
				visit(node.test, node);
				const truthy = constant_truthiness(node.test, visible);
				if (truthy !== false) visit(node.consequent, node);
				if (truthy !== true) visit(node.alternate, node);
				return;
			}
			case 'LogicalExpression': {
				visit(node.left, node);
				const truthy = constant_truthiness(node.left, visible);
				if (
					!(node.operator === '&&' && truthy === false) &&
					!(node.operator === '||' && truthy === true)
				) {
					visit(node.right, node);
				}
				return;
			}
			case 'PropertyDefinition':
			case 'MethodDefinition':
				// An instance field runs when an instance is created, and a method
				// when it is called; only a computed key, a decorator or a static
				// field runs with the class.
				if (node.computed) visit(node.key, node);
				visit(/** @type {{ decorators?: AST.Node[] }} */ (node).decorators, node);
				if (node.type === 'PropertyDefinition' && node.static) visit(node.value, node);
				return;
		}

		if (node.type.startsWith('TS') && !RUNTIME_TS_NODE_TYPES.has(node.type)) return;
		visit_children(node);
	};

	/** @param {AST.Node} node */
	const visit_children = (node) => {
		const record = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (node));
		for (const key of Object.keys(record)) {
			if (key === 'metadata' || key === 'loc' || key === 'start' || key === 'end') continue;
			visit(record[key], node);
		}
	};

	visit(root, undefined);
	return found;
}

/**
 * `constants` without the names `bindings` declare, which a nested scope
 * shadows with values this pass does not know.
 *
 * @param {Map<string, AST.Literal['value']>} constants
 * @param {AST.Node[]} bindings statements, declarations or patterns
 * @returns {Map<string, AST.Literal['value']>}
 */
function forget_declared(constants, bindings) {
	if (constants.size === 0) return constants;
	/** @type {Set<string>} */
	const declared = new Set();
	for (const binding of bindings) {
		const node =
			binding.type === 'ExportNamedDeclaration' && binding.declaration
				? binding.declaration
				: binding;
		if (node.type === 'VariableDeclaration') {
			for (const declarator of node.declarations) collect_pattern_names(declarator.id, declared);
		} else if (
			(node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
			node.id
		) {
			declared.add(node.id.name);
		} else {
			collect_pattern_names(node, declared);
		}
	}
	if (![...declared].some((name) => constants.has(name))) return constants;
	const visible = new Map(constants);
	for (const name of declared) visible.delete(name);
	return visible;
}

/**
 * Whether a statement list declares `name` in its own scope.
 *
 * @param {AST.Node[]} statements
 * @param {string} name
 * @returns {boolean}
 */
function declares_lexically(statements, name) {
	for (const statement of statements) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' && statement.declaration
				? statement.declaration
				: statement;
		if (declaration.type === 'VariableDeclaration' && declaration.kind !== 'var') {
			if (get_pattern_names(declaration.declarations.map((d) => d.id)).has(name)) return true;
		} else if (
			(declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
			declaration.id?.name === name
		) {
			return true;
		}
	}
	return false;
}

/**
 * Whether defining the component reads a binding that `passed`, the
 * statements it would move above, declares, assigns or mutates. vue-jsx-vapor evaluates a
 * destructured prop default that names a binding when the component is
 * defined; every name read in the props pattern's defaults is counted.
 *
 * @param {AST.VariableDeclaration} declaration
 * @param {AST.Node[]} passed
 * @returns {boolean}
 */
function initializer_reads_declared(declaration, passed) {
	const call = /** @type {AST.CallExpression} */ (declaration.declarations[0]?.init);
	const fn = /** @type {AST.Function | undefined} */ (call?.arguments?.[0]);
	const reads = new Set();
	collect_default_reads(fn?.params?.[0], undefined, reads);
	if (reads.size === 0) return false;

	/** @type {Set<string>} */
	const declared = new Set();
	for (const statement of passed) {
		const node =
			(statement.type === 'ExportNamedDeclaration' ||
				statement.type === 'ExportDefaultDeclaration') &&
			statement.declaration
				? statement.declaration
				: statement;
		if (node.type === 'VariableDeclaration') {
			for (const declarator of node.declarations) collect_pattern_names(declarator.id, declared);
		} else if (
			(node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
			node.id
		) {
			declared.add(node.id.name);
		} else if (
			// An enum, a namespace or an `import x = …` alias compiles to a binding
			// it sets when it runs; an ambient or type-only one has no code.
			(node.type === 'TSEnumDeclaration' ||
				node.type === 'TSModuleDeclaration' ||
				(node.type === 'TSImportEqualsDeclaration' && node.importKind !== 'type')) &&
			!('declare' in node && node.declare) &&
			node.id.type === 'Identifier'
		) {
			declared.add(node.id.name);
		}
		collect_function_var_names(statement, declared);
		collect_assigned_names(statement, declared);
	}
	for (const read of reads) {
		if (declared.has(read)) return true;
	}
	return false;
}

/**
 * The bindings `node` assigns, updates or mutates the properties of, at any
 * depth: a default that reads one of them could see a different value once
 * the component moves above the assignment.
 *
 * @param {unknown} value
 * @param {Set<string>} names
 * @returns {void}
 */
function collect_assigned_names(value, names) {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const child of value) collect_assigned_names(child, names);
		return;
	}
	const node = /** @type {AST.Node} */ (value);
	if (typeof node.type !== 'string') return;
	if (node.type === 'AssignmentExpression') collect_assigned_target(node.left, names);
	else if (node.type === 'UpdateExpression') collect_assigned_target(node.argument, names);
	else if (node.type === 'UnaryExpression' && node.operator === 'delete') {
		collect_assigned_target(node.argument, names);
	} else if (
		(node.type === 'ForInStatement' || node.type === 'ForOfStatement') &&
		node.left.type !== 'VariableDeclaration'
	) {
		collect_assigned_target(node.left, names);
	}
	const record = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (node));
	for (const key of Object.keys(record)) {
		if (key === 'metadata' || key === 'loc' || key === 'start' || key === 'end') continue;
		collect_assigned_names(record[key], names);
	}
}

/**
 * The bindings an assignment target writes or mutates: each name in a
 * pattern, and the object a member target belongs to, seen through
 * parentheses, optional chains and TypeScript wrappers such as
 * `(cfg as any).size` and `cfg!.size`.
 *
 * @param {AST.Node | null | undefined} target
 * @param {Set<string>} names
 * @returns {void}
 */
function collect_assigned_target(target, names) {
	if (!target) return;
	switch (target.type) {
		case 'Identifier':
			names.add(target.name);
			return;
		case 'MemberExpression':
			collect_assigned_target(/** @type {AST.Node} */ (target.object), names);
			return;
		case 'RestElement':
			collect_assigned_target(target.argument, names);
			return;
		case 'AssignmentPattern':
			collect_assigned_target(target.left, names);
			return;
		case 'ArrayPattern':
			for (const element of target.elements) collect_assigned_target(element, names);
			return;
		case 'ObjectPattern':
			for (const property of target.properties) {
				collect_assigned_target(property.type === 'Property' ? property.value : property, names);
			}
			return;
	}
	if (
		(target.type === 'ParenthesizedExpression' ||
			target.type === 'ChainExpression' ||
			RUNTIME_TS_NODE_TYPES.has(target.type)) &&
		'expression' in target
	) {
		collect_assigned_target(/** @type {AST.Node} */ (target.expression), names);
	}
}

/**
 * The names read by the default values in a parameter pattern, outside
 * nested functions.
 *
 * @param {unknown} value
 * @param {AST.Node | undefined} parent
 * @param {Set<string>} reads
 * @param {boolean} [in_default]
 * @returns {void}
 */
function collect_default_reads(value, parent, reads, in_default = false) {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const child of value) collect_default_reads(child, parent, reads, in_default);
		return;
	}
	const node = /** @type {AST.Node} */ (value);
	if (typeof node.type !== 'string') return;
	if (
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression' ||
		(node.type.startsWith('TS') && !RUNTIME_TS_NODE_TYPES.has(node.type))
	) {
		return;
	}
	if (node.type === 'AssignmentPattern') {
		collect_default_reads(node.left, node, reads, in_default);
		collect_default_reads(node.right, node, reads, true);
		return;
	}
	if (node.type === 'Identifier') {
		if (in_default && parent && is_reference(node, parent)) reads.add(node.name);
		return;
	}
	const record = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (node));
	for (const key of Object.keys(record)) {
		if (key === 'metadata' || key === 'loc' || key === 'start' || key === 'end') continue;
		collect_default_reads(record[key], node, reads, in_default);
	}
}

/**
 * @param {AST.Function} node
 * @param {import('zimmerframe').Context<AST.Node, TransformContext>} context
 * @returns {AST.Node}
 */
function visit_function_component(node, { next, path, state }) {
	const inner = /** @type {AST.Function} */ (next() ?? node);
	return wrap_native_function_component(inner, node, state, path) ?? inner;
}

/**
 * @param {AST.Function} fn the walked function, which is a copy of `source`
 * when the walk replaced something inside it
 * @param {AST.Function} source the function as it appears in `path`
 * @param {TransformContext} ctx
 * @param {AST.Node[]} path
 * @returns {AST.Expression | AST.VariableDeclaration | null}
 */
function wrap_native_function_component(fn, source, ctx, path) {
	const parent = path.at(-1);
	const name = get_function_component_name(source, parent);
	if (!name || !/^[A-Z]/.test(name)) {
		return null;
	}

	if (!fn.metadata?.native_tsrx_function && !returns_local_jsx_binding(fn)) {
		return null;
	}

	ctx.needs_define_vapor_component = true;
	validate_prop_defaults(fn, ctx);

	const call = setLocation(
		create_define_vapor_component_call(
			function_declaration_to_expression(fn),
			fn.metadata?.generated_helpers || [],
			fn.metadata?.generated_statics || [],
		),
		has_location(fn) ? fn : undefined,
		true,
	);

	if (fn.type !== 'FunctionDeclaration') {
		return call;
	}

	if (!fn.id) {
		return call;
	}

	const declaration = setLocation(
		b.declaration('const', [b.declarator(create_generated_identifier(fn.id.name), call)]),
		has_location(fn) ? fn : undefined,
		true,
	);
	declaration.metadata = { ...declaration.metadata, vue_component_binding: fn.id.name };
	return declaration;
}

/**
 * vue-jsx-vapor turns the defaults in a component's destructured props
 * (`{ size = 1 }`) into prop options, and keeps only a string, number, boolean
 * or `null` literal, an identifier, an object or array literal, or a function,
 * seen through `as` and `!`. It drops any other default, such as `cfg.size`,
 * `-1`, `SIZE + 1` or a template literal, so the prop is `undefined` when the
 * caller leaves it out. Report each one (TSRX2029).
 *
 * @param {AST.Function} fn
 * @param {TransformContext} ctx
 * @returns {void}
 */
function validate_prop_defaults(fn, ctx) {
	const param = fn.params[0];
	if (param?.type !== 'ObjectPattern') return;
	for (const property of param.properties) {
		if (
			property.type !== 'Property' ||
			property.computed ||
			property.key.type !== 'Identifier' ||
			property.value.type !== 'AssignmentPattern' ||
			is_kept_prop_default(property.value.right)
		) {
			continue;
		}
		const name = property.key.name;
		const fallback = property.value.right;
		const written =
			ctx.source && fallback.start != null && fallback.end != null
				? ctx.source.slice(fallback.start, fallback.end)
				: null;
		const example =
			written && !written.includes('\n') ? `const ${name} = props.${name} ?? ${written}` : null;
		error(
			`Vue TSRX cannot keep this default for '${name}': vue-jsx-vapor turns destructured prop defaults into prop options and drops any default that is not a literal, an identifier, an object or array literal, or a function, so '${name}' would be undefined. Read the prop in the body instead${example ? `, for example \`${example}\`` : ''}.`,
			ctx.filename,
			fallback,
			ctx.errors,
			ctx.comments,
			DIAGNOSTIC_CODES.TARGET_PROP_DEFAULT_UNSUPPORTED,
		);
	}
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_kept_prop_default(node) {
	switch (node.type) {
		case 'TSAsExpression':
		case 'TSNonNullExpression':
		case 'ParenthesizedExpression':
			return is_kept_prop_default(/** @type {AST.Node} */ (node.expression));
		case 'Literal':
			// vue-jsx-vapor parses a regular expression or a bigint as its own
			// literal kind, which it drops.
			return !('regex' in node && node.regex) && !('bigint' in node && node.bigint);
		case 'Identifier':
		case 'ObjectExpression':
		case 'ArrayExpression':
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			return true;
		default:
			return false;
	}
}

/**
 * Whether `fn` builds its output in a local binding and returns that binding
 * (`const element = <div />; return element;`). The core transform marks only
 * functions that return JSX directly or have an `@{ … }` body as components.
 *
 * @param {AST.Function} fn
 * @returns {boolean}
 */
function returns_local_jsx_binding(fn) {
	if (fn.body?.type !== 'BlockStatement') {
		return false;
	}

	/** @type {{ jsx_bindings: Set<string>, returned: Set<string> }} */
	const state = { jsx_bindings: new Set(), returned: new Set() };
	walk(/** @type {AST.Node} */ (fn.body), state, {
		FunctionDeclaration() {},
		FunctionExpression() {},
		ArrowFunctionExpression() {},
		VariableDeclarator(node, { state, next }) {
			if (node.id.type === 'Identifier' && contains_jsx(node.init)) {
				state.jsx_bindings.add(node.id.name);
			}
			next();
		},
		AssignmentExpression(node, { state, next }) {
			if (node.left.type === 'Identifier' && contains_jsx(node.right)) {
				state.jsx_bindings.add(node.left.name);
			}
			next();
		},
		ReturnStatement(node, { state, next }) {
			if (node.argument?.type === 'Identifier') {
				state.returned.add(node.argument.name);
			}
			next();
		},
	});

	for (const name of state.returned) {
		if (state.jsx_bindings.has(name)) {
			return true;
		}
	}
	return false;
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function contains_jsx(node) {
	if (!node) {
		return false;
	}

	let found = false;
	walk(node, null, {
		FunctionDeclaration() {},
		FunctionExpression() {},
		ArrowFunctionExpression() {},
		JSXElement() {
			found = true;
		},
		JSXFragment() {
			found = true;
		},
	});
	return found;
}

/**
 * @param {AST.Function} fn
 * @param {AST.Node | undefined} parent
 * @returns {string | null}
 */
function get_function_component_name(fn, parent) {
	if (fn.type !== 'ArrowFunctionExpression' && fn.id?.type === 'Identifier') {
		return fn.id.name;
	}

	if (parent?.type === 'VariableDeclarator' && parent.init === fn) {
		return get_static_name(parent.id);
	}

	if (parent?.type === 'Property' && parent.value === fn) {
		return get_static_name(parent.key);
	}

	if (parent?.type === 'AssignmentExpression' && parent.right === fn) {
		return get_static_name(parent.left);
	}

	return null;
}

/**
 * @param {AST.Node | undefined} node
 * @returns {string | null}
 */
function get_static_name(node) {
	if (node?.type === 'Identifier') {
		return node.name;
	}
	if (node?.type === 'Literal' && typeof node.value === 'string') {
		return node.value;
	}
	if (node?.type === 'MemberExpression' && !node.computed) {
		return get_static_name(node.property);
	}
	return null;
}

/**
 * @param {AST.FunctionExpression | AST.ArrowFunctionExpression} fn_expression
 * @param {AST.Statement[]} generated_helpers
 * @param {AST.Statement[]} generated_statics
 * @returns {AST.CallExpression}
 */
function create_define_vapor_component_call(fn_expression, generated_helpers, generated_statics) {
	const call = b.call('defineVaporComponent', fn_expression);
	Object.assign(call.metadata, {
		generated_helpers,
		generated_statics,
	});
	return call;
}

/**
 * @param {AST.ForOfStatement} node
 * @param {AST.Pattern[]} loop_params
 * @param {AST.Statement[]} body_statements
 * @param {TransformContext} transform_context
 * @returns {ESTreeJSX.JSXExpressionContainer | null}
 */
function render_for_of_as_vapor_for(node, loop_params, body_statements, transform_context) {
	if (node.empty) {
		return null;
	}

	if (body_statements.length !== 1) {
		return null;
	}

	const statement = body_statements[0];
	if (statement?.type !== 'ReturnStatement' || !statement.argument) {
		return null;
	}

	const rendered = statement.argument;
	if (expression_can_skip_rendering(rendered)) {
		return render_for_of_as_flat_map(node, loop_params, rendered);
	}

	const key_expression = node.key
		? clone_ast_node(node.key)
		: (find_jsx_key_expression(rendered) ?? (node.index ? clone_ast_node(node.index) : null));

	const slot = key_expression
		? create_keyed_vapor_for_slot(loop_params, rendered)
		: { params: loop_params, body: rendered, expression: true };
	if (!slot) {
		return null;
	}

	transform_context.needs_vapor_for = true;

	if (key_expression) {
		strip_top_level_jsx_keys(slot.body);
	}

	const attributes = [
		b.jsx_attribute(b.jsx_id('in'), to_jsx_expression_container(clone_ast_node(node.right))),
	];

	if (key_expression) {
		attributes.push(
			b.jsx_attribute(
				b.jsx_id('getKey'),
				to_jsx_expression_container(create_loop_callback(loop_params, key_expression, true)),
			),
		);
	}

	return to_jsx_expression_container(
		b.jsx_element_fresh(
			b.jsx_opening_element(b.jsx_id('VaporFor'), attributes),
			b.jsx_closing_element(b.jsx_id('VaporFor')),
			[to_jsx_expression_container(create_loop_callback(slot.params, slot.body, slot.expression))],
		),
	);
}

/**
 * @param {AST.ForOfStatement} node
 * @param {AST.Pattern[]} loop_params
 * @param {AST.Expression} rendered
 * @returns {ESTreeJSX.JSXExpressionContainer}
 */
function render_for_of_as_flat_map(node, loop_params, rendered) {
	return to_jsx_expression_container(
		b.call(
			b.member(clone_ast_node(node.right), 'flatMap'),
			b.arrow(loop_params, b.block([b.return(to_array_render_expression(rendered))])),
		),
	);
}

/**
 * Loop bodies that can return `null` need the shared callback lowering so
 * `continue` truly skips the iteration.
 *
 * @param {AST.Node} node
 * @returns {boolean}
 */
function expression_can_skip_rendering(node) {
	if (!node || typeof node !== 'object') {
		return false;
	}

	if (node.type === 'Literal' && node.value === null) {
		return true;
	}

	if (node.type === 'ConditionalExpression') {
		return (
			expression_can_skip_rendering(node.consequent) ||
			expression_can_skip_rendering(node.alternate)
		);
	}

	if (node.type === 'LogicalExpression' && node.operator === '&&') {
		return true;
	}

	return false;
}

/**
 * @param {AST.Expression} node
 * @returns {AST.Expression}
 */
function to_array_render_expression(node) {
	if (node?.type === 'Literal' && node.value === null) {
		return b.array([]);
	}

	if (node?.type === 'ConditionalExpression') {
		return b.conditional(
			node.test,
			to_array_render_expression(node.consequent),
			to_array_render_expression(node.alternate),
		);
	}

	if (node?.type === 'LogicalExpression' && node.operator === '&&') {
		return b.conditional(node.left, to_array_render_expression(node.right), b.array([]));
	}

	return b.array([node]);
}

/**
 * @param {AST.Expression} node
 * @returns {AST.Expression | null}
 */
function find_jsx_key_expression(node) {
	if (node?.type !== 'JSXElement') {
		return null;
	}

	for (const attr of node.openingElement?.attributes || []) {
		if (
			attr.type === 'JSXAttribute' &&
			attr.name?.type === 'JSXIdentifier' &&
			attr.name.name === 'key'
		) {
			if (
				attr.value?.type === 'JSXExpressionContainer' &&
				attr.value.expression.type !== 'JSXEmptyExpression'
			) {
				return clone_ast_node(attr.value.expression);
			}
			return attr.value?.type === 'Literal' ? clone_ast_node(attr.value) : null;
		}
	}

	return null;
}

/**
 * @param {AST.Node} node
 * @returns {void}
 */
function strip_top_level_jsx_keys(node) {
	if (node?.type === 'JSXElement') {
		node.openingElement.attributes = (node.openingElement.attributes || []).filter(
			(attr) =>
				!(
					attr.type === 'JSXAttribute' &&
					attr.name?.type === 'JSXIdentifier' &&
					attr.name.name === 'key'
				),
		);
		return;
	}

	if (node?.type === 'JSXFragment') {
		for (const child of node.children || []) {
			strip_top_level_jsx_keys(child);
		}
	}
}

/**
 * @param {AST.Pattern[]} loop_params
 * @param {AST.Expression} body
 * @param {boolean} expression
 * @returns {AST.ArrowFunctionExpression}
 */
function create_loop_callback(loop_params, body, expression) {
	const callback = b.arrow(
		loop_params.map((param) => clone_ast_node(param)),
		body,
	);
	callback.expression = expression;
	return callback;
}

/**
 * @param {AST.Pattern[]} loop_params
 * @param {AST.Expression} rendered
 * @returns {{ params: AST.Pattern[], body: AST.Expression, expression: boolean } | null}
 */
function create_keyed_vapor_for_slot(loop_params, rendered) {
	if (loop_params[0]?.type === 'Identifier') {
		return {
			params: loop_params,
			body: rewrite_vapor_for_keyed_slot_refs(rendered, loop_params),
			expression: true,
		};
	}

	const item_ref = create_generated_identifier('__vapor_item');
	const item_ref_value = create_value_member_expression(item_ref);
	const replacements = create_pattern_replacements(loop_params[0], item_ref_value);
	if (!replacements) {
		return null;
	}

	const params = [item_ref, ...loop_params.slice(1)];
	const rewritten_rendered = rewrite_vapor_for_keyed_slot_refs(
		rendered,
		loop_params.slice(1),
		replacements,
	);

	return {
		params,
		body: rewritten_rendered,
		expression: true,
	};
}

/**
 * Vue's `VaporFor` passes plain item values to unkeyed slots, but keyed slots
 * receive shallow refs so row instances can update in place. Match that runtime
 * shape by reading loop params through `.value` inside the slot body.
 *
 * @param {AST.Expression} node
 * @param {AST.Pattern[]} loop_params
 * @param {Map<string, AST.Expression>} [replacements]
 * @returns {AST.Expression}
 */
function rewrite_vapor_for_keyed_slot_refs(node, loop_params, replacements = new Map()) {
	const loop_param_names = new Set();
	for (const param of loop_params) {
		collect_pattern_names(param, loop_param_names);
	}

	if (loop_param_names.size === 0 && replacements.size === 0) {
		return node;
	}

	return /** @type {AST.Expression} */ (
		walk(
			node,
			{ loop_param_names, shadowed_names: new Set() },
			{
				Identifier(identifier, { path, state, next }) {
					const parent = path.at(-1);
					if (
						(state.loop_param_names.has(identifier.name) || replacements.has(identifier.name)) &&
						!state.shadowed_names.has(identifier.name) &&
						parent &&
						is_runtime_reference(identifier, parent)
					) {
						const replacement = replacements.get(identifier.name);
						if (replacement) {
							return clone_ast_node(replacement);
						}
						return create_value_member_expression(identifier);
					}

					return next();
				},
				FunctionDeclaration: rewrite_function_shadowed_refs,
				FunctionExpression: rewrite_function_shadowed_refs,
				ArrowFunctionExpression: rewrite_function_shadowed_refs,
				BlockStatement: rewrite_block_shadowed_refs,
			},
		)
	);
}

/**
 * @param {AST.Identifier} identifier
 * @param {AST.Node} parent
 * @returns {boolean}
 */
function is_runtime_reference(identifier, parent) {
	if (parent.type === 'JSXExpressionContainer') {
		return parent.expression === identifier;
	}
	if (parent.type === 'JSXAttribute') {
		return (
			parent.value?.type === 'JSXExpressionContainer' && parent.value.expression === identifier
		);
	}
	return is_reference(identifier, parent);
}

/**
 * @param {AST.Pattern} pattern
 * @param {AST.Expression} source
 * @returns {Map<string, AST.Expression> | null}
 */
function create_pattern_replacements(pattern, source) {
	/** @type {Map<string, AST.Expression>} */
	const replacements = new Map();
	return collect_pattern_replacements(pattern, source, replacements) ? replacements : null;
}

/**
 * @param {AST.Pattern | null} pattern
 * @param {AST.Expression} source
 * @param {Map<string, AST.Expression>} replacements
 * @returns {boolean}
 */
function collect_pattern_replacements(pattern, source, replacements) {
	if (!pattern) return true;

	switch (pattern.type) {
		case 'Identifier':
			replacements.set(pattern.name, source);
			return true;
		case 'ObjectPattern':
			for (const property of pattern.properties || []) {
				if (property.type === 'RestElement' || property.computed) {
					return false;
				}
				if (
					property.type !== 'Property' ||
					!collect_pattern_replacements(
						property.value,
						create_property_member_expression(source, property.key),
						replacements,
					)
				) {
					return false;
				}
			}
			return true;
		case 'ArrayPattern':
			for (let index = 0; index < (pattern.elements || []).length; index++) {
				const element = pattern.elements[index];
				if (
					element &&
					!collect_pattern_replacements(
						element,
						create_index_member_expression(source, index),
						replacements,
					)
				) {
					return false;
				}
			}
			return true;
		default:
			return false;
	}
}

/**
 * @param {AST.Function} node
 * @param {import('zimmerframe').Context<AST.Node, { loop_param_names: Set<string>, shadowed_names: Set<string> }>} context
 * @returns {AST.Node | void}
 */
function rewrite_function_shadowed_refs(node, { state, next }) {
	const shadowed_names = new Set(state.shadowed_names);
	if (node.type !== 'ArrowFunctionExpression' && node.id) {
		collect_pattern_names(node.id, shadowed_names);
	}
	for (const param of node.params || []) {
		collect_pattern_names(param, shadowed_names);
	}
	collect_function_var_names(node.body, shadowed_names);
	return next({ ...state, shadowed_names });
}

/**
 * @param {AST.BlockStatement} node
 * @param {import('zimmerframe').Context<AST.Node, { loop_param_names: Set<string>, shadowed_names: Set<string> }>} context
 * @returns {AST.Node | void}
 */
function rewrite_block_shadowed_refs(node, { state, next }) {
	const shadowed_names = new Set(state.shadowed_names);
	collect_block_lexical_names(node.body, shadowed_names);
	return next({ ...state, shadowed_names });
}

/**
 * @param {AST.Statement[]} statements
 * @param {Set<string>} names
 * @returns {void}
 */
function collect_block_lexical_names(statements, names) {
	for (const statement of statements || []) {
		if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
			for (const declaration of statement.declarations || []) {
				collect_pattern_names(declaration.id, names);
			}
			continue;
		}

		if (
			(statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') &&
			statement.id
		) {
			collect_pattern_names(statement.id, names);
		}
	}
}

/**
 * @param {AST.Node | AST.Node[]} node
 * @param {Set<string>} names
 * @returns {void}
 */
function collect_function_var_names(node, names) {
	if (!node || typeof node !== 'object') return;

	if (Array.isArray(node)) {
		for (const child of node) {
			collect_function_var_names(child, names);
		}
		return;
	}

	if (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'ClassDeclaration' ||
		node.type === 'ClassExpression' ||
		// A namespace's `var`s are its own.
		node.type === 'TSModuleDeclaration'
	) {
		return;
	}

	if (node.type === 'VariableDeclaration' && node.kind === 'var') {
		for (const declaration of node.declarations || []) {
			collect_pattern_names(declaration.id, names);
		}
	}

	const traversable = /** @type {AST.TraversableAstNode} */ (node);
	for (const key of Object.keys(traversable)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') {
			continue;
		}
		const value = traversable[key];
		if (Array.isArray(value)) {
			for (const child of value) {
				if (child && typeof child === 'object' && 'type' in child) {
					collect_function_var_names(/** @type {AST.Node} */ (child), names);
				}
			}
		} else if (value && typeof value === 'object' && 'type' in value) {
			collect_function_var_names(/** @type {AST.Node} */ (value), names);
		}
	}
}

/**
 * @param {AST.Node | null} node
 * @param {Set<string>} names
 * @returns {void}
 */
function collect_pattern_names(node, names) {
	if (!node) return;

	switch (node.type) {
		case 'Identifier':
			names.add(node.name);
			break;
		case 'RestElement':
			collect_pattern_names(node.argument, names);
			break;
		case 'AssignmentPattern':
			collect_pattern_names(node.left, names);
			break;
		case 'ArrayPattern':
			for (const element of node.elements || []) {
				collect_pattern_names(element, names);
			}
			break;
		case 'ObjectPattern':
			for (const property of node.properties || []) {
				collect_pattern_names(property, names);
			}
			break;
		case 'Property':
			collect_pattern_names(node.value, names);
			break;
	}
}

/**
 * @param {AST.Expression} object
 * @param {AST.Expression | AST.PrivateIdentifier} key
 * @returns {AST.MemberExpression}
 */
function create_property_member_expression(object, key) {
	if (key?.type === 'Identifier') {
		return create_member_expression(clone_ast_node(object), clone_identifier(key), false, key);
	}

	return create_member_expression(clone_ast_node(object), clone_ast_node(key), true, key);
}

/**
 * @param {AST.Expression} object
 * @param {number} index
 * @returns {AST.MemberExpression}
 */
function create_index_member_expression(object, index) {
	return create_member_expression(clone_ast_node(object), b.literal(index), true, object);
}

/**
 * @param {AST.Identifier} identifier
 * @returns {AST.MemberExpression}
 */
function create_value_member_expression(identifier) {
	return create_member_expression(clone_identifier(identifier), 'value', false, identifier);
}

/**
 * @param {AST.Expression} object
 * @param {string | AST.Expression | AST.PrivateIdentifier} property
 * @param {boolean} computed
 * @param {AST.Node} source_node
 * @returns {AST.MemberExpression}
 */
function create_member_expression(object, property, computed, source_node) {
	return b.member(
		object,
		property,
		computed,
		false,
		has_location(source_node) ? source_node : undefined,
	);
}

/**
 * @param {AST.Function} fn
 * @returns {AST.FunctionExpression | AST.ArrowFunctionExpression}
 */
function function_declaration_to_expression(fn) {
	if (fn.type === 'ArrowFunctionExpression') {
		return fn;
	}

	const expression = b.function(
		fn.id ?? null,
		fn.params,
		fn.body,
		fn.async,
		fn.typeParameters,
		has_location(fn) ? fn : undefined,
	);
	expression.generator = fn.generator;
	expression.metadata = { ...(fn.metadata || {}), path: fn.metadata?.path || [] };
	return expression;
}

/**
 * Vue's JSX transform treats some prop names ending in `ref` as template-ref
 * sugar on components. Keep those as ordinary runtime props by hiding the
 * static prop name behind an object spread before Vue sees the JSX. Type-only
 * virtual TSX skips that spread so Volar can offer completions on the real
 * component prop name.
 *
 * @param {ESTreeJSX.JSXAttributeNode[]} attrs
 * @param {TransformContext} transform_context
 * @returns {ESTreeJSX.JSXAttributeNode[]}
 */
function preprocess_ref_attributes(attrs, transform_context) {
	const result = [];
	for (const attr of attrs) {
		if (!transform_context.typeOnly && is_vue_named_ref_attribute(attr)) {
			result.push(create_vue_named_ref_spread(attr));
			continue;
		}
		result.push(attr);
	}
	return result;
}

/**
 * @param {ESTreeJSX.JSXAttributeNode} attr
 * @returns {boolean}
 */
function is_vue_named_ref_attribute(attr) {
	const attr_name = get_vue_attribute_name(attr);
	const value = get_vue_attribute_expression(attr);
	return !!(
		attr_name &&
		attr_name !== 'ref' &&
		attr.type === 'JSXAttribute' &&
		value &&
		is_vue_ref_prop_name(attr_name)
	);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function is_vue_ref_prop_name(name) {
	return /(?:^|[-_])ref$/i.test(name) || /Ref$/.test(name);
}

/**
 * @param {ESTreeJSX.JSXAttributeNode} attr
 * @returns {ESTreeJSX.JSXAttributeNode}
 */
function create_vue_named_ref_spread(attr) {
	if (attr.type === 'JSXSpreadAttribute') return attr;
	const attr_name = get_vue_attribute_name(attr);
	const value = get_vue_attribute_expression(attr);
	if (attr_name === null) return attr;
	const prop = b.prop('init', b.key(attr_name), value ?? b.literal(true), false, false);
	const source = has_location(attr) ? attr : undefined;
	return b.jsx_spread_attribute(b.object([prop], source), source);
}

/**
 * @param {ESTreeJSX.JSXAttributeNode} attr
 * @returns {string | null}
 */
function get_vue_attribute_name(attr) {
	if (attr.type === 'JSXAttribute') {
		return attr.name?.type === 'JSXIdentifier' ? attr.name.name : null;
	}
	return null;
}

/**
 * @param {ESTreeJSX.JSXAttributeNode} attr
 * @returns {AST.Expression | ESTreeJSX.JSXEmptyExpression | null}
 */
function get_vue_attribute_expression(attr) {
	if (attr.type === 'JSXSpreadAttribute') return attr.argument;
	const value = attr.value;
	return value?.type === 'JSXExpressionContainer' ? value.expression : value;
}

/**
 * @param {AST.TSRXJSXElement} node
 * @param {AST.Node[]} walked_children
 * @param {AST.Node[]} raw_children
 * @param {ESTreeJSX.JSXAttributeNode[]} attributes
 * @returns {{ children: ESTreeJSX.JSXElement['children']; selfClosing?: boolean } | null}
 */
function rewrite_host_text_children(node, walked_children, raw_children, attributes) {
	const source_children = raw_children || walked_children;
	const is_composite = is_component_like_element(node);

	if (
		!is_composite &&
		source_children.length === 1 &&
		/** @type {{ type: string }} */ (source_children[0]).type === 'Text'
	) {
		return null;
	}

	return null;
}

/**
 * @param {AST.Expression | ESTreeJSX.JSXEmptyExpression} expression
 * @param {AST.Node} [source_node]
 * @returns {ESTreeJSX.JSXExpressionContainer}
 */
function to_jsx_expression_container(expression, source_node = expression) {
	return b.jsx_expression_container(
		expression,
		has_location(source_node) ? source_node : undefined,
	);
}

/**
 * @param {import('estree').Program} program
 * @param {TransformContext} transform_context
 * @returns {void}
 */
function inject_vue_imports(program, transform_context) {
	const merge_refs_source = transform_context.platform.imports.mergeRefs;
	const ref_prop_source = transform_context.platform.imports.refProp;

	if (transform_context.needs_define_vapor_component) {
		ensure_named_import(program, 'vue-jsx-vapor', 'defineVaporComponent');
	}

	if (transform_context.needs_vapor_for) {
		ensure_named_import(program, 'vue-jsx-vapor', 'VaporFor');
	}

	if (transform_context.needs_suspense) {
		ensure_named_import(program, 'vue', 'Suspense');
	}

	if (transform_context.needs_error_boundary) {
		ensure_named_import(
			program,
			transform_context.platform.imports.errorBoundary,
			'TsrxErrorBoundary',
		);
	}

	if (transform_context.needs_merge_refs && merge_refs_source) {
		ensure_named_import(program, merge_refs_source, 'mergeRefs', MERGE_REFS_INTERNAL_NAME);
	}

	if (transform_context.needs_normalize_spread_props && ref_prop_source) {
		ensure_named_import(
			program,
			ref_prop_source,
			'normalize_spread_props',
			NORMALIZE_SPREAD_PROPS_INTERNAL_NAME,
		);
	}

	if (transform_context.needs_normalize_spread_props_for_ref_attr && ref_prop_source) {
		ensure_named_import(
			program,
			ref_prop_source,
			'normalize_spread_props_for_ref_attr',
			NORMALIZE_SPREAD_PROPS_FOR_REF_ATTR_INTERNAL_NAME,
		);
	}
}

/**
 * @param {import('estree').Program} program
 * @param {string} source
 * @param {string} name
 * @param {string} [local]
 * @returns {void}
 */
function ensure_named_import(program, source, name, local = name) {
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source?.value !== source) {
			continue;
		}

		const has_specifier = statement.specifiers.some(
			(specifier) =>
				specifier.type === 'ImportSpecifier' &&
				specifier.imported?.type === 'Identifier' &&
				specifier.imported.name === name &&
				specifier.local?.name === local,
		);

		if (!has_specifier) {
			statement.specifiers.push(create_import_specifier(name, local));
		}

		return;
	}

	program.body.unshift(b.imports([[name, local, 'value']], source));
}

/**
 * @param {string} name
 * @param {string} [local]
 * @returns {AST.ImportSpecifier}
 */
function create_import_specifier(name, local = name) {
	return b.import_specifier(name, local, 'value');
}
