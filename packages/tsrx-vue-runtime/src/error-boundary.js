/** @import { ComponentInternalInstance, ShallowRef } from 'vue' */
/** @import { TsrxErrorBoundaryProps, TsrxPendingBodyProps } from '../types/error-boundary' */
/** @import { VaporBlock, VaporFragment, VaporRenderedBlock, VaporRuntime } from '../types/vapor-runtime' */

import * as Vue from 'vue';
import {
	EffectScope,
	ErrorCodes,
	getCurrentInstance,
	handleError,
	onErrorCaptured,
	shallowRef,
} from 'vue';

/**
 * The Vapor renderer's fragment/component helpers are runtime-internal, so
 * `vue`'s published types don't describe them and there is no upstream
 * declaration to widen. Narrow the namespace object once here; every use below
 * is checked against {@link VaporRuntime}.
 */
const vapor = /** @type {VaporRuntime} */ (/** @type {unknown} */ (Vue));

/**
 * @typedef {object} BoundaryState
 * @property {ShallowRef<number>} version bumped to render the boundary again
 * @property {{ error: unknown } | null} caught the error the fallback shows
 * @property {number | null} fallback_from while the fallback shows, a
 * component uid taken as it first rendered: Vue numbers components in the
 * order it creates them, so the fallback's have later uids, and the content's
 * earlier ones
 * @property {() => void} reset
 */

/** @typedef {{ asyncDep?: Promise<unknown> | null, asyncResolved?: boolean }} AsyncSetupState */

/** @typedef {{ parent?: InstanceLink | null, $?: InstanceLink }} InstanceLink */

/**
 * @typedef {object} RenderFrame
 * @property {unknown} instance the instance current while the boundary renders
 * @property {unknown[]} errors what its content threw, first one first
 */

/** @type {WeakMap<ComponentInternalInstance, BoundaryState>} */
const boundary_states = new WeakMap();

/**
 * The boundaries rendering their content right now, innermost last. Vue hands
 * an error to the nearest `onErrorCaptured` hook, which can belong to an outer
 * boundary (a boundary called as a plain function has no instance of its
 * own), so the hook passes the error on to the innermost rendering boundary
 * that contains the component that threw.
 *
 * @type {RenderFrame[]}
 */
const rendering = [];

/**
 * The instance of a boundary rendered as a component. Vapor calls a
 * component's setup with its instance as the second argument. A plain-function
 * call, which earlier compilers emitted inside element children, runs under
 * the enclosing component's instance and must not take over its state.
 * `getCurrentInstance()` returns null for a Vapor instance.
 *
 * @param {unknown} ctx
 * @returns {ComponentInternalInstance | null}
 */
function own_instance(ctx) {
	const instance = vapor.currentInstance ?? getCurrentInstance();
	return instance && ctx === instance ? instance : null;
}

/**
 * The innermost rendering boundary whose content contains `source`, the
 * component an error came from, up to `owner`, the boundary whose hook
 * caught it. A boundary rendering further out isn't the error's: a
 * `Suspense` mounts its content, and calls its fallback, after the boundary
 * around it has rendered, so a boundary inside it can catch an error while an
 * outer boundary is still rendering.
 *
 * @param {unknown} source a Vapor instance, or a VDOM component's public proxy
 * @param {unknown} owner the instance of the boundary whose hook caught it,
 * or null to look at every boundary rendering around `source`
 * @returns {RenderFrame | undefined}
 */
function find_render_frame(source, owner) {
	if (rendering.length === 0) return undefined;
	const link = /** @type {InstanceLink | null} */ (source);
	/** @type {Set<unknown>} */
	const ancestors = new Set();
	/** @type {InstanceLink | null | undefined} */
	let current = link?.$ ?? link;
	for (; current; current = current.parent) {
		ancestors.add(current);
		if (current === owner) break;
	}
	for (let i = rendering.length - 1; i >= 0; i--) {
		if (ancestors.has(rendering[i].instance)) return rendering[i];
	}
	return undefined;
}

/**
 * The props of a boundary rendered as a component.
 *
 * @param {ComponentInternalInstance} instance
 * @returns {TsrxErrorBoundaryProps | undefined}
 */
function props_of(instance) {
	return /** @type {TsrxErrorBoundaryProps | undefined} */ (
		/** @type {{ props?: unknown }} */ (instance).props
	);
}

