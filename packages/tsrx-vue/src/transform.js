/** @import * as AST from 'estree' */
/** @import * as ESTreeJSX from 'estree-jsx' */
/** @import { JsxHelperComponent, JsxPlatform, JsxTransformContext as TransformContext } from '@tsrx/core/types' */

import { walk } from 'zimmerframe';
import is_reference from 'is-reference';
import { find_deferred_template_awaits, find_deferred_template_yields } from './template-yield.js';
import {
	builders as b,
	addJsxSetupDeclaration,
	clone_ast_node,
	clone_identifier,
	createHookSafeHelper,
	create_generated_identifier,
	createJsxTransform,
	destructure_for_of_item,
	ERROR_BOUNDARY_INTERNAL_NAME,
	error,
	findFirstTopLevelAwait,
	FRAGMENT_INTERNAL_NAME,
	forOfPatternReadsIndex as for_of_pattern_reads_index,
	has_location,
	IDENTIFIER_OBFUSCATION_PREFIX,
	insertAfterDirectives,
	is_component_like_element,
	isFunctionNode,
	JOIN_SCOPE_CLASS_INTERNAL_NAME,
	MAP_ITERABLE_ASYNC_INTERNAL_NAME,
	MAP_ITERABLE_INTERNAL_NAME,
	MERGE_REFS_INTERNAL_NAME,
	NORMALIZE_SPREAD_PROPS_FOR_REF_ATTR_INTERNAL_NAME,
	NORMALIZE_SPREAD_PROPS_INTERNAL_NAME,
	setLocation,
	SUSPENSE_INTERNAL_NAME,
	switchStatementToJsxChild,
	TSRX_ERRORS,
} from '@tsrx/core';

/** The local name of Vue's `computed` in a keyed slot that destructures its item. */
const VUE_COMPUTED_INTERNAL_NAME = IDENTIFIER_OBFUSCATION_PREFIX + 'vapor_computed';
/** The `computed` such a slot destructures its item in, numbered per slot. */
const VAPOR_BINDINGS_NAME = IDENTIFIER_OBFUSCATION_PREFIX + 'vapor_bindings';
/**
 * How many slots each compile has given a bindings `computed`, so each slot's
 * has its own name and a nested slot's can't capture the outer slot's names.
 * @type {WeakMap<TransformContext, number>}
 */
const vapor_bindings_counts = new WeakMap();

/**
 * Local name for the `VaporFor` the transform imports for `@for`, so an
 * authored binding named `VaporFor` neither collides with the import nor
 * replaces the loop. `defineVaporComponent` keeps its public name:
 * vue-jsx-vapor finds components by that callee name for its macros, HMR,
 * SSR and interop output.
 */
const VAPOR_FOR_INTERNAL_NAME = '__VaporFor';

/**
 * Local name for the runtime helper that hands `VaporFor` the source's items.
 * It has the reserved prefix, so no authored name, such as an outer loop's item
 * that a keyed row reads through `.value`, can take it.
 */
const FOR_ITEMS_INTERNAL_NAME = IDENTIFIER_OBFUSCATION_PREFIX + 'for_items';
/** The `computed` that walks the source of a `VaporFor` loop with `@empty`. */
const VAPOR_ITEMS_NAME = IDENTIFIER_OBFUSCATION_PREFIX + 'vapor_items';
/** The `computed` that picks the case of a `@switch` row, numbered per row. */
const SWITCH_CASE_NAME = IDENTIFIER_OBFUSCATION_PREFIX + 'case';
/** What a `@switch` row's `computed` caught. */
const SWITCH_ERROR_NAME = IDENTIFIER_OBFUSCATION_PREFIX + 'error';
/** The value a `@switch` row's `computed` held before it runs again. */
const SWITCH_PREVIOUS_NAME = IDENTIFIER_OBFUSCATION_PREFIX + 'previous';
/**
 * How many `@switch` rows each compile has lowered, so a nested one's
 * `computed` can't capture an outer one's name.
 * @type {WeakMap<TransformContext, number>}
 */
const switch_counts = new WeakMap();
/**
 * The metadata flag on a `@switch`'s shared lowering, which survives the
 * clones a `VaporFor` row goes through.
 */
const VAPOR_SWITCH_METADATA = 'vapor_switch';
/** The most cases a `@switch` row turns into a chain of `createIf`s. */
const MAX_SWITCH_ROW_CASES = 64;

