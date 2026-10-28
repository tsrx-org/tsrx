/** @import * as AST from 'estree' */
/** @import * as ESTreeJSX from 'estree-jsx' */
/** @import { JsxPlatform, JsxTransformContext, TSRXAnalysisResult } from '@tsrx/core/types' */
/**
 * How an alias reaches a root binding: the alias's value at `held` is the
 * root's value at `path`. A `*` segment stands for any one key.
 * @typedef {{ root: import('@tsrx/core/types').Binding, path: string[], held: string[] }} HonoAliasLink
 */

import {
	builders as b,
	createJsxTransform,
	DIAGNOSTIC_CODES,
	error,
	extractIdentifiers,
	findFirstTopLevelAwait,
	findFirstTopLevelAwaitInTsrxFunctionBody,
	is_component_like_element as isComponentLikeElement,
	isFunctionNode,
} from '@tsrx/core';

/**
 * Work the DOM async-component check has done, for tests that check it grows
 * with the source rather than with every order of its aliases. Not public.
 */
export const hono_dom_validation_work = { resolution_steps: 0, exposure_updates: 0 };

const HONO_SERVER_SOURCE = 'hono/jsx';
const HONO_DOM_SOURCE = 'hono/jsx/dom';
const AST_METADATA_KEYS = new Set(['loc', 'start', 'end', 'metadata']);
// Built-ins that write properties of their first argument.
const HONO_PROPERTY_WRITERS = new Map([
	['Object', new Set(['assign', 'defineProperty', 'defineProperties'])],
	['Reflect', new Set(['set', 'defineProperty'])],
]);
// Built-ins that don't write their arguments, keep them or return any part of
// them. Every `console` method qualifies.
const HONO_READ_ONLY_CALLS = new Map([
	[
		'Object',
		new Set([
			'getOwnPropertyNames',
			'getOwnPropertySymbols',
			'hasOwn',
			'is',
			'isExtensible',
			'isFrozen',
			'isSealed',
			'keys',
		]),
	],
	['Reflect', new Set(['has', 'isExtensible', 'ownKeys'])],
	['JSON', new Set(['stringify'])],
	['Array', new Set(['isArray'])],
]);
// Built-ins that don't write their argument but return it (`freeze`), its
// members or its prototype, which other code can then write members of.
const HONO_MEMBER_CALLS = new Map([
	[
		'Object',
		new Set([
			'entries',
			'freeze',
			'getOwnPropertyDescriptor',
			'getOwnPropertyDescriptors',
			'getPrototypeOf',
			'values',
		]),
	],
	['Reflect', new Set(['getOwnPropertyDescriptor', 'getPrototypeOf'])],
]);
const HONO_READ_ONLY_FUNCTIONS = new Set(['String', 'Number', 'Boolean']);
// Alias chains can repeat member paths. Deeper exposures are cut to this
// depth, and a binding with more paths keeps one that covers them all; both
// only make them cover more.
const HONO_MAX_EXPOSED_DEPTH = 16;
const HONO_MAX_EXPOSED_PATHS = 16;
// `Object.prototype` methods that read the object they are called on.
const HONO_READ_ONLY_METHODS = new Set([
	'hasOwnProperty',
	'isPrototypeOf',
	'propertyIsEnumerable',
	'toLocaleString',
	'toString',
	'valueOf',
]);

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
					// Hono DOM JSX nodes carry mutable reconciliation and hook state.
					// Reusing any module-scoped node across mounts is unsafe, not only
					// reusing composite nodes.
					canHoistStaticNode() {
						return false;
					},
					validateComponentAwait(await_node, _component, ctx) {
						error(
							'Hono JSX DOM does not support top-level `await` in components. Use `use(promise)` with `<Suspense>` instead.',
							ctx.filename,
							await_node,
							ctx.errors,
							ctx.comments,
							DIAGNOSTIC_CODES.TARGET_AWAIT_UNSUPPORTED,
						);
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
			hostSpreadRefBinding: 'in-place',
			// Hono's server renderer escapes a string child of `<script>` like
			// text; `dangerouslySetInnerHTML` renders the body as written in both
			// modes.
			scriptBody: 'dangerouslySetInnerHTML',
		},
		validation: {
			// Server JSX supports async function components. The DOM renderer is
			// synchronous; use Hono's `use(promise)` + Suspense there instead.
			requireUseServerForAwait: is_dom,
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
			DIAGNOSTIC_CODES.TARGET_CATCH_RESET_UNSUPPORTED,
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

	const component = find_hono_dom_async_component(
		ast,
		context.analysis,
		context.collect ? (node) => find_hono_component_await(node) === null : undefined,
	);
	if (!component) return;

	error(
		'Hono JSX DOM does not support async components. Use use(promise) with <Suspense> instead.',
		filename,
		component,
		context.errors,
		context.comments,
		DIAGNOSTIC_CODES.TARGET_AWAIT_UNSUPPORTED,
	);
}