/**
 * The instance of the component an error came from, and its parents up to
 * `boundary`, innermost first; empty when `boundary` isn't among them.
 *
 * @param {unknown} source a Vapor instance, or a VDOM component's public proxy
 * @param {unknown} boundary
 * @returns {InstanceLink[]}
 */
function chain_to(source, boundary) {
	const link = /** @type {InstanceLink | null} */ (source);
	/** @type {InstanceLink[]} */
	const chain = [];
	/** @type {InstanceLink | null | undefined} */
	let current = link?.$ ?? link;
	for (; current; current = current.parent) {
		if (current === boundary) return chain;
		chain.push(current);
	}
	return [];
}

/**
 * Whether the error from `source` came from the fallback `boundary` shows:
 * the component under the boundary that `source` belongs to was created after
 * the fallback started to render. That covers what the fallback mounts later,
 * such as a VDOM component or a `Teleport`'s content, and what it throws after
 * it has rendered. A component of the content was created before, and an
 * error from it, or from what it creates later, is the boundary's own.
 *
 * @param {unknown} source
 * @param {ComponentInternalInstance} boundary
 * @returns {boolean}
 */
function thrown_by_fallback(source, boundary) {
	const from = boundary_states.get(boundary)?.fallback_from;
	if (from == null) return false;
	const chain = chain_to(source, boundary);
	const top = /** @type {{ uid?: number } | undefined} */ (chain[chain.length - 1]);
	return typeof top?.uid === 'number' && top.uid > from;
}

/**
 * Whether `source`'s error was thrown by the fallback of a boundary inside
 * `boundary` that renders the same `@catch` (`sharesCatch`), with no other
 * boundary between them. A `@try` with `@pending` renders its `@catch` from
 * two boundaries: one around the `Suspense`, and one inside its default slot,
 * which catches what the body throws there and gives `reset`. When the inner
 * one lets an error from that `@catch` go on, the outer one has to as well,
 * so the `@catch` runs once and the error reaches the next `@try` out.
 *
 * @param {unknown} source
 * @param {ComponentInternalInstance} boundary
 * @returns {boolean}
 */
function thrown_by_twin_fallback(source, boundary) {
	const chain = chain_to(source, boundary);
	for (let i = chain.length - 1; i >= 0; i--) {
		const inner = /** @type {ComponentInternalInstance} */ (/** @type {unknown} */ (chain[i]));
		if (!boundary_states.has(inner)) continue;
		// The nearest boundary inside this one.
		return !!props_of(inner)?.sharesCatch && thrown_by_fallback(source, inner);
	}
	return false;
}

/**
 * @param {VaporBlock} nodes
 * @param {Node} [anchor]
 * @returns {VaporFragment}
 */
function create_fragment(nodes, anchor = document.createTextNode('')) {
	const fragment = new vapor.VaporFragment(nodes);
	fragment.anchor = anchor;
	return fragment;
}

/**
 * @param {Record<string, unknown> | null | undefined} value
 * @returns {void}
 */
function track_dynamic_values(value) {
	if (!value || typeof value !== 'object') return;

	for (const key of Object.keys(value)) {
		const child = value[key];
		if (key === 'content' || key === 'fallback' || key === 'children' || key === 'default')
			continue;
		if (key === '$' || key.startsWith('on')) continue;
		if (typeof child === 'function') {
			child();
		}
	}
}

/**
 * The wrapper `normalize_block` gave each fragment that had no anchor.
 *
 * @type {WeakMap<VaporFragment, VaporFragment>}
 */
const anchored_fragments = new WeakMap();

/**
 * @param {unknown} node
 * @param {Node | undefined} anchor
 * @returns {VaporRenderedBlock}
 */
function normalize_block(node, anchor) {
	if (node instanceof Node) return node;
	if (vapor.isFragment(node)) {
		if (node.anchor) return node;
		// A fragment with no anchor of its own, such as the one Vapor makes for
		// a VDOM component like `Suspense`, gets one, so that a later render can
		// find where it is to replace it. The same fragment keeps the same
		// wrapper, so rendering it again leaves it in place.
		let wrapper = anchored_fragments.get(node);
		if (!wrapper) {
			wrapper = create_fragment(node, anchor);
			anchored_fragments.set(node, wrapper);
		}
		return wrapper;
	}
	if (vapor.isVaporComponent(node)) {
		if (!(node.rawProps && 'content' in node.rawProps && 'fallback' in node.rawProps)) {
			track_dynamic_values(node.rawProps);
		}
		return create_fragment(node, anchor);
	}
	if (Array.isArray(node))
		return create_fragment(
			node.map((item) => normalize_block(item, undefined)),
			anchor,
		);

	const result = node == null || typeof node === 'boolean' ? '' : String(node);
	if (anchor) {
		anchor.textContent = result;
		return anchor;
	}
	return document.createTextNode(result);
}

