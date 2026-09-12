/** @import * as AST from 'estree' */
/** @import * as ESTreeJSX from 'estree-jsx' */
/** @import { BaseNodeMetaData, JsxPlatform, JsxTransformContext, TSRXAnalysisResult } from '@tsrx/core/types' */

import {
	builders as b,
	clone_ast_node,
	createJsxTransform,
	error,
	is_component_like_element as isComponentLikeElement,
	isFunctionNode,
	parseModule,
} from '@tsrx/core';

const HONO_SERVER_SOURCE = 'hono/jsx';
const HONO_DOM_SOURCE = 'hono/jsx/dom';
const AST_METADATA_KEYS = new Set(['loc', 'start', 'end', 'metadata']);
const DOM_COMPONENT_PLACEHOLDER = '__TSRX_HONO_DOM_COMPONENT__';

/** @typedef {BaseNodeMetaData & { hono_dom_local_async?: boolean }} HonoNodeMetaData */

/** @type {AST.Expression | null} */
let dom_component_assertion_template = null;

/** @returns {AST.CallExpression} */
function get_hono_dom_component_assertion_template() {
	dom_component_assertion_template ??= /** @type {AST.ExpressionStatement} */ (
		parseModule(
			`(function <T extends (...args: any[]) => any>(
			component: [T] extends [{
				(...args: infer A1): infer R1;
				(...args: infer A2): infer R2;
			}]
				? [A1, R1] extends [A2, R2]
					? [A2, R2] extends [A1, R1]
						? [R1] extends [never]
							? T
							: 0 extends (1 & R1)
								? T
								: [R1] extends [PromiseLike<unknown>]
									? { readonly __tsrx_hono_dom_error: 'Hono JSX DOM components must render synchronously. Use use(promise) with Suspense.' }
									: T
						: T
					: T
				: T,
		): void {})<typeof ${DOM_COMPONENT_PLACEHOLDER}>(${DOM_COMPONENT_PLACEHOLDER});`,
			'tsrx-hono-dom-assertion.tsx',
		).body[0]
	).expression;
	return /** @type {AST.CallExpression} */ (dom_component_assertion_template);
}

/**
 * The Hono JSX runtimes accept authored `class` attributes and expose their
 * own Fragment/Suspense/ErrorBoundary components. The compiler-only Dynamic
 * import is needed for type-only output; production output aliases a dynamic
 * tag to a local component binding and therefore needs no runtime Dynamic
 * component.
 *
 * @param {'server' | 'dom'} mode
 * @returns {JsxPlatform}
 */
function create_hono_platform(mode) {
	const is_dom = mode === 'dom';
	const jsx_source = is_dom ? HONO_DOM_SOURCE : HONO_SERVER_SOURCE;
	/** @type {NonNullable<JsxPlatform['hooks']>} */
	const hooks = {
		createErrorBoundary(try_content, _raw_try_content, fallback_fn, ctx, node) {
			return create_hono_error_boundary(try_content, fallback_fn, ctx, node);
		},
		...(is_dom
			? {
					preprocessElementAttributes(attrs, ctx, element) {
						return add_hono_dom_component_assertion(attrs, ctx, element);
					},
					// Hono DOM keys hook state by the runtime component function. A
					// helper recreated inside its parent would lose state on updates.
					moduleScopedHookComponents: true,
					// Hono DOM JSX nodes carry mutable reconciliation and hook state.
					// Reusing any module-scoped node across mounts is unsafe, not only
					// reusing composite nodes.
					canHoistStaticNode() {
						return false;
					},
				}
			: {}),
	};

	return {
		name: is_dom ? 'Hono JSX DOM' : 'Hono JSX',
		imports: {
			fragment: jsx_source,
			suspense: jsx_source,
			dynamic: '@tsrx/hono/dynamic',
			dynamicFactory: {},
			errorBoundary: is_dom ? '@tsrx/hono/dom/error-boundary' : '@tsrx/hono/error-boundary',
			mergeRefs: '@tsrx/hono/ref',
			refProp: '@tsrx/hono/ref',
			forOfIterableHelper: '@tsrx/hono/runtime/iterable',
		},
		directRuntimeImports: {
			// Hono-specific adapters intentionally remain on @tsrx/hono/* because
			// this target does not publish a separate standalone runtime package.
			mergeRefs: '@tsrx/core/runtime/ref',
			refProp: '@tsrx/core/runtime/ref',
			forOfIterableHelper: '@tsrx/core/runtime/iterable',
		},
		jsx: {
			rewriteClassAttr: false,
			multiRefStrategy: 'merge-refs',
		},
		validation: {
			// Async DOM components are validated only after resolving an authored
			// component use to its same-module declaration. This avoids diagnosing
			// unused async helpers.
			requireUseServerForAwait: false,
		},
		hooks,
	};
}

