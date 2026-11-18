/** @import { ComponentInternalInstance, ShallowRef } from 'vue' */
/** @import { TsrxErrorBoundaryProps } from '../types/error-boundary' */
/** @import { VaporBlock, VaporFragment, VaporRenderedBlock, VaporRuntime } from '../types/vapor-runtime' */

import * as Vue from 'vue';
import { EffectScope, getCurrentInstance, onErrorCaptured, shallowRef } from 'vue';

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
 * component an error came from.
 *
 * @param {unknown} source a Vapor instance, or a VDOM component's public proxy
 * @returns {RenderFrame | undefined}
 */
function find_render_frame(source) {
	if (rendering.length === 0) return undefined;
	const link = /** @type {InstanceLink | null} */ (source);
	/** @type {Set<unknown>} */
	const ancestors = new Set();
	/** @type {InstanceLink | null | undefined} */
	let current = link?.$ ?? link;
	for (; current; current = current.parent) {
		ancestors.add(current);
	}
	for (let i = rendering.length - 1; i >= 0; i--) {
		if (ancestors.has(rendering[i].instance)) return rendering[i];
	}
	return undefined;
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
 * @param {unknown} node
 * @param {Node | undefined} anchor
 * @returns {VaporRenderedBlock}
 */
function normalize_block(node, anchor) {
	if (node instanceof Node || vapor.isFragment(node)) return node;
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
 * @param {VaporRenderedBlock | undefined} current
 * @param {unknown} value
 * @param {Node | undefined} anchor
 * @returns {VaporRenderedBlock}
 */
function resolve_value(current, value, anchor) {
	anchor = anchor || (current instanceof Node && current.nodeType === 3 ? current : undefined);
	const node = normalize_block(value, anchor);

	if (current) {
		if (vapor.isFragment(current)) {
			if (current.anchor && current.anchor.parentNode) {
				vapor.remove(current.nodes, current.anchor.parentNode);
				vapor.insert(node, current.anchor.parentNode, current.anchor);
				if (current.scope) current.scope.stop();
			}
		} else if (current instanceof Node) {
			if (current.nodeType === 3 && (!(node instanceof Node) || node.nodeType !== 3)) {
				current.textContent = '';
			}
			if (vapor.isFragment(node) && current.parentNode) {
				vapor.insert(node, current.parentNode, current);
				if (current.nodeType !== 3) current.parentNode.removeChild(current);
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
			return props.fallback(state.caught.error, state.reset);
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
		return props.fallback(state.caught.error, state.reset);
	});
}

// Declared, so they are props rather than attributes: Vue passes a
// component's attributes down to a component or element at the root of what
// it renders, which put them on the DOM and handed a nested boundary this
// one's `content`.
TsrxErrorBoundary.props = ['fallback', 'content'];

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
		reset() {
			state.caught = null;
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
		const frame = find_render_frame(source);
		if (frame) {
			frame.errors.push(captured_error);
			return false;
		}
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