/**
 * Use the same await boundary as the core transform for both ordinary
 * functions and TSRX statement containers.
 *
 * @param {AST.Function} node
 * @returns {AST.Node | null}
 */
function find_hono_component_await(node) {
	if (node.body?.type === 'JSXCodeBlock') {
		return findFirstTopLevelAwaitInTsrxFunctionBody([
			...(node.body.body || []),
			...(node.body.render ? [node.body.render] : []),
		]);
	}

	return findFirstTopLevelAwait(node.body, false);
}

/**
 * Resolve only static same-module component references. Mutable bindings are
 * intentionally ignored: resolving their current value would require source
 * order and control-flow analysis. This keeps the validator conservative and
 * prevents a later assignment from changing the meaning of an earlier JSX use.
 *
 * @param {AST.Program} ast
 * @param {TSRXAnalysisResult} analysis
 * @param {(node: AST.Function) => boolean} [is_custom_diagnostic_candidate]
 * @returns {AST.Function | null}
 */
function find_hono_dom_async_component(ast, analysis, is_custom_diagnostic_candidate) {
	/** @type {Map<AST.Node, import('@tsrx/core/types').ScopeInterface | null>} */
	const scopes = new Map();
	/** @type {Array<{ node: AST.Node, scope: import('@tsrx/core/types').ScopeInterface | null }>} */
	const jsx_references = [];
	/** @type {Map<import('@tsrx/core/types').Binding, string[]>} */
	const destructured_paths = new Map();
	// Each alias maps to the bindings it can reach. Code that can write
	// through an alias can write the part of each root the alias reaches.
	/** @type {Map<import('@tsrx/core/types').Binding, HonoAliasLink[]>} */
	const alias_roots = new Map();
	// `r ||= UI` aliases `UI` only if it assigns, which is decided once every
	// write to `r` is known.
	/** @type {Array<{ alias: import('@tsrx/core/types').Binding, operator: AST.AssignmentOperator, links: HonoAliasLink[] }>} */
	const logical_aliases = [];
	/** @type {Map<import('@tsrx/core/types').Binding, number>} */
	const write_counts = new Map();
	/** @type {Map<import('@tsrx/core/types').Binding, AST.Expression | null>} */
	const plain_initializers = new Map();
	// For each binding, the member paths below which a write, or code this
	// pass does not follow, can replace members of its value.
	/** @type {Map<import('@tsrx/core/types').Binding, Array<{ path: string[], propagated: boolean }>>} */
	const exposed = new Map();
	// Functions resolved from an initializer and a member path, without and
	// with exposure ignored.
	/** @type {[Map<AST.Node, Map<string, AST.Function | null>>, Map<AST.Node, Map<string, AST.Function | null>>]} */
	const resolved_functions = [new Map(), new Map()];
	// How often the `seen` guard has stopped a resolution, so a result it cut
	// short isn't cached.
	let cycle_cuts = 0;

	/**
	 * @param {AST.Pattern} target
	 * @param {AST.Expression} value
	 * @param {import('@tsrx/core/types').ScopeInterface | null} scope
	 * @param {AST.AssignmentOperator} [operator]
	 * @param {boolean} [element] whether the target takes each element of the value
	 */
	function add_hono_aliases(target, value, scope, operator = '=', element = false) {
		const logical = is_hono_logical_operator(operator);
		if (operator !== '=' && !logical) return;
		for (const { identifier, path } of get_hono_alias_targets(target)) {
			const alias = scope?.get(identifier.name);
			if (!alias) continue;
			/** @type {HonoAliasLink[]} */
			const links = [];
			collect_hono_alias_roots(value, scope, links, element ? ['*', ...path] : path);
			if (!links.length) continue;
			if (logical) logical_aliases.push({ alias, operator, links });
			else link_hono_alias(alias, links);
		}
	}

	/**
	 * @param {import('@tsrx/core/types').Binding} alias
	 * @param {HonoAliasLink[]} links
	 */
	function link_hono_alias(alias, links) {
		alias_roots.set(alias, [...(alias_roots.get(alias) ?? []), ...links]);
	}

	/**
	 * Record that members of a binding's value below `path` can be replaced.
	 * A recorded path can already cover it, and it replaces the paths it
	 * covers. Aliases reassigned from each other can make a path for every
	 * order of their members, so a path an alias passes on is cut when long,
	 * and past a few such paths a binding keeps one that covers them all. Both
	 * only widen what is exposed, and each widening covers more, so alias
	 * cycles end quickly. A path the binding's own references expose is kept
	 * as it is.
	 *
	 * @param {import('@tsrx/core/types').Binding} binding
	 * @param {string[]} path
	 * @param {boolean} [propagated] whether an alias passed the path on
	 * @returns {string[] | null} the path the binding's exposure grew by
	 */
	function add_hono_exposure(binding, path, propagated = false) {
		hono_dom_validation_work.exposure_updates++;
		const added = propagated ? path.slice(0, HONO_MAX_EXPOSED_DEPTH) : path;
		const known = exposed.get(binding) ?? [];
		if (known.some((other) => covers_hono_path(other.path, added))) return null;
		let kept = known.filter((other) => !covers_hono_path(added, other.path));
		let grown = added;
		const others = kept.filter((other) => other.propagated);
		if (propagated && others.length >= HONO_MAX_EXPOSED_PATHS) {
			grown = get_hono_covering_path([...others.map((other) => other.path), added]);
			kept = kept.filter((other) => !covers_hono_path(grown, other.path));
		}
		exposed.set(binding, [...kept, { path: grown, propagated }]);
		return grown;
	}

	/**
	 * @param {AST.Node} target
	 * @param {import('@tsrx/core/types').ScopeInterface | null} scope
	 */
	function count_hono_writes(target, scope) {
		const pattern = unwrap_hono_transparent_expression(target);
		if (!pattern) return;
		for (const identifier of extractIdentifiers(/** @type {AST.Pattern} */ (pattern))) {
			const binding = scope?.get(identifier.name);
			if (binding) write_counts.set(binding, (write_counts.get(binding) ?? 0) + 1);
		}
	}

	/**
	 * Whether `binding ||= …`, `&&= …` or `??= …` can assign. It is known only
	 * for a `let` written nowhere else that starts as a literal-like value or
	 * as `undefined`.
	 *
	 * @param {import('@tsrx/core/types').Binding} binding
	 * @param {AST.AssignmentOperator} operator
	 * @returns {boolean}
	 */
	function can_hono_logical_assign(binding, operator) {
		if (binding.declaration_kind !== 'let' || write_counts.get(binding) !== 1) return true;
		const initializer = plain_initializers.get(binding);
		if (initializer === undefined) return true;
		const value = get_hono_static_truthiness(initializer);
		if (!value) return true;
		if (operator === '||=') return !value.truthy;
		if (operator === '&&=') return value.truthy;
		return value.nullish;
	}

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
		if (node.type === 'VariableDeclarator') {
			const binding = node.id.type === 'Identifier' ? scope?.get(node.id.name) : null;
			if (binding) plain_initializers.set(binding, node.init ?? null);
		}
		if (node.type === 'VariableDeclarator' && node.init) {
			collect_hono_destructured_paths(node.id, scope, destructured_paths);
			add_hono_aliases(node.id, node.init, scope);
		}
		if (node.type === 'AssignmentExpression') {
			count_hono_writes(node.left, scope);
			add_hono_aliases(node.left, node.right, scope, node.operator);
		}
		if (node.type === 'AssignmentPattern') {
			// A default, of a parameter or in destructuring, can be the value.
			add_hono_aliases(node.left, node.right, scope);
		}
		if (node.type === 'UpdateExpression') {
			count_hono_writes(node.argument, scope);
		}
		if (
			(node.type === 'ForOfStatement' ||
				node.type === 'ForInStatement' ||
				node.type === 'JSXForExpression') &&
			'left' in node
		) {
			// The loop writes each value it takes to its head, declared there or not.
			const left = node.left;
			const targets =
				left.type === 'VariableDeclaration'
					? left.declarations.map((declarator) => declarator.id)
					: [left];
			for (const target of targets) {
				count_hono_writes(target, scope);
				// A `for…of` head takes each element of the iterated value.
				if (
					node.type === 'ForOfStatement' ||
					(node.type === 'JSXForExpression' && node.statementType === 'ForOfStatement')
				) {
					add_hono_aliases(target, node.right, scope, '=', true);
				}
			}
		}

		for_each_hono_child(node, (child) => walk(child, scope));
	}

	/**
	 * @param {AST.Node} node
	 * @returns {AST.Function | null}
	 */
	function resolve_async_component(node) {
		const value = resolve_hono_function(node, [], new Set(), false);
		if (!value?.async) return null;
		if (is_custom_diagnostic_candidate && !is_custom_diagnostic_candidate(value)) return null;
		return value;
	}

	/**
	 * The function a static reference resolves to through known initializers.
	 * With `ignore_exposure`, a member that a write or other code may replace
	 * still resolves to its initializer.
	 *
	 * @param {AST.Node | null | undefined} node
	 * @param {string[]} property_path
	 * @param {Set<AST.Node>} seen
	 * @param {boolean} ignore_exposure
	 * @returns {AST.Function | null}
	 */
	function resolve_hono_function(node, property_path, seen, ignore_exposure) {
		hono_dom_validation_work.resolution_steps++;
		if (!node) return null;
		if (seen.has(node)) {
			cycle_cuts++;
			return null;
		}
		seen.add(node);
		const value = resolve_hono_function_step(node, property_path, seen, ignore_exposure);
		seen.delete(node);
		return value;
	}

	/**
	 * One step of {@link resolve_hono_function}, with `node` on the `seen` stack.
	 *
	 * @param {AST.Node} node
	 * @param {string[]} property_path
	 * @param {Set<AST.Node>} seen
	 * @param {boolean} ignore_exposure
	 * @returns {AST.Function | null}
	 */
	function resolve_hono_function_step(node, property_path, seen, ignore_exposure) {
		const expression = unwrap_hono_transparent_expression(node);
		if (expression !== node) {
			return resolve_hono_function(expression, property_path, seen, ignore_exposure);
		}

		if (isFunctionNode(node)) return property_path.length ? null : node;

		if (node.type === 'ObjectExpression' && property_path.length) {
			// Later properties replace earlier ones. A spread or dynamic key can
			// replace any earlier member, so stop unless a later static definition
			// has already established the effective value.
			for (let index = node.properties.length - 1; index >= 0; index--) {
				const property = node.properties[index];
				if (property.type !== 'Property') return null;
				if (
					property.computed &&
					(property.key.type !== 'Literal' || typeof property.key.value !== 'string')
				) {
					return null;
				}
				if (get_hono_static_name(property.key, true) !== property_path[0]) continue;
				// Accessors also replace data properties, but resolving their return
				// values would require execution rather than static reference lookup.
				return property.kind === 'init'
					? resolve_hono_function(property.value, property_path.slice(1), seen, ignore_exposure)
					: null;
			}
			return null;
		}

		const reference = resolve_hono_reference(node, scopes.get(node) ?? analysis.scope);
		if (
			!reference ||
			reference.binding.reassigned ||
			(!ignore_exposure &&
				is_hono_exposed(reference.binding, [...reference.path, ...property_path])) ||
			!reference.binding.initial
		) {
			return null;
		}

		// Combine destructuring and member segments in root-to-leaf order.
		const initial = reference.binding.initial;
		const path = [
			...(destructured_paths.get(reference.binding) ?? []),
			...reference.path,
			...property_path,
		];
		// Each step leads to one next step, so a value resolves the same from
		// wherever it is reached, unless the `seen` guard cut it short: a node
		// already on the stack can still resolve with another member path.
		const cache = resolved_functions[ignore_exposure ? 1 : 0];
		const key = path.join('\0');
		const values = cache.get(initial) ?? new Map();
		cache.set(initial, values);
		if (values.has(key)) return values.get(key) ?? null;
		const cuts = cycle_cuts;
		const value = resolve_hono_function(initial, path, seen, ignore_exposure);
		if (value || cycle_cuts === cuts) values.set(key, value);
		return value;
	}

	/**
	 * Whether a method call's callee is an arrow function, which can't reach
	 * the object it's called on through `this`. Writes don't matter: one that
	 * could replace the method exposes the object anyway.
	 *
	 * @param {AST.MemberExpression} callee
	 * @returns {boolean}
	 */
	function is_hono_arrow_method(callee) {
		return resolve_hono_function(callee, [], new Set(), true)?.type === 'ArrowFunctionExpression';
	}

	/**
	 * Whether a write, or code this pass does not follow, can replace the
	 * member at `path` of the binding's value.
	 *
	 * @param {import('@tsrx/core/types').Binding} binding
	 * @param {string[]} path
	 * @returns {boolean}
	 */
	function is_hono_exposed(binding, path) {
		return !!exposed
			.get(binding)
			?.some(
				(exposure) => exposure.path.length < path.length && covers_hono_path(exposure.path, path),
			);
	}

	walk(ast, analysis.scope);
	for (const { alias, operator, links } of logical_aliases) {
		if (can_hono_logical_assign(alias, operator)) link_hono_alias(alias, links);
	}
	for (const scope of new Set([analysis.scope, ...analysis.scopes.values()])) {
		for (const binding of scope.declarations.values()) {
			for (const reference of binding.references) {
				if (reference.node === binding.node) continue;
				const path = get_hono_exposed_path(
					reference.node,
					reference.path,
					scopes,
					is_hono_arrow_method,
				);
				if (path) add_hono_exposure(binding, path);
			}
		}
	}
	// An exposed alias exposes the part of each root it can reach.
	/** @type {Array<[import('@tsrx/core/types').Binding, string[]]>} */
	const pending = [...exposed].flatMap(([binding, exposures]) =>
		exposures.map(({ path }) => /** @type {[typeof binding, string[]]} */ ([binding, path])),
	);
	for (let entry = pending.pop(); entry; entry = pending.pop()) {
		const [alias, path] = entry;
		for (const link of alias_roots.get(alias) ?? []) {
			const root_path = get_hono_root_exposure(link, path);
			const grown = root_path && add_hono_exposure(link.root, root_path, true);
			if (grown) pending.push([link.root, grown]);
		}
	}
	for (const reference of jsx_references) {
		const found = resolve_async_component(reference.node);
		if (found) return found;
	}
	return null;
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
 * Collect the bindings an alias of `node[path]` can reach, and where. A
 * holder (an object or array literal) holds each value at its key or index.
 * A dynamic key, a member read by number, an element after a spread and an
 * iteration step are `*`. A spread copies members, so it holds nothing.
 *
 * @param {AST.Node | null | undefined} node
 * @param {import('@tsrx/core/types').ScopeInterface | null} scope
 * @param {HonoAliasLink[]} links
 * @param {string[]} [path] the member path the alias takes below `node`
 * @param {string[]} [held] where `node` sits in the alias's value
 */