/**
 * Hono names the callback prop `fallbackRender` and invokes it with only the
 * error. TSRX's default React-shaped output uses `fallback={(error, reset) =>
 * ...}`, which would be rendered as a function value by Hono. Adapt the
 * boundary explicitly and reject the unsupported reset contract.
 *
 * @param {ESTreeJSX.JSXRenderNode} try_content
 * @param {AST.ArrowFunctionExpression} fallback_fn
 * @param {JsxTransformContext} ctx
 * @param {AST.TryStatement} node
 * @returns {ESTreeJSX.JSXRenderNode}
 */
function create_hono_error_boundary(try_content, fallback_fn, ctx, node) {
	const reset_param = node.handler?.resetParam;
	if (reset_param) {
		error(
			'Hono JSX ErrorBoundary does not provide a reset callback. Use `@catch (error)` without a reset parameter.',
			ctx.filename,
			reset_param,
			ctx.errors,
			ctx.comments,
		);
	}

	// The core transform keeps a second reset parameter for React-shaped
	// boundaries. Hono invokes `fallbackRender` with the error only, so remove
	// the unused parameter from generated output and preserve Hono's public type.
	const hono_fallback_fn = /** @type {AST.ArrowFunctionExpression} */ ({
		...fallback_fn,
		params: fallback_fn.params.slice(0, 1),
	});
	const name = b.jsx_id('TsrxErrorBoundary');
	const fallback_render = b.jsx_attribute(
		b.jsx_id('fallbackRender'),
		b.jsx_expression_container(hono_fallback_fn),
	);
	return b.jsx_element_fresh(
		b.jsx_opening_element(name, [fallback_render], false),
		b.jsx_closing_element(b.jsx_id('TsrxErrorBoundary')),
		[try_content],
	);
}

export const hono_server_transform = createJsxTransform(create_hono_platform('server'));
export const hono_dom_transform = createJsxTransform(create_hono_platform('dom'));

/**
 * Add a type-only spread that asks TypeScript to reject definitely Promise-
 * returning component values. The assertion's scaffolding is synthetic and
 * unmapped; only its component argument keeps the rendered tag's source range.
 * Runtime compilation never sees this attribute.
 *
 * @param {ESTreeJSX.JSXAttributeNode[]} attrs
 * @param {JsxTransformContext} ctx
 * @param {AST.TSRXJSXElement} element
 * @returns {ESTreeJSX.JSXAttributeNode[]}
 */
function add_hono_dom_component_assertion(attrs, ctx, element) {
	if (!ctx.typeOnly || !isComponentLikeElement(element)) return attrs;
	const name = element.openingElement.name;
	const dynamic_target = element.metadata.dynamicElement ? find_hono_dynamic_target(attrs) : null;
	const target = dynamic_target ?? jsx_name_to_expression(name, true);
	const target_metadata = /** @type {HonoNodeMetaData | undefined} */ (
		(dynamic_target ?? name).metadata
	);
	if (target_metadata?.hono_dom_local_async) {
		return attrs;
	}

	const assertion = /** @type {AST.CallExpression} */ (
		clone_ast_node(get_hono_dom_component_assertion_template(), false)
	);
	replace_hono_dom_component_placeholder(assertion, clone_ast_node(target, false));
	assertion.arguments[0] = clone_ast_node(target, true);

	return [...attrs, b.jsx_spread_attribute(b.sequence([assertion, b.object([])]))];
}