const DEFINE_VAPOR_COMPONENT = 'defineVaporComponent';

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
		forOfIterableHelper: '@tsrx/vue/runtime/iterable',
	},
	directRuntimeImports: {
		errorBoundary: '@tsrx/vue-runtime/error-boundary',
		mergeRefs: '@tsrx/vue-runtime/ref',
		refProp: '@tsrx/vue-runtime/ref',
		forOfIterableHelper: '@tsrx/vue-runtime/iterable',
	},
	jsx: {
		rewriteClassAttr: false,
		// `class` also takes an object or a list.
		classValue: 'list',
		// A static `className` renders as a `classname` attribute.
		rewriteClassNameAttr: true,
		multiRefStrategy: 'merge-refs',
		hostSpreadRefStrategy: 'explicit-ref-attr',
		// vue-jsx-vapor evaluates a spread inside the element's render effect and
		// sets its template ref after the props, so a bag bound in place is read
		// again when its expression changes and is assigned before its `ref`.
		hostSpreadRefBinding: 'in-place',
		refAfterProps: true,
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
			needs_use_slots: false,
			needs_pending_body: false,
		}),
		wrapHelperComponent(helper_fn, helper_id, ctx, source_node) {
			ctx.needs_define_vapor_component = true;
			return wrap_helper_component(helper_fn, helper_id, source_node, ctx);
		},
		canHoistStaticNode() {
			// Vapor JSX evaluates to a DOM node, so a module-level static would be
			// one node that every use moves into place. vue-jsx-vapor already
			// hoists the parsed template and clones it per evaluation.
			return false;
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
		renderForOf: (node, loop_params, body_statements, ctx, get_empty_statements) =>
			render_for_of_as_vapor_for(node, loop_params, body_statements, ctx, get_empty_statements),
		controlFlow: {
			switchStatement: render_switch_statement,
		},
		createPendingBoundary(try_content, fallback_content, ctx) {
			return create_vapor_pending_boundary(try_content, fallback_content, ctx);
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
				: create_error_boundary_slot(raw_try_content, fallback_fn, node);
			const suspense = create_vapor_pending_boundary_from_default_slot(
				default_slot,
				fallback_content,
				ctx,
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
		findDeferredTemplateYields: find_deferred_template_yields,
		findDeferredTemplateAwaits: find_deferred_template_awaits,
		validateComponentAwait(await_expression, _component, ctx) {
			error(
				TSRX_ERRORS.TARGET_COMPONENT_AWAIT_UNSUPPORTED(ctx.platform.name),
				ctx?.filename ?? null,
				await_expression,
				ctx?.errors,
				ctx?.comments,
			);
		},
		injectImports(program, ctx) {
			wrap_native_function_components(program, ctx);
			inject_vue_imports(program, ctx);
		},
	},
};

export const transform = createJsxTransform(vue_platform);

/** Local name for the `TsrxPendingBody` that renders a `@pending` body. */
const PENDING_BODY_INTERNAL_NAME = '__TsrxPendingBody';

/**
 * @param {ESTreeJSX.JSXRenderNode} try_content
 * @param {ESTreeJSX.JSXRenderNode} fallback_content
 * @param {TransformContext} ctx
 * @returns {AST.TSRXJSXElement}
 */
function create_vapor_pending_boundary(try_content, fallback_content, ctx) {
	return create_vapor_pending_boundary_from_default_slot(
		b.arrow([], jsx_child_to_expression(try_content)),
		fallback_content,
		ctx,
	);
}

/**
 * @param {AST.ArrowFunctionExpression} default_slot
 * @param {ESTreeJSX.JSXRenderNode} fallback_content
 * @param {TransformContext} ctx
 * @returns {AST.TSRXJSXElement}
 */
function create_vapor_pending_boundary_from_default_slot(default_slot, fallback_content, ctx) {
	const fallback_expression = jsx_child_to_expression(fallback_content);
	const slots_properties = [b.init('default', default_slot)];
	// Vue's stable-slots flag isn't a slot, so `Suspense`'s JSX slot types reject
	// it in the type-only output.
	if (!ctx.typeOnly) slots_properties.unshift(b.init('_', b.literal(1)));

	if (fallback_expression.type !== 'Literal' || fallback_expression.value !== null) {
		slots_properties.push(
			b.init(
				'fallback',
				b.arrow(
					[],
					ctx.typeOnly ? fallback_expression : create_pending_body(fallback_expression, ctx),
				),
			),
		);
	}

	const slots = b.object(slots_properties);

	const boundary = b.jsx_element_fresh(
		b.jsx_opening_element(
			b.jsx_id(SUSPENSE_INTERNAL_NAME),
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
 * Render the try body in the Suspense default slot through its own error
 * boundary. Suspense mounts its default content after the outer boundary has
 * rendered, so an error thrown there, while setting up or from a rejected
 * async child, has to be caught inside the slot. A boundary there, unlike a
 * plain `try`, also gives `@catch` a `reset` that renders the body again.
 *
 * @param {ESTreeJSX.JSXRenderNode} content
 * @param {AST.ArrowFunctionExpression} fallback_fn
 * @param {AST.TryStatement} source_try
 * @returns {AST.ArrowFunctionExpression}
 */
function create_error_boundary_slot(content, fallback_fn, source_try) {
	const boundary = create_vapor_error_boundary(content, clone_ast_node(fallback_fn, false));
	return b.arrow(
		[],
		setLocation(boundary, has_location(source_try) ? source_try : undefined, true),
	);
}

/**
 * Render a `@pending` body through `TsrxPendingBody`. `Suspense` then creates
 * it only while it shows its fallback, and a throw in it reaches the nearest
 * `@catch` instead of ending the mount.
 *
 * @param {AST.Expression} fallback_expression
 * @param {TransformContext} ctx
 * @returns {AST.TSRXJSXElement}
 */
function create_pending_body(fallback_expression, ctx) {
	ctx.needs_pending_body = true;
	return b.jsx_element_fresh(
		b.jsx_opening_element(
			b.jsx_id(PENDING_BODY_INTERNAL_NAME),
			[
				b.jsx_attribute(
					b.jsx_id('content'),
					to_jsx_expression_container(b.arrow([], fallback_expression)),
				),
			],
			true,
		),
		null,
		[],
	);
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
			b.jsx_id(ERROR_BOUNDARY_INTERNAL_NAME),
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
 * @param {TransformContext} ctx
 * @returns {AST.VariableDeclaration}
 */
function wrap_helper_component(helper_fn, helper_id, source_node, ctx) {
	if (!ctx.typeOnly) {
		helper_fn = render_returned_loops(helper_fn);
	}
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
				TSRX_ERRORS.TARGET_COMPONENT_READ_BEFORE_DECLARATION(ctx.platform.name, name),
				ctx.filename,
				read,
				ctx.errors,
				ctx.comments,
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
 * A Vapor component's setup runs once, so a component that returns the
 * `map_iterable` call of an `@for` (one whose body has setup statements)
 * renders the rows it gave at mount and never again. The call is put in a
 * fragment, which vue-jsx-vapor evaluates in an effect, as it does the same
 * loop inside an element. Only the component's own returns change, not those
 * of functions in it. Rows inherit none of the component's attributes either
 * way.
 *
 * @template {AST.Function} F
 * @param {F} fn
 * @returns {F}
 */
function render_returned_loops(fn) {
	if (fn.body?.type !== 'BlockStatement') {
		return fn;
	}
	const body = walk(/** @type {AST.Node} */ (fn.body), null, {
		FunctionDeclaration() {},
		FunctionExpression() {},
		ArrowFunctionExpression() {},
		ClassDeclaration() {},
		ClassExpression() {},
		ReturnStatement(node) {
			const output = node.argument;
			if (
				output?.type === 'CallExpression' &&
				output.callee.type === 'Identifier' &&
				output.callee.name === MAP_ITERABLE_INTERNAL_NAME
			) {
				return {
					...node,
					argument: /** @type {AST.Expression} */ (
						/** @type {unknown} */ (b.jsx_fragment([to_jsx_expression_container(output)]))
					),
				};
			}
		},
	});
	return body === fn.body ? fn : { ...fn, body: /** @type {AST.BlockStatement} */ (body) };
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
	validate_props_param(fn, ctx);
	if (!ctx.typeOnly) {
		fn = read_children_from_default_slot(fn, name, ctx);
		fn = render_returned_loops(fn);
	}

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
			// A `children` default moves out of the props pattern into its reads
			// (see `read_children_from_default_slot`), so the macro never sees it.
			property.key.name === 'children' ||
			property.value.type !== 'AssignmentPattern' ||
			is_kept_prop_default(property.value.right)
		) {
			continue;
		}
		const name = property.key.name;
		error(
			TSRX_ERRORS.TARGET_PROP_DEFAULT_UNSUPPORTED(
				ctx.platform.name,
				name,
				get_prop_read_example(property.value, `props.${name}`, ctx),
			),
			ctx.filename,
			property.value.right,
			ctx.errors,
			ctx.comments,
		);
	}
}

/**
 * Check a component's props parameter the way vue-jsx-vapor's props macro
 * reads it (TSRX2031, and TSRX2029 for a default inside a prop):
 *
 * - It skips a props parameter with a default (`{ s } = {}`), so the
 *   component gets no prop options and Vue passes it no props.
 * - It reads destructured props by name, and reads only keys that are names:
 *   it reads `{ [k]: v }` as the prop `k`, whatever `k` holds, and leaves out
 *   any other key (`{ 'a-b': v }`, `{ [1]: v }`), so its binding never gets
 *   the prop. That holds at every level, and a pattern with no key it reads
 *   also gets no prop options.
 * - Inside a prop, it applies a default only when the whole prop is missing.
 * - It doesn't keep a rest element inside a prop as the rest of that prop:
 *   the pattern's last rest element gets the component's attrs, an array's
 *   gets the whole array, and any other gets the rest as it was at setup.
 *
 * @param {AST.Function} fn
 * @param {TransformContext} ctx
 * @returns {void}
 */
function validate_props_param(fn, ctx) {
	const param = fn.params[0];
	if (param?.type === 'AssignmentPattern') {
		error(
			TSRX_ERRORS.TARGET_PROPS_PARAM_DEFAULT(ctx.platform.name, get_inline_text(param.right, ctx)),
			ctx.filename,
			param.right,
			ctx.errors,
			ctx.comments,
		);
		return;
	}
	if (param?.type === 'ObjectPattern') validate_prop_keys(param, 'props', false, ctx);
}

/**
 * @param {AST.RestElement} rest a rest element inside a prop
 * @param {string} object how the body reads the value it destructures
 * @param {TransformContext} ctx
 * @returns {void}
 */
function report_prop_rest(rest, object, ctx) {
	error(
		TSRX_ERRORS.TARGET_PROP_NESTED_REST(ctx.platform.name, get_prop_path(object)),
		ctx.filename,
		rest,
		ctx.errors,
		ctx.comments,
	);
}

/**
 * @param {AST.ObjectPattern} pattern
 * @param {string} object how the body reads the value the pattern destructures
 * @param {boolean} nested whether the pattern is inside a prop
 * @param {TransformContext} ctx
 * @returns {void}
 */
function validate_prop_keys(pattern, object, nested, ctx) {
	for (const property of pattern.properties) {
		if (property.type === 'RestElement') {
			// The pattern's own rest element gets the attrs: the props it doesn't
			// declare.
			if (nested) report_prop_rest(property, object, ctx);
			continue;
		}
		const key = property.key;
		if (!property.computed && key.type === 'Identifier') {
			validate_prop_value(
				property.value,
				join_prop_member(object, `.${key.name}`, nested),
				nested,
				ctx,
			);
			continue;
		}
		const written = get_inline_text(key, ctx);
		const example = get_prop_read_example(
			property.value,
			join_prop_member(object, get_prop_member_access(key, written, !nested), nested),
			ctx,
		);
		error(
			property.computed && key.type === 'Identifier'
				? TSRX_ERRORS.TARGET_PROP_KEY_COMPUTED(ctx.platform.name, key.name, example)
				: TSRX_ERRORS.TARGET_PROP_KEY_UNSUPPORTED(
						ctx.platform.name,
						property.computed ? `[${written}]` : written,
						example,
					),
			ctx.filename,
			key,
			ctx.errors,
			ctx.comments,
		);
	}
}

/**
 * Check the pattern a prop, or a value inside one, is destructured with. A
 * prop's own default is checked as TSRX2029 by `validate_prop_defaults`.
 *
 * @param {AST.Pattern} pattern
 * @param {string} object how the body reads the value
 * @param {boolean} nested whether the value is inside a prop
 * @param {TransformContext} ctx
 * @returns {void}
 */
function validate_prop_value(pattern, object, nested, ctx) {
	if (pattern.type === 'AssignmentPattern') {
		if (nested) {
			error(
				TSRX_ERRORS.TARGET_PROP_NESTED_DEFAULT_UNSUPPORTED(
					ctx.platform.name,
					get_prop_path(object),
					get_prop_read_example(pattern, object, ctx),
				),
				ctx.filename,
				pattern.right,
				ctx.errors,
				ctx.comments,
			);
		}
		validate_prop_value(pattern.left, object, nested, ctx);
	} else if (pattern.type === 'ObjectPattern') {
		validate_prop_keys(pattern, object, true, ctx);
	} else if (pattern.type === 'ArrayPattern') {
		pattern.elements.forEach((element, index) => {
			if (element?.type === 'RestElement') {
				report_prop_rest(element, object, ctx);
			} else if (element) {
				validate_prop_value(element, join_prop_member(object, `[${index}]`, true), true, ctx);
			}
		});
	}
}

/**
 * Read a member of a prop's value with optional chaining, since the prop
 * itself can be missing.
 *
 * @param {string} object
 * @param {string} member `.name` or `[key]`
 * @param {boolean} nested whether `object` is a prop's value, not the props
 * @returns {string}
 */
function join_prop_member(object, member, nested) {
	return nested
		? `${object}?.${member.startsWith('.') ? member.slice(1) : member}`
		: object + member;
}

/**
 * A value's path in the props as the messages show it, such as `s.a`.
 *
 * @param {string} object
 * @returns {string}
 */
function get_prop_path(object) {
	return object.slice('props.'.length).replace(/\?\.(\[)?/g, (_, bracket) => bracket ?? '.');
}

/**
 * How the body reads the member at `key`. Vue camelizes a prop's name, so a
 * top-level `'a-b'` prop is `props.aB`.
 *
 * @param {AST.Expression | AST.PrivateIdentifier} key
 * @param {string} written the key as written
 * @param {boolean} top whether the key names a prop
 * @returns {string}
 */
function get_prop_member_access(key, written, top) {
	const name =
		key.type === 'Literal' && typeof key.value === 'string'
			? key.value
			: key.type === 'TemplateLiteral' && key.expressions.length === 0
				? key.quasis[0].value.cooked
				: null;
	if (name == null) return `[${written}]`;
	const member = top ? name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase()) : name;
	return /^[A-Za-z_$][\w$]*$/.test(member) ? `.${member}` : `[${JSON.stringify(member)}]`;
}

/**
 * An expression that reads the value at `access` where it is used, with the
 * pattern's default, or an empty string when the pattern binds more than a
 * name or its default spans lines.
 *
 * @param {AST.Pattern} value
 * @param {string} access
 * @param {TransformContext} ctx
 * @returns {string}
 */
function get_prop_read_example(value, access, ctx) {
	if (value.type === 'Identifier') return `{${access}}`;
	if (value.type !== 'AssignmentPattern' || value.left.type !== 'Identifier') return '';
	const fallback = get_source_text(value.right, ctx);
	// A default replaces only `undefined`, so `??`, which also replaces `null`,
	// would not read the same.
	return fallback === null ? '' : `{${access} === undefined ? ${fallback} : ${access}}`;
}

/**
 * A node's source text, on one line.
 *
 * @param {AST.Node} node
 * @param {TransformContext} ctx
 * @returns {string}
 */
function get_inline_text(node, ctx) {
	if (ctx.source && node.start != null && node.end != null) {
		return ctx.source.slice(node.start, node.end).replace(/\s*\n\s*/g, ' ');
	}
	return node.type === 'Identifier'
		? node.name
		: node.type === 'Literal'
			? String(node.value)
			: '…';
}

/**
 * @param {AST.Node} node
 * @param {TransformContext} ctx
 * @returns {string | null} the node's source text, when it is on one line
 */
function get_source_text(node, ctx) {
	const text =
		ctx.source && node.start != null && node.end != null
			? ctx.source.slice(node.start, node.end)
			: null;
	return text && !text.includes('\n') ? text : null;
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

/** Local name of the `useSlots` import a component reads its children through. */
const USE_SLOTS_INTERNAL_NAME = `${IDENTIFIER_OBFUSCATION_PREFIX}useSlots`;

/**
 * vue-jsx-vapor passes a component's nested children as its default slot, not
 * as a `children` prop. Read `props.children`, or a `children` binding
 * destructured from the props parameter or from `props` at the top of the
 * body, as the default slot when the caller passes nested children and as the
 * `children` prop otherwise, so the same source renders its children on every
 * target. Nested children win over a `children` prop, as on React.
 *
 * Each place that renders the children renders the slot there
 * (`_$_Card_slots.default?.() ?? props.children`), so the children are set up
 * when that place shows them and torn down when it hides them, as React
 * mounts and unmounts them. A read that only tests the children (the
 * condition of `?:` or `if`, an operand of `!`, the left side of `&&`) checks
 * whether the slot exists instead (`_$_Card_slots.default ?? props.children`),
 * so `props.children ? <div>{props.children}</div> : …` sets them up once.
 * A slot exists whenever the caller writes nested children, even when they
 * render nothing.
 *
 * @param {AST.Function} fn
 * @param {string} name the component's name
 * @param {TransformContext} ctx
 * @returns {AST.Function}
 */
function read_children_from_default_slot(fn, name, ctx) {
	const param = fn.params[0];
	/** @type {ChildrenReadState} */
	const state = {
		props_name: param?.type === 'Identifier' ? param.name : null,
		children_names: new Set(),
		children_defaults: new Map(),
		shadowed_names: new Set(),
		slots_id: create_generated_identifier(
			`${IDENTIFIER_OBFUSCATION_PREFIX}${name.replace(/[^\w$]/g, '_')}_slots`,
		),
		// Shared by reference: the scope visitors copy the state for each scope.
		rewrites: { count: 0 },
	};
	let params = fn.params;
	if (param?.type === 'ObjectPattern') {
		add_children_binding_names(param, state.children_names);
		const without_defaults = remove_children_defaults(param, state.children_defaults);
		if (without_defaults !== param) params = [without_defaults, ...fn.params.slice(1)];
	}
	// `const { children } = props;` at the top of the component body.
	for (const statement of fn.body.type === 'BlockStatement' ? fn.body.body : []) {
		if (statement.type !== 'VariableDeclaration') continue;
		for (const declarator of statement.declarations) {
			if (
				declarator.id.type === 'ObjectPattern' &&
				declarator.init?.type === 'Identifier' &&
				declarator.init.name === state.props_name
			) {
				add_children_binding_names(declarator.id, state.children_names);
			}
		}
	}
	if (!state.props_name && state.children_names.size === 0) {
		return fn;
	}

	/**
	 * @param {AST.Node} node
	 * @param {import('zimmerframe').Context<AST.Node, ChildrenReadState>} context
	 */
	const shadow_head = (node, { state, next }) => {
		/** @type {AST.Node[]} */
		const bindings = [];
		if (node.type === 'CatchClause' && node.param) bindings.push(node.param);
		const head =
			node.type === 'ForStatement'
				? node.init
				: node.type === 'ForInStatement' || node.type === 'ForOfStatement'
					? node.left
					: null;
		if (head?.type === 'VariableDeclaration') {
			for (const declarator of head.declarations) bindings.push(declarator.id);
		}
		if (bindings.length === 0) return next();
		const shadowed_names = new Set(state.shadowed_names);
		for (const binding of bindings) collect_pattern_names(binding, shadowed_names);
		return next({ ...state, shadowed_names });
	};

	const body = /** @type {AST.BlockStatement | AST.Expression} */ (
		walk(/** @type {AST.Node} */ (fn.body), state, {
			ChainExpression(node, { path, state, next }) {
				if (
					node.expression.type === 'MemberExpression' &&
					is_props_children_read(node.expression, path.at(-1), state)
				) {
					return read_children_or_default_slot(node, path.at(-1), state);
				}
				return next();
			},
			MemberExpression(node, { path, state, next }) {
				if (is_props_children_read(node, path.at(-1), state)) {
					return read_children_or_default_slot(node, path.at(-1), state);
				}
				return next();
			},
			Property(node, { path, state, next }) {
				const value = node.value;
				if (
					node.shorthand &&
					path.at(-1)?.type === 'ObjectExpression' &&
					value.type === 'Identifier' &&
					is_children_binding(value, state)
				) {
					return {
						...node,
						shorthand: false,
						value: read_children_or_default_slot(value, node, state),
					};
				}
				return next();
			},
			Identifier(node, { path, state, next }) {
				const parent = path.at(-1);
				if (
					is_children_binding(node, state) &&
					parent &&
					is_runtime_reference(node, parent) &&
					!is_assignment_target(node, parent) &&
					!is_binding_position(node, parent, path.at(-2))
				) {
					return read_children_or_default_slot(node, parent, state);
				}
				return next();
			},
			FunctionDeclaration: rewrite_function_shadowed_refs,
			FunctionExpression: rewrite_function_shadowed_refs,
			ArrowFunctionExpression: rewrite_function_shadowed_refs,
			CatchClause: shadow_head,
			ForStatement: shadow_head,
			ForInStatement: shadow_head,
			ForOfStatement: shadow_head,
			BlockStatement(node, context) {
				// The component body declares the destructured `children` binding;
				// it cannot redeclare the props parameter or its bindings.
				if (context.path.length === 0) return context.next();
				return rewrite_block_shadowed_refs(node, context);
			},
		})
	);
	if (state.rewrites.count === 0) {
		return fn;
	}

	ctx.needs_use_slots = true;
	// `const _$_Card_slots = _$_useSlots();`
	const slot_declaration = b.const(state.slots_id, b.call(USE_SLOTS_INTERNAL_NAME));
	const statements =
		body.type === 'BlockStatement' ? body.body : [b.return(/** @type {AST.Expression} */ (body))];
	return /** @type {AST.Function} */ ({
		...fn,
		params,
		body: b.block(
			[slot_declaration, ...statements],
			body.type === 'BlockStatement' && has_location(body) ? body : undefined,
		),
		...(fn.type === 'ArrowFunctionExpression' ? { expression: false } : null),
	});
}

/**
 * @typedef {{
 *   props_name: string | null,
 *   children_names: Set<string>,
 *   children_defaults: Map<string, AST.Expression>,
 *   shadowed_names: Set<string>,
 *   slots_id: AST.Identifier,
 *   rewrites: { count: number },
 * }} ChildrenReadState
 */

/**
 * @param {AST.ObjectPattern} pattern
 * @param {Set<string>} names
 * @returns {void}
 */
function add_children_binding_names(pattern, names) {
	for (const property of pattern.properties) {
		if (property.type !== 'Property' || property.computed) continue;
		if (get_static_name(property.key) !== 'children') continue;
		const value =
			property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
		if (value.type === 'Identifier') names.add(value.name);
	}
}

/**
 * Drop the default of a destructured `children` parameter (`{ children = x }`)
 * and record it, so a read can fall back from the slot to the prop to the
 * default. Left in place, vue-jsx-vapor would turn it into the prop's default,
 * which would hide the slot.
 *
 * @param {AST.ObjectPattern} pattern
 * @param {Map<string, AST.Expression>} defaults
 * @returns {AST.ObjectPattern}
 */
function remove_children_defaults(pattern, defaults) {
	let changed = false;
	const properties = pattern.properties.map((property) => {
		if (
			property.type !== 'Property' ||
			property.computed ||
			get_static_name(property.key) !== 'children' ||
			property.value.type !== 'AssignmentPattern' ||
			property.value.left.type !== 'Identifier'
		) {
			return property;
		}
		changed = true;
		defaults.set(property.value.left.name, property.value.right);
		return { ...property, value: property.value.left };
	});
	return changed ? { ...pattern, properties } : pattern;
}

/**
 * @param {AST.Identifier} node
 * @param {AST.Node} parent
 * @param {AST.Node | undefined} grandparent
 * @returns {boolean}
 */
function is_binding_position(node, parent, grandparent) {
	return (
		(parent.type === 'VariableDeclarator' && parent.id === node) ||
		(parent.type === 'Property' && grandparent?.type === 'ObjectPattern') ||
		parent.type === 'ArrayPattern' ||
		parent.type === 'RestElement' ||
		parent.type === 'CatchClause' ||
		(parent.type === 'AssignmentPattern' && parent.left === node)
	);
}

/**
 * @param {AST.MemberExpression} node
 * @param {AST.Node | undefined} parent
 * @param {ChildrenReadState} state
 * @returns {boolean}
 */
function is_props_children_read(node, parent, state) {
	return (
		!!state.props_name &&
		!state.shadowed_names.has(state.props_name) &&
		node.object.type === 'Identifier' &&
		node.object.name === state.props_name &&
		(node.computed
			? node.property.type === 'Literal' && node.property.value === 'children'
			: node.property.type === 'Identifier' && node.property.name === 'children') &&
		!is_assignment_target(node, parent) &&
		!(parent?.type === 'UnaryExpression' && parent.operator === 'delete')
	);
}

/**
 * @param {AST.Identifier} node
 * @param {ChildrenReadState} state
 * @returns {boolean}
 */
function is_children_binding(node, state) {
	return state.children_names.has(node.name) && !state.shadowed_names.has(node.name);
}

/**
 * @param {AST.Node} node
 * @param {AST.Node | undefined} parent
 * @returns {boolean}
 */
function is_assignment_target(node, parent) {
	return (
		(parent?.type === 'AssignmentExpression' && parent.left === node) ||
		parent?.type === 'UpdateExpression'
	);
}

/**
 * `_$_Card_slots.default?.() ?? <read>` where the read renders the children,
 * `_$_Card_slots.default ?? <read>` where it only tests them. A destructured
 * default applies to the prop as it did in the pattern, only when the prop is
 * `undefined` (`children === void 0 ? <default> : children`), so an explicit
 * `children={null}` stays `null`.
 *
 * @param {AST.Expression} read
 * @param {AST.Node | undefined} parent
 * @param {ChildrenReadState} state
 * @returns {AST.Expression}
 */
function read_children_or_default_slot(read, parent, state) {
	state.rewrites.count += 1;
	const slot = b.member(clone_identifier(state.slots_id), 'default');
	const fallback = read.type === 'Identifier' ? state.children_defaults.get(read.name) : undefined;
	const prop =
		read.type === 'Identifier' && fallback
			? b.conditional(
					b.binary('===', read, b.unary('void', b.literal(0))),
					clone_ast_node(fallback),
					clone_identifier(read),
				)
			: read;
	return b.logical('??', is_test_position(read, parent) ? slot : b.maybe_call(slot), prop);
}

/**
 * Whether only the truthiness or presence of `node` is used: the condition of
 * `?:`, `if` or a loop, the operand of `!`, the left side of `&&` (whose value
 * is used only when it is falsy, and a slot never is), the argument of
 * `Boolean(…)`, or a side of an equality with `null` or `undefined`.
 *
 * @param {AST.Node} node
 * @param {AST.Node | undefined} parent
 * @returns {boolean}
 */
function is_test_position(node, parent) {
	switch (parent?.type) {
		case 'BinaryExpression': {
			if (!['==', '!=', '===', '!=='].includes(parent.operator)) return false;
			const other = parent.left === node ? parent.right : parent.left;
			return (
				(other.type === 'Literal' && other.value === null && !('regex' in other)) ||
				(other.type === 'Identifier' && other.name === 'undefined')
			);
		}
		case 'CallExpression':
			return (
				parent.callee.type === 'Identifier' &&
				parent.callee.name === 'Boolean' &&
				parent.arguments[0] === node
			);
		case 'ConditionalExpression':
		case 'IfStatement':
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'ForStatement':
			return parent.test === node;
		case 'UnaryExpression':
			return parent.operator === '!';
		case 'LogicalExpression':
			return parent.operator === '&&' && parent.left === node;
		default:
			return false;
	}
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
 * @param {(() => AST.Statement[]) | null} get_empty_statements
 * @returns {ESTreeJSX.JSXExpressionContainer | null}
 */
function render_for_of_as_vapor_for(
	node,
	loop_params,
	body_statements,
	transform_context,
	get_empty_statements,
) {
	if (body_statements.length !== 1) {
		return null;
	}

	const statement = body_statements[0];
	if (statement?.type !== 'ReturnStatement' || !statement.argument) {
		return null;
	}

	const rendered = statement.argument;
	const key_expression = node.key
		? clone_ast_node(node.key)
		: (find_jsx_key_expression(rendered) ?? (node.index ? clone_ast_node(node.index) : null));
	const pattern_reads_index = for_of_pattern_reads_index(loop_params[0], node.index);

	// A keyed loop renders through `VaporFor` even when its body can skip a row
	// or it has `@empty`, so its rows move with their keys (#178). The shared
	// lowering keeps such a loop without a key; one that awaits or yields, which
	// it suspends the template's closures for; one whose head destructures in a
	// way that runs code, which `getKey` and the row would each run; and one
	// whose row renders through an IIFE (`@switch`), which a row slot runs once
	// and which can return `null`.
	if (
		(node.empty || expression_can_skip_rendering(rendered)) &&
		(!key_expression ||
			suspends(node) ||
			destructuring_runs_code(loop_params[0]) ||
			!is_vapor_for_row(rendered) ||
			// A `@switch` row with `@empty` stays where #1378 left it, which
			// renders on the server.
			is_lowered_switch(rendered))
	) {
		// A default in the head's pattern that reads the index can't be read in
		// the parameters, where the index comes second. The shared lowering
		// destructures the item in the callback.
		if (node.empty || pattern_reads_index) {
			return null;
		}
		return render_for_of_as_map_iterable(node, loop_params, rendered, transform_context);
	}

	const row = to_vapor_for_row(rendered, transform_context);
	const slot = key_expression
		? create_keyed_vapor_for_slot(loop_params, row, transform_context)
		: { params: loop_params, body: row, expression: true };
	if (!slot) {
		return null;
	}

	if (is_lowered_switch(rendered) && lowered_switch_statement(rendered).cases.length > 0) {
		// The name `switch_in_fragment` gave the row's `computed`.
		switch_counts.set(transform_context, (switch_counts.get(transform_context) ?? 0) + 1);
		transform_context.needs_vapor_computed = true;
	}

	transform_context.needs_vapor_for = true;
	transform_context.needs_for_items = true;

	if (key_expression) {
		strip_top_level_jsx_keys(slot.rendered ?? slot.body);
	}

	// `VaporFor` reads an array by index and walks other iterables its own way,
	// so it gets the source's items as `for...of` walks them (#1147). With
	// `@empty`, one `computed` walks the source for both the check and the rows.
	const source_items = b.call(FOR_ITEMS_INTERNAL_NAME, clone_ast_node(node.right));
	const items_ref = get_empty_statements ? create_generated_identifier(VAPOR_ITEMS_NAME) : null;
	const attributes = [
		b.jsx_attribute(
			b.jsx_id('in'),
			to_jsx_expression_container(
				items_ref ? create_value_member_expression(items_ref) : source_items,
			),
		),
	];

	if (key_expression) {
		let get_key;
		if (pattern_reads_index) {
			const item = destructure_for_of_item(
				loop_params.map((param) => clone_ast_node(param)),
				/** @type {'const' | 'let' | 'var'} */ (
					/** @type {AST.VariableDeclaration} */ (node.left).kind
				),
			);
			get_key = b.arrow(item.params, b.block([item.declaration, b.return(key_expression)]));
		} else {
			get_key = create_loop_callback(loop_params, key_expression, true);
		}
		attributes.push(b.jsx_attribute(b.jsx_id('getKey'), to_jsx_expression_container(get_key)));
	}

	const vapor_for = b.jsx_element_fresh(
		b.jsx_opening_element(b.jsx_id(VAPOR_FOR_INTERNAL_NAME), attributes),
		b.jsx_closing_element(b.jsx_id(VAPOR_FOR_INTERNAL_NAME)),
		[to_jsx_expression_container(create_loop_callback(slot.params, slot.body, slot.expression))],
	);

	if (!items_ref || !get_empty_statements) {
		return to_jsx_expression_container(vapor_for);
	}

	transform_context.needs_vapor_computed = true;
	const empty_statements = get_empty_statements();
	const empty_return = empty_statements.length === 1 ? empty_statements[0] : null;
	const empty =
		empty_return?.type === 'ReturnStatement' && empty_return.argument
			? to_vapor_branch(empty_return.argument)
			: b.call(
					b.arrow(
						[],
						b.block(empty_statements),
						false,
						undefined,
						has_location(node.empty) ? node.empty : undefined,
					),
				);

	// The choice sits in a fragment, so vue-jsx-vapor makes it a `createIf`:
	// `VaporFor` and its rows stay mounted while the source has items.
	return to_jsx_expression_container(
		b.call(
			b.arrow(
				[],
				b.block([
					b.const(items_ref, b.call(VUE_COMPUTED_INTERNAL_NAME, b.arrow([], source_items))),
					b.return(
						b.jsx_fragment([
							to_jsx_expression_container(
								b.conditional(
									b.binary(
										'===',
										b.member(
											create_value_member_expression(items_ref),
											create_generated_identifier('length'),
										),
										b.literal(0),
									),
									empty,
									vapor_for,
								),
							),
						]),
					),
				]),
			),
		),
	);
}

/**
 * Whether `node` awaits or yields outside a nested function.
 *
 * @param {AST.Node} node
 * @returns {boolean}
 */
function suspends(node) {
	return !!findFirstTopLevelAwait(node, false) || yields(node);
}

/**
 * Whether destructuring `pattern` can run code or read the value more than
 * once in a way that shows: an array pattern walks an iterator, and a default
 * or a computed key evaluates an expression.
 *
 * @param {AST.Pattern | AST.Property['value'] | null | undefined} pattern
 * @returns {boolean}
 */
function destructuring_runs_code(pattern) {
	switch (pattern?.type) {
		case 'ArrayPattern':
		case 'AssignmentPattern':
			return true;
		case 'ObjectPattern':
			return pattern.properties.some((property) =>
				property.type === 'RestElement'
					? destructuring_runs_code(property.argument)
					: property.computed || destructuring_runs_code(property.value),
			);
		case 'RestElement':
			return destructuring_runs_code(pattern.argument);
		default:
			return false;
	}
}

/**
 * Whether a row can render through `VaporFor`: an element or fragment, or a
 * choice of them that `to_vapor_for_row` puts in a fragment.
 *
 * @param {AST.Expression} node
 * @returns {boolean}
 */
function is_vapor_for_row(node) {
	return (
		is_lowered_switch(node) ||
		node.type === 'JSXElement' ||
		node.type === 'JSXFragment' ||
		node.type === 'ConditionalExpression' ||
		(node.type === 'LogicalExpression' && node.operator === '&&') ||
		(node.type === 'Literal' && node.value === null)
	);
}

/**
 * @param {unknown} node
 * @returns {boolean}
 */
function yields(node) {
	if (Array.isArray(node)) return node.some(yields);
	if (!node || typeof node !== 'object' || isFunctionNode(/** @type {AST.Node} */ (node))) {
		return false;
	}
	if (/** @type {AST.Node} */ (node).type === 'YieldExpression') return true;
	return Object.entries(node).some(
		([key, value]) => key !== 'loc' && key !== 'metadata' && yields(value),
	);
}

/**
 * The row a `VaporFor` slot returns. The slot runs once per row, so a ternary
 * it returns would keep the branch it picked first: a row that picks a branch,
 * or can skip itself, is a fragment around the choice, which vue-jsx-vapor
 * makes a `createIf` that follows its condition, and a `@switch` row is a
 * fragment around its cases (`switch_in_fragment`).
 *
 * @param {AST.Expression} node
 * @param {TransformContext} transform_context
 * @returns {AST.Expression}
 */
function to_vapor_for_row(node, transform_context) {
	if (is_lowered_switch(node)) {
		return switch_in_fragment(/** @type {AST.CallExpression} */ (node), transform_context);
	}
	if (
		node.type === 'ConditionalExpression' ||
		(node.type === 'LogicalExpression' && node.operator === '&&')
	) {
		return /** @type {AST.Expression} */ (
			/** @type {unknown} */ (b.jsx_fragment([to_jsx_expression_container(to_vapor_branch(node))]))
		);
	}
	return to_vapor_branch(node);
}

/**
 * A branch of a `VaporFor` row or of its `@empty`, where Vapor can't mount
 * `null`: a skipped branch renders an empty fragment.
 *
 * @param {AST.Expression} node
 * @returns {AST.Expression}
 */
function to_vapor_branch(node) {
	if (node.type === 'Literal' && node.value === null) {
		return /** @type {AST.Expression} */ (/** @type {unknown} */ (b.jsx_fragment()));
	}

	if (node.type === 'ConditionalExpression') {
		return {
			...node,
			consequent: to_vapor_branch(node.consequent),
			alternate: to_vapor_branch(node.alternate),
		};
	}

	if (node.type === 'LogicalExpression' && node.operator === '&&') {
		return b.conditional(
			node.left,
			to_vapor_branch(node.right),
			/** @type {AST.Expression} */ (/** @type {unknown} */ (b.jsx_fragment())),
		);
	}

	return node;
}

/**
 * `@switch` on Vue: the shared lowering, an IIFE around a `switch`, marked so
 * a `VaporFor` row that is a `@switch` can render through
 * `switch_in_fragment`. A row slot runs once, so the shared IIFE would keep
 * the case it picked first and return `null` when no case matches, which
 * Vapor can't mount. Elsewhere vue-jsx-vapor evaluates the IIFE in an effect,
 * which follows the value.
 *
 * Not marked, so a row keeps the IIFE: the type-only output; a `@switch` that
 * awaits or yields; one whose case has setup statements or renders anything
 * but an element, a fragment or a choice of them (a nested `@switch`, a loop
 * through `map_iterable`), which as a branch of its own would render again,
 * components and all, whenever what it reads changes, such as the row's
 * item; and one with more than `MAX_SWITCH_ROW_CASES` cases, whose chain of
 * choices would nest as deep.
 *
 * @param {AST.SwitchStatement} node
 * @param {TransformContext} transform_context
 * @returns {ESTreeJSX.JSXRenderNode}
 */
function render_switch_statement(node, transform_context) {
	const container = switchStatementToJsxChild(node, transform_context);
	const statement =
		container.type === 'JSXExpressionContainer' &&
		container.expression.type === 'CallExpression' &&
		container.expression.callee.type === 'ArrowFunctionExpression' &&
		container.expression.callee.body.type === 'BlockStatement'
			? container.expression.callee.body.body[0]
			: null;
	if (
		!transform_context.typeOnly &&
		statement?.type === 'SwitchStatement' &&
		statement.cases.length <= MAX_SWITCH_ROW_CASES &&
		statement.cases.every(
			(switch_case) =>
				switch_case.consequent.length === 1 &&
				switch_case.consequent[0].type === 'ReturnStatement' &&
				renders_once(switch_case.consequent[0].argument),
		) &&
		!suspends(node) &&
		container.type === 'JSXExpressionContainer'
	) {
		/** @type {Record<string, unknown>} */ (
			/** @type {unknown} */ (container.expression.metadata ??= { path: [] })
		)[VAPOR_SWITCH_METADATA] = true;
	}
	return container;
}

/**
 * Whether a case's output, as a `createIf` branch, renders once while the
 * branch stays: an element, a fragment, nothing, or a choice of them, which
 * vue-jsx-vapor makes `createIf`s too. Anything else is evaluated in an
 * effect of its own, which renders it again when what it reads changes.
 *
 * @param {AST.Expression | null | undefined} node
 * @returns {boolean}
 */
function renders_once(node) {
	if (!node) return true;
	switch (node.type) {
		case 'JSXElement':
		case 'JSXFragment':
			return true;
		case 'Literal':
			return node.value === null;
		case 'ConditionalExpression':
			return renders_once(node.consequent) && renders_once(node.alternate);
		case 'LogicalExpression':
			return node.operator === '&&' && renders_once(node.right);
		default:
			return false;
	}
}

/**
 * Whether `node` is a `@switch` that `render_switch_statement` marked.
 *
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_lowered_switch(node) {
	return (
		node.type === 'CallExpression' &&
		!!(
			/** @type {Record<string, unknown> | undefined} */ (/** @type {unknown} */ (node.metadata))?.[
				VAPOR_SWITCH_METADATA
			]
		)
	);
}

/**
 * The `switch` in the IIFE of a `@switch` that `render_switch_statement`
 * marked.
 *
 * @param {AST.Expression} node
 * @returns {AST.SwitchStatement}
 */
function lowered_switch_statement(node) {
	return /** @type {AST.SwitchStatement} */ (
		/** @type {AST.BlockStatement} */ (
			/** @type {AST.ArrowFunctionExpression} */ (/** @type {AST.CallExpression} */ (node).callee)
				.body
		).body[0]
	);
}

/**
 * A `VaporFor` row that is a `@switch`. Its slot runs once, so a `computed`
 * runs the `switch` for the index of the case it picks, and the row is a
 * fragment around the case chosen by that index, which vue-jsx-vapor makes
 * `createIf`s: the row follows its value, keeps its case mounted while the
 * index stays the same, and renders an empty fragment when no case matches,
 * since a row can't be `null`. The `computed` is made once per row, so the
 * `switch` runs once for each change it reads.
 *
 * @param {AST.CallExpression} node
 * @param {TransformContext} transform_context
 * @returns {AST.Expression}
 */
function switch_in_fragment(node, transform_context) {
	const statement = lowered_switch_statement(node);
	// Without cases there is nothing to choose: the fragment runs the
	// discriminant in an effect, as the `switch` ran it elsewhere.
	if (statement.cases.length === 0) {
		return /** @type {AST.Expression} */ (
			/** @type {unknown} */ (
				b.jsx_fragment([
					to_jsx_expression_container(
						b.call(b.arrow([], b.block([statement, b.return(b.literal(null))]))),
					),
				])
			)
		);
	}

	// Named with the next number, which `render_for_of_as_vapor_for` takes
	// only if the loop renders through `VaporFor`.
	const case_ref = create_generated_identifier(
		`${SWITCH_CASE_NAME}_${(switch_counts.get(transform_context) ?? 0) + 1}`,
	);
	const error_ref = create_generated_identifier(SWITCH_ERROR_NAME);
	const previous_ref = create_generated_identifier(SWITCH_PREVIOUS_NAME);
	/** The index the `computed` holds, or the last one it picked while it holds a throw. */
	const held_index = () =>
		b.conditional(
			b.binary(
				'===',
				b.unary('typeof', create_value_member_expression(case_ref)),
				b.literal('object'),
			),
			b.member(create_value_member_expression(case_ref), 'index'),
			create_value_member_expression(case_ref),
		);

	/** @type {AST.Expression} */
	let chain = b.jsx_fragment();
	for (let index = statement.cases.length - 1; index >= 0; index--) {
		const output = /** @type {AST.ReturnStatement} */ (statement.cases[index].consequent[0]);
		chain = b.conditional(
			b.binary(
				'===',
				// The first choice throws what the `switch` threw, in its
				// `createIf`'s effect, which keeps following the `computed`;
				// the others keep the case picked before the throw.
				index === 0
					? b.conditional(
							b.binary(
								'===',
								b.unary('typeof', create_value_member_expression(case_ref)),
								b.literal('object'),
							),
							b.call(
								b.arrow(
									[],
									b.block([
										/** @type {AST.ThrowStatement} */ ({
											type: 'ThrowStatement',
											argument: b.member(create_value_member_expression(case_ref), 'error'),
											metadata: { path: [] },
										}),
									]),
								),
							),
							create_value_member_expression(case_ref),
						)
					: held_index(),
				b.literal(index),
			),
			to_vapor_branch(output.argument ?? b.literal(null)),
			chain,
		);
	}

	return b.call(
		b.arrow(
			[],
			b.block([
				// Vue stops running an effect that read a `computed` whose getter
				// threw, so the `computed` returns what the `switch` threw, with
				// the index it held before.
				b.const(
					case_ref,
					b.call(
						VUE_COMPUTED_INTERNAL_NAME,
						b.arrow(
							[previous_ref],
							b.block([
								b.try(
									b.block([
										setLocation(
											b.switch(
												statement.discriminant,
												statement.cases.map((switch_case, index) =>
													setLocation(
														b.switch_case(switch_case.test, [b.return(b.literal(index))]),
														has_location(switch_case) ? switch_case : undefined,
													),
												),
											),
											has_location(statement) ? statement : undefined,
										),
										b.return(b.literal(-1)),
									]),
									b.catch_clause(
										error_ref,
										null,
										b.block([
											b.return(
												b.object([
													b.prop('init', b.id('error'), clone_identifier(error_ref)),
													b.prop(
														'init',
														b.id('index'),
														b.conditional(
															b.binary(
																'===',
																b.unary('typeof', clone_identifier(previous_ref)),
																b.literal('object'),
															),
															b.member(clone_identifier(previous_ref), 'index'),
															b.logical('??', clone_identifier(previous_ref), b.literal(-1)),
														),
													),
												]),
											),
										]),
									),
									null,
								),
							]),
						),
					),
				),
				b.return(b.jsx_fragment([to_jsx_expression_container(chain)])),
			]),
		),
	);
}

/**
 * @param {AST.ForOfStatement} node
 * @param {AST.Pattern[]} loop_params
 * @param {AST.Expression} rendered
 * @param {TransformContext} transform_context
 * @returns {ESTreeJSX.JSXExpressionContainer}
 */
function render_for_of_as_map_iterable(node, loop_params, rendered, transform_context) {
	// `map_iterable` flattens a returned array the way `flatMap` does, and it
	// takes any iterable, so a `Set`, `Map` or generator source works too.
	transform_context.needs_for_of_iterable = true;
	return to_jsx_expression_container(
		b.call(
			b.id(MAP_ITERABLE_INTERNAL_NAME),
			clone_ast_node(node.right),
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
 * @param {AST.Expression | AST.BlockStatement} body
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
 * @param {TransformContext} transform_context
 * @returns {{ params: AST.Pattern[], body: AST.Expression | AST.BlockStatement, expression: boolean, rendered?: AST.Expression } | null}
 */
function create_keyed_vapor_for_slot(loop_params, rendered, transform_context) {
	if (loop_params[0]?.type === 'Identifier') {
		return {
			params: loop_params,
			body: rewrite_vapor_for_keyed_slot_refs(rendered, loop_params),
			expression: true,
		};
	}

	const item_ref = create_generated_identifier('__vapor_item');
	if (contains_array_pattern(loop_params[0])) {
		transform_context.needs_vapor_computed = true;
		return create_destructured_keyed_vapor_for_slot(
			loop_params,
			rendered,
			item_ref,
			transform_context,
		);
	}

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
 * A keyed slot for an item pattern that property reads can't stand in for:
 * an array pattern destructures through the item's iterator, so `[a, b]` of
 * a `Set` or a string is not `item[0]` and `item[1]`. The slot destructures
 * the item with the authored pattern in a `computed`, which runs once per
 * item value and keeps the row's reads reactive, and reads each name from it.
 *
 * @param {AST.Pattern[]} loop_params
 * @param {AST.Expression} rendered
 * @param {AST.Identifier} item_ref
 * @param {TransformContext} transform_context
 * @returns {{ params: AST.Pattern[], body: AST.BlockStatement, expression: boolean, rendered: AST.Expression }}
 */
function create_destructured_keyed_vapor_for_slot(
	loop_params,
	rendered,
	item_ref,
	transform_context,
) {
	const count = (vapor_bindings_counts.get(transform_context) ?? 0) + 1;
	vapor_bindings_counts.set(transform_context, count);
	const bindings_ref = create_generated_identifier(`${VAPOR_BINDINGS_NAME}_${count}`);
	/** @type {Set<string>} */
	const names = new Set();
	collect_pattern_names(loop_params[0], names);

	/** @type {Map<string, AST.Expression>} */
	const replacements = new Map();
	for (const name of names) {
		replacements.set(
			name,
			b.member(create_value_member_expression(bindings_ref), create_generated_identifier(name)),
		);
	}

	const bindings = b.const(
		bindings_ref,
		b.call(
			VUE_COMPUTED_INTERNAL_NAME,
			b.arrow(
				[],
				b.block([
					// A default in the pattern reads the index through its ref too.
					b.const(
						rewrite_vapor_for_keyed_slot_refs(loop_params[0], loop_params.slice(1)),
						create_value_member_expression(item_ref),
					),
					b.return(
						b.object([...names].map((name) => b.prop('init', b.id(name), b.id(name), false, true))),
					),
				]),
			),
		),
	);
	const rewritten_rendered = rewrite_vapor_for_keyed_slot_refs(
		rendered,
		loop_params.slice(1),
		replacements,
	);

	return {
		params: [item_ref, ...loop_params.slice(1)],
		body: b.block([bindings, b.return(rewritten_rendered)]),
		expression: false,
		rendered: rewritten_rendered,
	};
}

/**
 * @param {AST.Node | null} node
 * @returns {boolean}
 */
function contains_array_pattern(node) {
	if (!node) return false;
	switch (node.type) {
		case 'ArrayPattern':
			return true;
		case 'ObjectPattern':
			return node.properties.some((property) =>
				contains_array_pattern(property.type === 'RestElement' ? property : property.value),
			);
		case 'AssignmentPattern':
			return contains_array_pattern(node.left);
		case 'RestElement':
			return contains_array_pattern(node.argument);
		default:
			return false;
	}
}

/**
 * Vue's `VaporFor` passes plain item values to unkeyed slots, but keyed slots
 * receive shallow refs so row instances can update in place. Match that runtime
 * shape by reading loop params through `.value` inside the slot body.
 *
 * @template {AST.Node} T
 * @param {T} node
 * @param {AST.Pattern[]} loop_params
 * @param {Map<string, AST.Expression>} [replacements]
 * @returns {T}
 */
function rewrite_vapor_for_keyed_slot_refs(node, loop_params, replacements = new Map()) {
	const loop_param_names = new Set();
	for (const param of loop_params) {
		collect_pattern_names(param, loop_param_names);
	}

	if (loop_param_names.size === 0 && replacements.size === 0) {
		return node;
	}

	return /** @type {T} */ (
		walk(
			node,
			{ loop_param_names, shadowed_names: new Set(), in_type: false },
			{
				_(child, { state, next }) {
					// A type names no runtime value, so a type parameter or type
					// reference spelled like a loop param stays as written; only a
					// `typeof` in a type reads the param.
					if (child.type === 'TSTypeQuery') {
						next({ ...state, in_type: false });
					} else if (is_type_only_node(child)) {
						next({ ...state, in_type: true });
					} else {
						next();
					}
				},
				Identifier(identifier, { path, state, next }) {
					const parent = path.at(-1);
					if (
						!state.in_type &&
						// `typeof Types.item` reads `Types`; `item` is a member name.
						!(parent?.type === 'TSQualifiedName' && parent.right === identifier) &&
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
 * Whether `node` is TypeScript type syntax: a type annotation, type parameters
 * or arguments, the type of an `as`, `satisfies`, or `<T>` assertion, or a
 * type alias or interface declaration.
 *
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_type_only_node(node) {
	return (
		node.type === 'TSTypeAnnotation' ||
		node.type === 'TSTypeAliasDeclaration' ||
		node.type === 'TSInterfaceDeclaration' ||
		node.type === 'TSTypeParameterDeclaration' ||
		node.type === 'TSTypeParameterInstantiation' ||
		node.type === 'TSTypeReference' ||
		node.type === 'TSTypeLiteral' ||
		node.type === 'TSTypeOperator' ||
		/^TS[A-Za-z]*(Type|Keyword)$/.test(node.type)
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
 * @template {{ shadowed_names: Set<string> }} S
 * @param {AST.Function} node
 * @param {import('zimmerframe').Context<AST.Node, S>} context
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
 * @template {{ shadowed_names: Set<string> }} S
 * @param {AST.BlockStatement} node
 * @param {import('zimmerframe').Context<AST.Node, S>} context
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
 * Whether `specifier` of `declaration` imports `defineVaporComponent` from
 * `vue-jsx-vapor` under its own name, as a value or as a type.
 *
 * @param {AST.ImportDeclaration | AST.TSRXImportDeclaration} declaration
 * @param {AST.ImportDeclaration['specifiers'][number]} specifier
 * @returns {boolean}
 */
function imports_define_vapor_component(declaration, specifier) {
	return (
		declaration.source.type === 'Literal' &&
		declaration.source.value === 'vue-jsx-vapor' &&
		specifier.type === 'ImportSpecifier' &&
		imported_name(specifier) === DEFINE_VAPOR_COMPONENT &&
		specifier.local.name === DEFINE_VAPOR_COMPONENT
	);
}

/**
 * The name an import specifier imports, written as an identifier or quoted
 * (`import { "a" as a }`).
 *
 * @param {AST.ImportSpecifier} specifier
 * @returns {string | undefined}
 */
function imported_name(specifier) {
	const imported = specifier.imported;
	if (imported?.type === 'Identifier') return imported.name;
	if (imported?.type === 'Literal' && typeof imported.value === 'string') return imported.value;
	return undefined;
}

/**
 * Whether the module may bind `Fragment` to something other than Vue's: any
 * identifier `Fragment` in a value position, at any depth, other than in a
 * value import of `Fragment` from `vue`. Declarations of every form count, and
 * so do references, which costs only the row's key; a property name or a type
 * doesn't.
 *
 * @param {AST.Program} program
 * @returns {boolean}
 */
function declares_other_fragment(program) {
	let found = false;
	walk(/** @type {AST.Node} */ (program), null, {
		_(node, { next }) {
			// A type names no runtime value.
			if (!found && !is_type_only_node(node)) next();
		},
		ImportDeclaration(node) {
			for (const specifier of node.specifiers) {
				if (specifier.local.name !== 'Fragment') continue;
				const vue_value =
					/** @type {AST.Literal} */ (node.source).value === 'vue' &&
					node.importKind !== 'type' &&
					specifier.type === 'ImportSpecifier' &&
					specifier.importKind !== 'type' &&
					imported_name(specifier) === 'Fragment';
				if (!vue_value) found = true;
			}
		},
		Identifier(node, { path }) {
			if (node.name !== 'Fragment') return;
			const parent = /** @type {AST.Node & { computed?: boolean, shorthand?: boolean }} */ (
				path.at(-1)
			);
			const name_only =
				!parent.computed &&
				((parent.type === 'MemberExpression' && parent.property === node) ||
					((parent.type === 'Property' ||
						parent.type === 'MethodDefinition' ||
						parent.type === 'PropertyDefinition') &&
						parent.key === node &&
						!parent.shorthand));
			if (!name_only) found = true;
		},
	});
	return found;
}

/**
 * Rewrites the `<__Fragment key>` rows the shared lowering generated (their
 * names have no source location). vue-jsx-vapor's server build passes a
 * fragment's children as an array only when its tag is spelled `Fragment`;
 * under any other name it passes them as slots, which Vue's `Fragment`
 * doesn't render. So a row becomes `<Fragment key>`, with `Fragment` imported
 * from `vue`, unless the module declares something else by that name, and then
 * an unkeyed `<>` fragment: a loop that doesn't render through `VaporFor`
 * recreates its rows when they move (#178), so the key keeps no row state.
 *
 * @param {AST.Program} program
 * @param {boolean} keyed
 * @returns {void}
 */
function rewrite_generated_fragments(program, keyed) {
	/** @param {ESTreeJSX.JSXElement['openingElement']['name'] | undefined} name */
	const is_generated = (name) =>
		name?.type === 'JSXIdentifier' && name.name === FRAGMENT_INTERNAL_NAME && !has_location(name);
	const rewritten = walk(/** @type {AST.Node} */ (program), null, {
		JSXElement(node, { next }) {
			const element = /** @type {ESTreeJSX.JSXElement} */ (/** @type {unknown} */ (node));
			if (!is_generated(element.openingElement.name)) return next();
			const walked = /** @type {ESTreeJSX.JSXElement} */ (next() ?? element);
			if (!keyed) {
				return /** @type {AST.Node} */ (/** @type {unknown} */ (b.jsx_fragment(walked.children)));
			}
			for (const name of [walked.openingElement.name, walked.closingElement?.name]) {
				if (is_generated(name)) /** @type {ESTreeJSX.JSXIdentifier} */ (name).name = 'Fragment';
			}
			return walked;
		},
	});
	program.body = /** @type {AST.Program} */ (rewritten).body;
}

/**
 * Turn an authored type-only import of `defineVaporComponent` from
 * `vue-jsx-vapor` into the value import the generated components need. The
 * specifier is replaced by one without a location, as for a name the compiler
 * adds, so the editor maps no edit of the whole import back to the source.
 *
 * @param {AST.Program} program
 * @returns {void}
 */
function promote_type_only_define_vapor_component_import(program) {
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		const index = statement.specifiers.findIndex(
			(specifier) =>
				imports_define_vapor_component(statement, specifier) &&
				(statement.importKind === 'type' ||
					/** @type {AST.ImportSpecifier} */ (specifier).importKind === 'type'),
		);
		if (index === -1) continue;
		if (statement.importKind === 'type') {
			statement.importKind = 'value';
			for (const specifier of statement.specifiers) {
				if (specifier.type === 'ImportSpecifier') specifier.importKind = 'type';
			}
		}
		statement.specifiers[index] = create_import_specifier(DEFINE_VAPOR_COMPONENT);
		return;
	}
}

/**
 * Report each authored binding named `defineVaporComponent`. vue-jsx-vapor
 * finds components by calls to that name, and the compiler wraps each
 * component in the one from `vue-jsx-vapor`, so the module can't declare or
 * shadow it. An import of it from `vue-jsx-vapor` itself is the binding the
 * compiler needs.
 *
 * @param {AST.Program} program
 * @param {TransformContext} transform_context
 * @returns {boolean} whether it reported one
 */
function report_define_vapor_component_bindings(program, transform_context) {
	/** @type {Set<number>} */
	const reported = new Set();

	/** @param {AST.Node | null | undefined} pattern */
	const check = (pattern) => {
		for (const id of pattern_identifiers(pattern)) {
			if (id.name !== DEFINE_VAPOR_COMPONENT || !has_location(id)) continue;
			// The transform can carry one authored node to more than one place.
			if (reported.has(id.start)) continue;
			reported.add(id.start);
			error(
				TSRX_ERRORS.DEFINE_VAPOR_COMPONENT_BINDING,
				transform_context.filename,
				id,
				transform_context.errors,
				transform_context.comments,
			);
		}
	};

	/** @param {AST.Function} node */
	const check_function = (node) => {
		if (node.type !== 'ArrowFunctionExpression') check(node.id);
		for (const param of node.params) check(param);
	};

	walk(/** @type {AST.Node} */ (program), null, {
		ImportDeclaration(node) {
			for (const specifier of node.specifiers) {
				if (!imports_define_vapor_component(node, specifier)) check(specifier.local);
			}
		},
		VariableDeclarator(node, { next }) {
			check(node.id);
			next();
		},
		FunctionDeclaration(node, { next }) {
			check_function(node);
			next();
		},
		FunctionExpression(node, { next }) {
			check_function(node);
			next();
		},
		ArrowFunctionExpression(node, { next }) {
			check_function(node);
			next();
		},
		// `declare function`: its parameters only name types.
		TSDeclareFunction(node) {
			check(node.id);
		},
		ClassDeclaration(node, { next }) {
			check(node.id);
			next();
		},
		ClassExpression(node, { next }) {
			check(node.id);
			next();
		},
		CatchClause(node, { next }) {
			check(node.param);
			next();
		},
		TSEnumDeclaration(node, { next }) {
			check(node.id);
			next();
		},
		TSModuleDeclaration(node, { next }) {
			if (is_instantiated_namespace(node)) check(node.id);
			next();
		},
		TSImportEqualsDeclaration(node, { next }) {
			check(node.id);
			next();
		},
	});

	return reported.size > 0;
}

/**
 * Whether a namespace declares a value, as TypeScript decides: a namespace of
 * interfaces, type aliases and namespaces of those binds only a type.
 *
 * @param {AST.TSModuleDeclaration} node
 * @returns {boolean}
 */
function is_instantiated_namespace(node) {
	const body = node.body;
	if (!body) return false;
	if (body.type === 'TSModuleDeclaration') return is_instantiated_namespace(body);
	return body.body.some((statement) => {
		const declaration = /** @type {AST.Node} */ (
			statement.type === 'ExportNamedDeclaration' && statement.declaration
				? statement.declaration
				: statement
		);
		switch (declaration.type) {
			case 'TSInterfaceDeclaration':
			case 'TSTypeAliasDeclaration':
				return false;
			case 'TSModuleDeclaration':
				return is_instantiated_namespace(declaration);
			default:
				return true;
		}
	});
}

/**
 * The identifiers a binding pattern declares.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {AST.Identifier[]}
 */
function pattern_identifiers(node) {
	switch (node?.type) {
		case 'Identifier':
			return [node];
		case 'RestElement':
			return pattern_identifiers(node.argument);
		case 'AssignmentPattern':
			return pattern_identifiers(node.left);
		case 'ArrayPattern':
			return node.elements.flatMap(pattern_identifiers);
		case 'ObjectPattern':
			return node.properties.flatMap((property) =>
				pattern_identifiers(property.type === 'Property' ? property.value : property),
			);
		case 'TSParameterProperty':
			return pattern_identifiers(/** @type {AST.Node} */ (/** @type {unknown} */ (node.parameter)));
		default:
			return [];
	}
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
		promote_type_only_define_vapor_component_import(program);
	}
	const reported_define_vapor_component = report_define_vapor_component_bindings(
		program,
		transform_context,
	);

	// After the error the authored binding keeps the name, and an import could
	// only declare it a second time.
	if (transform_context.needs_define_vapor_component && !reported_define_vapor_component) {
		ensure_named_import(program, 'vue-jsx-vapor', DEFINE_VAPOR_COMPONENT);
	}

	const iterable_source = transform_context.platform.imports.forOfIterableHelper;
	if (iterable_source) {
		if (transform_context.needs_for_items) {
			ensure_named_import(program, iterable_source, 'for_items', FOR_ITEMS_INTERNAL_NAME);
		}
		if (transform_context.needs_for_of_iterable) {
			ensure_named_import(program, iterable_source, 'map_iterable', MAP_ITERABLE_INTERNAL_NAME);
		}
		// A `@for` body that awaits is `await map_iterable_async(...)`. The
		// shared pass sets this on its own, including for a plain async
		// function, which Vue still compiles.
		if (transform_context.needs_for_of_iterable_async) {
			ensure_named_import(
				program,
				iterable_source,
				'map_iterable_async',
				MAP_ITERABLE_ASYNC_INTERNAL_NAME,
			);
		}
	}

	if (transform_context.needs_vapor_for) {
		ensure_named_import(program, 'vue-jsx-vapor', 'VaporFor', VAPOR_FOR_INTERNAL_NAME);
	}

	if (transform_context.needs_vapor_computed) {
		// Its own declaration: an authored `import type` or `import * as` from
		// 'vue' can't take a value specifier.
		insertAfterDirectives(program, [
			b.imports([['computed', VUE_COMPUTED_INTERNAL_NAME, 'value']], 'vue'),
		]);
	}

	if (transform_context.needs_use_slots) {
		ensure_named_import(program, 'vue', 'useSlots', USE_SLOTS_INTERNAL_NAME);
	}

	if (transform_context.needs_suspense) {
		ensure_named_import(program, 'vue', 'Suspense', SUSPENSE_INTERNAL_NAME);
	}

	// A keyed row whose body is a fragment, in a loop that doesn't render
	// through `VaporFor`, is a `<Fragment key>`, which vue-jsx-vapor lowers to a
	// keyed fragment.
	if (transform_context.needs_fragment) {
		if (!declares_other_fragment(program)) {
			rewrite_generated_fragments(program, true);
			ensure_named_import(program, 'vue', 'Fragment');
		} else {
			rewrite_generated_fragments(program, false);
		}
	}

	if (transform_context.needs_error_boundary) {
		ensure_named_import(
			program,
			transform_context.platform.imports.errorBoundary,
			'TsrxErrorBoundary',
			ERROR_BOUNDARY_INTERNAL_NAME,
		);
	}

	if (transform_context.needs_pending_body) {
		ensure_named_import(
			program,
			transform_context.platform.imports.errorBoundary,
			'TsrxPendingBody',
			PENDING_BODY_INTERNAL_NAME,
		);
	}

	if (transform_context.needs_merge_refs && merge_refs_source) {
		ensure_named_import(program, merge_refs_source, 'mergeRefs', MERGE_REFS_INTERNAL_NAME);
	}

	if (transform_context.needs_join_scope_class && ref_prop_source) {
		ensure_named_import(
			program,
			ref_prop_source,
			'join_scope_class',
			JOIN_SCOPE_CLASS_INTERNAL_NAME,
		);
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
 * Import `name` as `local` from `source` unless a named value import of
 * `source` already has it, in any declaration: an authored
 * `import { Suspense } from 'vue'` can follow the keyed slot's `computed`
 * import. Otherwise add it to the first named value import of `source`, or
 * give it an import of its own.
 *
 * @param {import('estree').Program} program
 * @param {string} source
 * @param {string} name
 * @param {string} [local]
 * @returns {void}
 */
function ensure_named_import(program, source, name, local = name) {
	/** @type {import('estree').ImportDeclaration | undefined} */
	let first;
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source?.value !== source) {
			continue;
		}
		// A type-only import is erased from the build, and a namespace import
		// takes no named specifiers: the helper gets an import of its own.
		if (
			statement.importKind === 'type' ||
			statement.specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier')
		) {
			continue;
		}

		const has_specifier = statement.specifiers.some(
			(specifier) =>
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				imported_name(specifier) === name &&
				specifier.local?.name === local,
		);

		if (has_specifier) {
			return;
		}

		first ??= statement;
	}

	if (first) {
		first.specifiers.push(create_import_specifier(name, local));
		return;
	}

	insertAfterDirectives(program, [b.imports([[name, local, 'value']], source)]);
}

/**
 * @param {string} name
 * @param {string} [local]
 * @returns {AST.ImportSpecifier}
 */
function create_import_specifier(name, local = name) {
	return b.import_specifier(name, local, 'value');
}