function collect_hono_alias_roots(node, scope, links, path = [], held = []) {
	const expression = unwrap_hono_transparent_expression(node);
	if (!expression || !scope) return;
	if (expression.type === 'Identifier') {
		const binding = scope.get(expression.name);
		if (binding) links.push({ root: binding, path, held });
	} else if (expression.type === 'MemberExpression') {
		const name = get_hono_member_name(expression) ?? '*';
		collect_hono_alias_roots(expression.object, scope, links, [name, ...path], held);
	} else if (expression.type === 'ConditionalExpression') {
		collect_hono_alias_roots(expression.consequent, scope, links, path, held);
		collect_hono_alias_roots(expression.alternate, scope, links, path, held);
	} else if (expression.type === 'LogicalExpression') {
		collect_hono_alias_roots(expression.left, scope, links, path, held);
		collect_hono_alias_roots(expression.right, scope, links, path, held);
	} else if (expression.type === 'SequenceExpression') {
		collect_hono_alias_roots(expression.expressions.at(-1), scope, links, path, held);
	} else if (expression.type === 'AssignmentExpression') {
		if (expression.operator !== '=') {
			collect_hono_alias_roots(expression.left, scope, links, path, held);
		}
		if (expression.operator === '=' || is_hono_logical_operator(expression.operator)) {
			collect_hono_alias_roots(expression.right, scope, links, path, held);
		}
	} else if (expression.type === 'ObjectExpression' || expression.type === 'ArrayExpression') {
		/** @type {Array<{ key: string, value: AST.Node }>} */
		const entries = [];
		if (expression.type === 'ObjectExpression') {
			for (const property of expression.properties) {
				if (property.type === 'Property') {
					entries.push({ key: get_hono_property_key(property), value: property.value });
				}
			}
		} else {
			// A spread moves every later element to an index that is not known.
			let spread = false;
			expression.elements.forEach((element, index) => {
				if (element?.type === 'SpreadElement') spread = true;
				else if (element) entries.push({ key: spread ? '*' : String(index), value: element });
			});
		}
		for (const { key, value } of entries) {
			if (!path.length) {
				collect_hono_alias_roots(value, scope, links, [], [...held, key]);
			} else if (may_match_hono_segment(key, path[0])) {
				collect_hono_alias_roots(value, scope, links, path.slice(1), held);
			}
		}
	}
}