/**
 * Type-only dynamic tags have already become `<TsrxDynamic is={target}>`.
 * Recover that target so the Promise assertion checks the authored component.
 *
 * @param {ESTreeJSX.JSXAttributeNode[]} attrs
 * @returns {AST.Expression | null}
 */
function find_hono_dynamic_target(attrs) {
	for (const attr of attrs) {
		if (
			attr.type === 'JSXAttribute' &&
			attr.name.type === 'JSXIdentifier' &&
			attr.name.name === 'is' &&
			attr.value?.type === 'JSXExpressionContainer' &&
			attr.value.expression.type !== 'JSXEmptyExpression'
		) {
			return attr.value.expression;
		}
	}
	return null;
}

/**
 * @param {AST.Node} node
 * @param {AST.Expression} expression
 */
function replace_hono_dom_component_placeholder(node, expression) {
	for (const key of Object.keys(node)) {
		if (AST_METADATA_KEYS.has(key) || key === 'arguments') continue;
		const value = /** @type {unknown} */ (/** @type {Record<string, unknown>} */ (node)[key]);
		if (Array.isArray(value)) {
			for (let index = 0; index < value.length; index += 1) {
				const child = value[index];
				if (
					child?.type === 'Identifier' &&
					/** @type {AST.Identifier} */ (child).name === DOM_COMPONENT_PLACEHOLDER
				) {
					value[index] = clone_ast_node(expression, false);
				} else if (child && typeof child === 'object' && 'type' in child) {
					replace_hono_dom_component_placeholder(child, expression);
				}
			}
		} else if (value && typeof value === 'object' && 'type' in value) {
			if (
				value.type === 'Identifier' &&
				/** @type {AST.Identifier} */ (value).name === DOM_COMPONENT_PLACEHOLDER
			) {
				/** @type {Record<string, unknown>} */ (node)[key] = clone_ast_node(expression, false);
			} else {
				replace_hono_dom_component_placeholder(/** @type {AST.Node} */ (value), expression);
			}
		}
	}
}

/**
 * @param {ESTreeJSX.TSRXJSXOpeningElement['name']} name
 * @param {boolean} with_locations
 * @returns {AST.Expression}
 */
function jsx_name_to_expression(name, with_locations) {
	if (name.type === 'JSXIdentifier' || name.type === 'Identifier') {
		const identifier = b.id(name.name);
		return with_locations && name.start !== undefined && name.end !== undefined
			? b.set_location(identifier, /** @type {AST.NodeWithLocation} */ (name), !!name.loc)
			: identifier;
	}
	if (name.type === 'JSXMemberExpression') {
		const member = b.member(
			jsx_name_to_expression(name.object, with_locations),
			jsx_name_to_expression(name.property, with_locations),
		);
		return with_locations && name.start !== undefined && name.end !== undefined
			? b.set_location(member, /** @type {AST.NodeWithLocation} */ (name), !!name.loc)
			: member;
	}
	return b.id(DOM_COMPONENT_PLACEHOLDER);
}

/**
 * Hono DOM renders components synchronously. This validator deliberately
 * diagnoses only explicit `async` component functions that can be resolved
 * from a component position in the same module. Promise return types require
 * type information or inter-module analysis and are outside this pass.
 *
 * @param {AST.Program} ast
 * @param {string} filename
 * @param {{ source: string, errors?: import('@tsrx/core/types').CompileError[], comments: AST.CommentWithLocation[], collect: boolean, analysis: TSRXAnalysisResult }} context
 */
export function validate_hono_dom_components(ast, filename, context) {
	if (context.source && !/\basync\b/.test(context.source)) return;

	for (const component of find_hono_dom_async_components(ast, context.analysis)) {
		error(
			'Hono JSX DOM does not support async components. Use use(promise) with <Suspense> instead.',
			filename,
			component,
			context.errors,
			context.comments,
		);
	}
}

/**
 * Resolve only static same-module component references. Mutable bindings are
 * intentionally ignored: resolving their current value would require source
 * order and control-flow analysis. This keeps the validator conservative and
 * prevents a later assignment from changing the meaning of an earlier JSX use.
 *
 * @param {AST.Program} ast
 * @param {TSRXAnalysisResult} analysis
 * @returns {AST.Function[]}
 */