/**
 * Whether `node` is part of `block`: the block itself, an anchor in it, or
 * anything it holds.
 *
 * @param {VaporBlock | undefined} block
 * @param {Node} node
 * @returns {boolean}
 */
function uses_node(block, node) {
	if (block === node) return true;
	if (!block || block instanceof Node) return false;
	if (Array.isArray(block)) return block.some((item) => uses_node(item, node));
	if (vapor.isFragment(block)) return block.anchor === node || uses_node(block.nodes, node);
	if (vapor.isVaporComponent(block)) return uses_node(block.block, node);
	return false;
}

/**
 * @param {VaporRenderedBlock | undefined} current
 * @param {unknown} value
 * @param {Node | undefined} anchor
 * @returns {VaporRenderedBlock}
 */
function resolve_value(current, value, anchor) {
	anchor = anchor || (current instanceof Node && current.nodeType === 3 ? current : undefined);
	const node = normalize_block(value, anchor);
	// The same block again is already in place.
	if (node === current) return node;

	if (current) {
		if (vapor.isFragment(current)) {
			const old_anchor = current.anchor;
			if (old_anchor && old_anchor.parentNode) {
				const parent = old_anchor.parentNode;
				vapor.remove(current.nodes, parent);
				vapor.insert(node, parent, old_anchor);
				// Unless the new block holds that node, the old anchor would stay
				// behind outside every block, also after unmount.
				if (!uses_node(node, old_anchor)) parent.removeChild(old_anchor);
				if (current.scope) current.scope.stop();
			}
		} else if (current instanceof Node) {
			if (current.nodeType === 3 && (!(node instanceof Node) || node.nodeType !== 3)) {
				current.textContent = '';
			}
			if (vapor.isFragment(node) && current.parentNode) {
				vapor.insert(node, current.parentNode, current);
				// A text node becomes the anchor of a fragment made around the new
				// value. A fragment with an anchor of its own, such as a `v-if`
				// root, doesn't take it.
				if (!uses_node(node, current)) current.parentNode.removeChild(current);
			} else if (node instanceof Node) {
				if (current.nodeType === 3 && node.nodeType === 3) {
					current.textContent = node.textContent;
					return current;
				}
				if (current.parentNode) current.parentNode.replaceChild(node, current);
			}
		}
	}

	return node;
}

/**
 * @param {() => unknown} render
 * @returns {Array<VaporRenderedBlock | undefined>}
 */
function create_boundary_nodes(render) {
	/** @type {Array<VaporRenderedBlock | undefined>} */
	const nodes = [];
	/** @type {EffectScope | undefined} */
	let scope;

	vapor.renderEffect(() => {
		if (scope) scope.stop();
		scope = new EffectScope();
		nodes[0] = scope.run(() => resolve_value(nodes[0], render(), undefined));
	});

	return nodes;
}

/**
 * A reusable Vue error boundary component.
 *
 * Used by the `@tsrx/vue` compiler to implement `try/catch` blocks.
 * The `fallback` prop receives the caught error and a `reset` function
 * that clears the error state to re-render the children.
 *
 * @param {TsrxErrorBoundaryProps} props
 * @param {unknown} [ctx] the instance, when Vapor renders it as a component
 * @returns {Array<VaporRenderedBlock | undefined>}
 */
export function TsrxErrorBoundary(props, ctx) {
	const instance = own_instance(ctx);
	const state = instance ? initialize_boundary_state(instance) : create_boundary_state();

	return create_boundary_nodes(() => {
		// Read so a reset, or an error caught after rendering, renders again.
		void state.version.value;
		if (state.caught) {
			return render_fallback(state, props);
		}

		/** @type {RenderFrame} */
		const frame = { instance: vapor.currentInstance, errors: [] };
		/** @type {unknown} */
		let content;
		rendering.push(frame);
		try {
			content = props.content();
		} catch (caught_error) {
			frame.errors.push(caught_error);
		} finally {
			rendering.pop();
		}
		if (frame.errors.length === 0) {
			return content;
		}
		// Not a reactive write: this render already shows the fallback.
		state.caught = { error: frame.errors[0] };
		return render_fallback(state, props);
	});
}