/**
 * Where exposing an alias's value below `path` exposes a root it reaches, if
 * at all. Exposing it above where the root sits exposes all of the root.
 *
 * @param {HonoAliasLink} link
 * @param {string[]} path
 * @returns {string[] | null}
 */
function get_hono_root_exposure(link, path) {
	const shared = Math.min(path.length, link.held.length);
	for (let index = 0; index < shared; index++) {
		if (!may_match_hono_segment(path[index], link.held[index])) return null;
	}
	return path.length < link.held.length
		? link.path
		: [...link.path, ...path.slice(link.held.length)];
}

/**
 * Whether `prefix` covers the start of `path`. A `*` in `prefix` covers any
 * key.
 *
 * @param {string[]} prefix
 * @param {string[]} path
 * @returns {boolean}
 */
function covers_hono_path(prefix, path) {
	return (
		prefix.length <= path.length &&
		prefix.every((segment, index) => segment === '*' || segment === path[index])
	);
}

/**
 * The longest path that covers every one of `paths`, with `*` where they
 * differ.
 *
 * @param {string[][]} paths
 * @returns {string[]}
 */
function get_hono_covering_path(paths) {
	const length = Math.min(...paths.map((path) => path.length));
	return Array.from({ length }, (_, index) =>
		paths.every((path) => path[index] === paths[0][index]) ? paths[0][index] : '*',
	);
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function may_match_hono_segment(left, right) {
	return left === '*' || right === '*' || left === right;
}

/**
 * @param {AST.Property} property
 * @returns {string}
 */
function get_hono_property_key(property) {
	if (
		property.computed &&
		(property.key.type !== 'Literal' || typeof property.key.value !== 'string')
	) {
		return '*';
	}
	return get_hono_static_name(property.key, true) ?? '*';
}

/**
 * @param {string} operator
 * @returns {boolean}
 */
function is_hono_logical_operator(operator) {
	return operator === '||=' || operator === '&&=' || operator === '??=';
}

/**
 * The member path below which a reference's value can have members
 * replaced: code this pass does not follow that the value reaches, as an
 * argument, the object of a method call, a returned or yielded value, a
 * component's prop or a value stored in a member, or a write through it. A
 * write to `x.k` counts as replacing any member of `x`, since a setter can
 * run. A dynamic key is `*`. Inside a holder the path stops, since later
 * member steps act on the holder. `null` means the reference only reads the
 * value, copies its members, or hands it to an alias this pass tracks.
 *
 * @param {AST.Identifier} identifier
 * @param {AST.Node[]} ancestors
 * @param {Map<AST.Node, import('@tsrx/core/types').ScopeInterface | null>} scopes
 * @param {(callee: AST.MemberExpression) => boolean} is_arrow_method
 * @returns {string[] | null}
 */
function get_hono_exposed_path(identifier, ancestors, scopes, is_arrow_method) {
	/** @type {string[]} */
	const path = [];
	// Inside a holder, member steps act on the holder, not on the reference.
	let held = false;
	// The member step just taken, which a call or a write acts on.
	/** @type {{ node: AST.MemberExpression, object_path: string[] } | null} */
	let member = null;
	/** @type {AST.Node} */
	let child = identifier;

	for (let index = ancestors.length - 1; index >= 0; index--) {
		const parent = ancestors[index];
		if (is_hono_transparent_expression_wrapper(parent, child)) {
			child = parent;
			continue;
		}
		const step = member;
		member = null;
		switch (parent.type) {
			case 'MemberExpression': {
				// A computed key is read, not exposed.
				if (parent.object !== child) return null;
				member = { node: parent, object_path: [...path] };
				if (!held) path.push(get_hono_member_name(parent) ?? '*');
				break;
			}
			case 'Property':
				if (parent.value !== child) return null;
				if (ancestors[index - 1]?.type !== 'ObjectExpression') return step?.object_path ?? null;
				held = true;
				index--;
				child = /** @type {AST.Node} */ (ancestors[index]);
				continue;
			case 'ArrayExpression':
				held = true;
				break;
			case 'SpreadElement': {
				// A spread into a literal copies; a spread argument is passed.
				const holder = ancestors[index - 1]?.type;
				if (holder === 'ObjectExpression' || holder === 'ArrayExpression') return null;
				break;
			}
			case 'ConditionalExpression':
				if (parent.test === child) return null;
				break;
			case 'LogicalExpression':
				break;
			case 'SequenceExpression':
				if (parent.expressions.at(-1) !== child) return null;
				break;
			case 'AssignmentExpression':
				if (parent.left === child) return step?.object_path ?? null;
				if (parent.operator !== '=' && !is_hono_logical_operator(parent.operator)) return null;
				if (has_hono_member_target(parent.left)) return path;
				break;
			case 'AssignmentPattern':
				if (parent.left === child) return step?.object_path ?? null;
				return has_hono_member_target(parent.left) ? path : null;
			case 'ArrayPattern':
			case 'ObjectPattern':
			case 'RestElement':
			case 'UpdateExpression':
				return step?.object_path ?? null;
			case 'UnaryExpression':
				return parent.operator === 'delete' ? (step?.object_path ?? null) : null;
			case 'ForOfStatement':
			case 'ForInStatement':
			case 'JSXForExpression':
				return 'left' in parent && parent.left === child ? (step?.object_path ?? null) : null;
			case 'CallExpression':
			case 'TaggedTemplateExpression': {
				const callee = parent.type === 'CallExpression' ? parent.callee : parent.tag;
				if (callee === child) {
					// A method call passes its object as `this`, which an arrow function
					// ignores.
					if (!step) return null;
					const method = get_hono_member_name(step.node);
					if (method !== null && HONO_READ_ONLY_METHODS.has(method)) return null;
					return is_arrow_method(step.node) ? null : step.object_path;
				}
				if (parent.type === 'TaggedTemplateExpression') return null;
				const scope = scopes.get(parent) ?? null;
				if (
					is_hono_known_call(callee, scope, HONO_READ_ONLY_CALLS) &&
					!has_hono_function_replacer(parent)
				) {
					return null;
				}
				// It hands its argument's members on, so any member can have its
				// own members replaced.
				if (is_hono_known_call(callee, scope, HONO_MEMBER_CALLS)) {
					return held ? path : [...path, '*'];
				}
				// A built-in writer replaces members of its first argument.
				// `Object.assign` copies the members of its sources, unless a holder
				// passes the value itself.
				if (
					get_hono_property_writer(callee) === 'assign' &&
					parent.arguments[0] !== child &&
					!held
				) {
					return null;
				}
				return path;
			}
			case 'TemplateLiteral':
				return ancestors[index - 1]?.type === 'TaggedTemplateExpression' ? path : null;
			case 'JSXExpressionContainer': {
				// The tag is only read. A host element renders its children and reads
				// its attributes, except `ref`, which it writes `current` to.
				const owner = ancestors[index - 1];
				if (owner?.type === 'JSXOpeningElement') return owner.name === parent ? null : path;
				if (owner?.type === 'JSXFragment') return null;
				if (owner?.type === 'JSXElement') return is_hono_host_element(owner) ? null : path;
				if (owner?.type === 'JSXAttribute') {
					const element = ancestors[index - 3];
					const is_ref = owner.name.type === 'JSXIdentifier' && owner.name.name === 'ref';
					return !is_ref && element?.type === 'JSXElement' && is_hono_host_element(element)
						? null
						: path;
				}
				return path;
			}
			case 'NewExpression':
				return parent.callee === child ? null : path;
			case 'ArrowFunctionExpression':
				return parent.body === child ? path : null;
			case 'ExpressionStatement':
			case 'BinaryExpression':
			case 'IfStatement':
			case 'WhileStatement':
			case 'DoWhileStatement':
			case 'ForStatement':
			case 'SwitchStatement':
			case 'SwitchCase':
			case 'JSXIfExpression':
			case 'JSXSwitchExpression':
			case 'VariableDeclarator':
			case 'JSXSpreadAttribute':
			case 'ExportSpecifier':
			case 'ExportDefaultDeclaration':
			case 'ClassDeclaration':
			case 'ClassExpression':
			case 'FunctionDeclaration':
			case 'FunctionExpression':
				return null;
			default:
				return path;
		}
		child = parent;
	}
	return null;
}

/**
 * The names a pattern binds to its value or to a part of it, each with the
 * member path it takes: an array element's is its index, and a dynamic
 * key's is `*`. A rest element binds a new object or array, so it is left
 * out.
 *
 * @param {AST.Node | null} node
 * @param {string[]} [path]
 * @returns {Array<{ identifier: AST.Identifier, path: string[] }>}
 */
function get_hono_alias_targets(node, path = []) {
	const pattern = unwrap_hono_transparent_expression(node);
	if (pattern?.type === 'Identifier') return [{ identifier: pattern, path }];
	if (pattern?.type === 'AssignmentPattern') return get_hono_alias_targets(pattern.left, path);
	if (pattern?.type === 'ObjectPattern') {
		return pattern.properties.flatMap((property) =>
			property.type === 'RestElement'
				? []
				: get_hono_alias_targets(property.value, [...path, get_hono_property_key(property)]),
		);
	}
	if (pattern?.type === 'ArrayPattern') {
		return pattern.elements.flatMap((element, index) =>
			!element || element.type === 'RestElement'
				? []
				: get_hono_alias_targets(element, [...path, String(index)]),
		);
	}
	return [];
}

/**
 * The truthiness of a value written as a literal, or of a missing
 * initializer, which leaves `undefined`.
 *
 * @param {AST.Expression | null} node
 * @returns {{ truthy: boolean, nullish: boolean } | null}
 */
function get_hono_static_truthiness(node) {
	const expression = node && unwrap_hono_transparent_expression(node);
	if (!expression) return { truthy: false, nullish: true };
	if (expression.type === 'Literal' && !('regex' in expression)) {
		return { truthy: !!expression.value, nullish: expression.value === null };
	}
	return expression.type === 'ObjectExpression' ||
		expression.type === 'ArrayExpression' ||
		expression.type === 'NewExpression' ||
		expression.type === 'ClassExpression' ||
		expression.type === 'JSXElement' ||
		expression.type === 'JSXFragment' ||
		isFunctionNode(expression)
		? { truthy: true, nullish: false }
		: null;
}

/**
 * The method name of a built-in that writes its first argument's properties.
 *
 * @param {AST.Node} callee
 * @returns {string | null}
 */
function get_hono_property_writer(callee) {
	const expression = unwrap_hono_transparent_expression(callee);
	if (expression?.type !== 'MemberExpression' || expression.object.type !== 'Identifier') {
		return null;
	}
	const name = get_hono_member_name(expression);
	return name !== null && HONO_PROPERTY_WRITERS.get(expression.object.name)?.has(name)
		? name
		: null;
}

/**
 * Whether a `JSON.stringify` call may have a function replacer, which gets
 * every value it serializes and can write it.
 *
 * @param {AST.CallExpression} call
 * @returns {boolean}
 */
function has_hono_function_replacer(call) {
	const callee = unwrap_hono_transparent_expression(call.callee);
	if (
		callee?.type !== 'MemberExpression' ||
		callee.object.type !== 'Identifier' ||
		callee.object.name !== 'JSON'
	) {
		return false;
	}
	const replacer = call.arguments[1];
	return !(
		!replacer ||
		replacer.type === 'Literal' ||
		replacer.type === 'ArrayExpression' ||
		(replacer.type === 'Identifier' && replacer.name === 'undefined')
	);
}

/**
 * Whether a call's callee is one of `calls`, the global functions when they
 * are the read-only ones, and every `console` method, unless a local binding
 * shadows its name.
 *
 * @param {AST.Node} callee
 * @param {import('@tsrx/core/types').ScopeInterface | null} scope
 * @param {Map<string, Set<string>>} calls
 * @returns {boolean}
 */
function is_hono_known_call(callee, scope, calls) {
	const read_only = calls === HONO_READ_ONLY_CALLS;
	const expression = unwrap_hono_transparent_expression(callee);
	if (expression?.type === 'Identifier') {
		return (
			read_only && HONO_READ_ONLY_FUNCTIONS.has(expression.name) && !scope?.get(expression.name)
		);
	}
	if (expression?.type !== 'MemberExpression' || expression.object.type !== 'Identifier') {
		return false;
	}
	const global = expression.object.name;
	if (scope?.get(global)) return false;
	const name = get_hono_member_name(expression);
	return (read_only && global === 'console') || (name !== null && !!calls.get(global)?.has(name));
}

/**
 * @param {AST.TSRXJSXElement | ESTreeJSX.JSXElement} element
 * @returns {boolean}
 */
function is_hono_host_element(element) {
	return element.openingElement.name.type === 'JSXIdentifier' && !isComponentLikeElement(element);
}

/**
 * Whether an assignment target stores into a member, at any depth of a
 * destructuring pattern.
 *
 * @param {AST.Node | null} node
 * @returns {boolean}
 */
function has_hono_member_target(node) {
	const pattern = unwrap_hono_transparent_expression(node);
	if (pattern?.type === 'MemberExpression') return true;
	if (pattern?.type === 'AssignmentPattern') return has_hono_member_target(pattern.left);
	if (pattern?.type === 'RestElement') return has_hono_member_target(pattern.argument);
	if (pattern?.type === 'ObjectPattern') {
		return pattern.properties.some((property) =>
			has_hono_member_target(property.type === 'RestElement' ? property : property.value),
		);
	}
	if (pattern?.type === 'ArrayPattern') {
		return pattern.elements.some((element) => has_hono_member_target(element));
	}
	return false;
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