function find_hono_dom_async_components(ast, analysis) {
	/** @type {Map<AST.Node, import('@tsrx/core/types').ScopeInterface | null>} */
	const scopes = new Map();
	/** @type {Array<{ node: AST.Node, scope: import('@tsrx/core/types').ScopeInterface | null }>} */
	const jsx_references = [];
	/** @type {Map<import('@tsrx/core/types').Binding, string[]>} */
	const destructured_paths = new Map();

	/** @param {AST.Node | null | undefined} node @param {import('@tsrx/core/types').ScopeInterface | null} scope */
	function walk(node, scope) {
		if (!node || typeof node !== 'object') return;
		scope = analysis.scopes.get(node) ?? scope;
		scopes.set(node, scope);

		if (node.type === 'JSXElement') {
			const name = node.openingElement.name;
			const reference =
				name.type === 'JSXExpressionContainer' && name.expression.type !== 'JSXEmptyExpression'
					? name.expression
					: name;
			if (name.type !== 'JSXIdentifier' || isComponentLikeElement(node)) {
				jsx_references.push({ node: reference, scope });
			}
		}
		if (node.type === 'VariableDeclarator' && node.init) {
			collect_hono_destructured_paths(node.id, scope, destructured_paths);
		}

		for_each_hono_child(node, (child) => walk(child, scope));
	}

	/**
	 * @param {AST.Node | null | undefined} node
	 * @param {string[]} property_path
	 * @param {Set<AST.Node>} seen
	 * @returns {AST.Function | null}
	 */
	function resolve_async_component(node, property_path, seen) {
		if (!node || seen.has(node)) return null;
		const next_seen = new Set(seen).add(node);
		const expression = unwrap_hono_transparent_expression(node);
		if (expression !== node) return resolve_async_component(expression, property_path, next_seen);

		if (isFunctionNode(node)) {
			if (property_path.length || !node.async) return null;
			return node;
		}

		if (node.type === 'ObjectExpression' && property_path.length) {
			for (const property of node.properties) {
				if (property.type !== 'Property' || property.kind !== 'init') continue;
				if (
					property.computed &&
					(property.key.type !== 'Literal' || typeof property.key.value !== 'string')
				) {
					continue;
				}
				if (get_hono_static_name(property.key, true) !== property_path[0]) continue;
				const found = resolve_async_component(property.value, property_path.slice(1), next_seen);
				if (found) return found;
			}
		}

		const reference = resolve_hono_reference(node, scopes.get(node) ?? analysis.scope);
		if (!reference || reference.binding.updated || !reference.binding.initial) return null;

		// Combine destructuring and member segments in root-to-leaf order.
		return resolve_async_component(
			reference.binding.initial,
			[...(destructured_paths.get(reference.binding) ?? []), ...reference.path, ...property_path],
			next_seen,
		);
	}

	walk(ast, analysis.scope);
	/** @type {AST.Function[]} */
	const components = [];
	const seen = new Set();
	for (const reference of jsx_references) {
		const found = resolve_async_component(reference.node, [], new Set());
		if (!found) continue;
		reference.node.metadata = /** @type {HonoNodeMetaData} */ ({
			...(reference.node.metadata || {}),
			hono_dom_local_async: true,
		});
		if (!seen.has(found)) {
			seen.add(found);
			components.push(found);
		}
	}
	return components;
}

/**
 * @param {AST.Node} node
 * @param {(child: AST.Node) => void} visit
 */