/**
 * Renders the fallback for the caught error. The first time, it takes the
 * uid that tells the components the fallback creates from the content's:
 * what the fallback throws isn't the boundary's to show.
 *
 * @param {BoundaryState} state
 * @param {TsrxErrorBoundaryProps} props
 * @returns {unknown}
 */
function render_fallback(state, props) {
	const caught = /** @type {{ error: unknown }} */ (state.caught);
	if (state.fallback_from === null) state.fallback_from = vapor.nextUid();
	return props.fallback(caught.error, state.reset);
}

// Declared, so they are props rather than attributes: Vue passes a
// component's attributes down to a component or element at the root of what
// it renders, which put them on the DOM and handed a nested boundary this
// one's `content`.
TsrxErrorBoundary.props = ['fallback', 'content', 'sharesCatch'];

/**
 * @param {unknown} _props
 * @param {unknown} [ctx]
 * @returns {void}
 */
TsrxErrorBoundary.__setup = function setup(_props, ctx) {
	const instance = own_instance(ctx);
	if (instance) {
		initialize_boundary_state(instance);
	}
};

/** @returns {BoundaryState} */
function create_boundary_state() {
	/** @type {BoundaryState} */
	const state = {
		version: shallowRef(0),
		caught: null,
		fallback_from: null,
		reset() {
			state.caught = null;
			state.fallback_from = null;
			state.version.value++;
		},
	};
	return state;
}

/**
 * @param {ComponentInternalInstance} instance
 * @returns {BoundaryState}
 */
function initialize_boundary_state(instance) {
	const existing = boundary_states.get(instance);
	if (existing) {
		return existing;
	}

	const state = create_boundary_state();
	boundary_states.set(instance, state);

	onErrorCaptured((captured_error, source) => {
		// The boundary inside this one that renders the same `@catch` let this
		// error from that `@catch` go on: let it go on too.
		if (thrown_by_twin_fallback(source, instance)) return;
		// An error from the fallback is for a boundary further out: one
		// rendering around this one takes it here.
		const from_fallback = thrown_by_fallback(source, instance);
		const frame = find_render_frame(source, from_fallback ? null : instance);
		if (frame) {
			frame.errors.push(captured_error);
			return false;
		}
		// Thrown by the fallback, with no boundary rendering around it: it goes
		// on to the next boundary out, or to `app.config.errorHandler`, as on
		// React. Showing the fallback again would throw again, until Vue
		// stopped the loop. An error from the content, which can still come
		// while or after the fallback shows, is the boundary's own, as before.
		if (from_fallback) return;
		// Thrown outside a render. An async component whose loader rejected
		// still has its setup pending, and Vapor cannot unmount it until its
		// Suspense has mounted it, so swap in the fallback after that.
		const show = () => {
			state.caught = { error: captured_error };
			state.version.value++;
		};
		const pending = /** @type {AsyncSetupState | null} */ (source);
		if (pending?.asyncDep && !pending.asyncResolved) {
			pending.asyncDep.then(show, show);
		} else {
			show();
		}
		return false;
	});

	return state;
}

/**
 * Renders a `@pending` body as its own component, which `Suspense` creates
 * only while it shows its fallback.
 *
 * Vapor renders a `Suspense` fallback slot without Vue's error handling, so a
 * throw there would end the mount without reaching any `onErrorCaptured` hook
 * or `app.config.errorHandler`. This component catches what the body throws
 * and hands it to Vue's error handling as its own render error, so the
 * nearest enclosing boundary shows it: the same `@try`'s `@catch`, or an
 * outer one.
 *
 * @param {TsrxPendingBodyProps} props
 * @param {unknown} [ctx] the instance, when Vapor renders it as a component
 * @returns {unknown}
 */
export function TsrxPendingBody(props, ctx) {
	const instance = own_instance(ctx);
	if (!instance) return props.content();
	/** @type {unknown} */
	let content;
	try {
		content = props.content();
	} catch (error) {
		handleError(error, instance, ErrorCodes.RENDER_FUNCTION);
		content = null;
	}
	// A component must return a block, so a primitive, such as the `null` of
	// an `@if` that renders nothing or a string, becomes a text node. Anything
	// else is returned as is: compiled JSX updates an array in place, and Vue
	// waits for a promise as async setup.
	if (content === null || (typeof content !== 'object' && typeof content !== 'function')) {
		return normalize_block(content, undefined);
	}
	return content;
}

TsrxPendingBody.props = ['content'];