function for_each_hono_child(node, visit) {
	for (const key of Object.keys(node)) {
		if (AST_METADATA_KEYS.has(key)) continue;
		const value = /** @type {unknown} */ (/** @type {Record<string, unknown>} */ (node)[key]);
		for (const child of Array.isArray(value) ? value : [value]) {
			if (child && typeof child === 'object' && 'type' in child) {
				visit(/** @type {AST.Node} */ (child));
			}
		}
	}
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {AST.Node | null}
 */
function unwrap_hono_transparent_expression(node) {
	let expression = node ?? null;
	while (expression) {
		const child = /** @type {{ expression?: AST.Node }} */ (expression).expression;
		if (!child || !is_hono_transparent_expression_wrapper(expression, child)) return expression;
		expression = child;
	}
	return null;
}

/**
 * Hono's local resolver only needs wrappers that preserve an expression value.
 * Keep this boundary local because the core predicate is intentionally not a
 * public target API.
 *
 * @param {AST.Node} parent
 * @param {AST.Node} child
 * @returns {boolean}
 */
function is_hono_transparent_expression_wrapper(parent, child) {
	return (
		(parent.type === 'ParenthesizedExpression' ||
			parent.type === 'TSAsExpression' ||
			parent.type === 'TSSatisfiesExpression' ||
			parent.type === 'TSNonNullExpression' ||
			parent.type === 'TSInstantiationExpression' ||
			parent.type === 'TSTypeAssertion' ||
			parent.type === 'ChainExpression') &&
		/** @type {{ expression?: AST.Node }} */ (parent).expression === child
	);
}

/**
 * Resolve an identifier or static member without evaluating computed
 * expressions. `obj['App']` is statically known; `obj[key]` is not.
 *
 * @param {AST.Node | null | undefined} node
 * @param {import('@tsrx/core/types').ScopeInterface | null} scope
 * @returns {{ binding: import('@tsrx/core/types').Binding, path: string[] } | null}
 */
function resolve_hono_reference(node, scope) {
	if (!node || !scope) return null;
	const expression = unwrap_hono_transparent_expression(node);
	if (!expression) return null;
	if (expression.type === 'Identifier' || expression.type === 'JSXIdentifier') {
		const binding = scope.get(expression.name);
		return binding ? { binding, path: [] } : null;
	}
	if (expression.type === 'MemberExpression' || expression.type === 'JSXMemberExpression') {
		const base = resolve_hono_reference(expression.object, scope);
		const property_name =
			expression.type === 'MemberExpression'
				? get_hono_member_name(expression)
				: get_hono_static_name(expression.property);
		return base && property_name !== null
			? { binding: base.binding, path: [...base.path, property_name] }
			: null;
	}
	return null;
}

/**
 * @param {AST.MemberExpression} node
 * @returns {string | null}
 */
function get_hono_member_name(node) {
	if (node.computed) {
		return node.property.type === 'Literal' && typeof node.property.value === 'string'
			? node.property.value
			: null;
	}
	return get_hono_static_name(node.property);
}

/**
 * @param {AST.Node | null | undefined} node
 * @param {import('@tsrx/core/types').ScopeInterface | null} scope
 * @param {Map<import('@tsrx/core/types').Binding, string[]>} paths
 * @param {string[]} [path]
 */
function collect_hono_destructured_paths(node, scope, paths, path = []) {
	if (!node || !scope) return;
	const expression = unwrap_hono_transparent_expression(node);
	if (!expression) return;
	if (expression.type === 'Identifier') {
		if (path.length) {
			const binding = scope.get(expression.name);
			if (binding) paths.set(binding, path);
		}
		return;
	}
	if (expression.type === 'AssignmentPattern') {
		collect_hono_destructured_paths(expression.left, scope, paths, path);
		return;
	}
	if (expression.type !== 'ObjectPattern') return;
	for (const property of expression.properties) {
		if (property.type === 'RestElement') continue;
		if (
			property.computed &&
			(property.key.type !== 'Literal' || typeof property.key.value !== 'string')
		) {
			continue;
		}
		const property_name = get_hono_static_name(property.key, true);
		if (property_name !== null) {
			collect_hono_destructured_paths(property.value, scope, paths, [...path, property_name]);
		}
	}
}

/**
 * @param {AST.Node | null | undefined} node
 * @param {boolean} [allow_literal]
 * @returns {string | null}
 */
function get_hono_static_name(node, allow_literal = false) {
	if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return node.name;
	if (allow_literal && node?.type === 'Literal' && typeof node.value === 'string')
		return node.value;
	return null;
}
