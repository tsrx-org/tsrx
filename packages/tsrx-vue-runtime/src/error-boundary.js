/** @import { ComponentInternalInstance, ShallowRef } from 'vue' */
/** @import { TsrxErrorBoundaryProps, TsrxPendingBodyProps } from '../types/error-boundary' */
/** @import { VaporBlock, VaporFragment, VaporRenderedBlock, VaporRuntime } from '../types/vapor-runtime' */

import * as Vue from 'vue';
import {
	EffectScope,
	ErrorCodes,
	getCurrentInstance,
	handleError,
	onBeforeUnmount,
	onErrorCaptured,
	onScopeDispose,
	shallowRef,
	warn,
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
 * @property {boolean} shows_content whether the boundary last rendered its
 * content rather than its fallback; `reset` doesn't change it, the render
 * after it does
 * @property {boolean} removes_fallback whether the render that is running
 * removes the fallback, as after a reset, rather than the content: what
 * tearing that down throws isn't the content's
 * @property {boolean} removes_for_catch whether the render that is running
 * swaps in the fallback for a caught error, which the boundary held as it
 * began or the content threw as it rendered, rather than rendering the
 * content again
 * @property {number | null} rendered_from while a render removes the
 * fallback, a component uid taken as it began: what the content it renders
 * after a reset creates has later ones
 * @property {boolean} unmounting whether the boundary's teardown has begun
 * @property {unknown} dropped_by the boundary whose render removed this one,
 * as its teardown began: the one around it showing other content, such as
 * after a reset; null when nothing rendering removed it, as when the app
 * unmounts
 * @property {number} epoch bumped when the boundary resets or shows an error:
 * a swap still waiting from before then no longer applies
 * @property {number} waits counts the swaps that waited: only the latest one
 * still applies, as the latest error would have shown
 * @property {unknown} rendered the blocks the boundary renders into
 * @property {() => void} reset
 */

/** @typedef {{ asyncDep?: Promise<unknown> | null, asyncResolved?: boolean }} AsyncSetupState */

/**
 * @typedef {{ asyncDep?: Promise<unknown> | null, asyncResolved?: boolean, suspense?: unknown, suspenseId?: number, block?: VaporBlock, parent?: unknown }} AsyncInstance
 */

/** @typedef {{ pendingBranch?: unknown, pendingId?: number }} PendingSuspense */

/** @typedef {PendingSuspense & { isUnmounted?: boolean }} SuspenseState */

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
 * @typedef {object} CreatingFrame
 * @property {unknown} owner the instance current while the boundary renders
 * @property {Array<() => void>} created how to remove the hooks that the
 * boundaries it creates right under `owner` added to it
 */

/**
 * For each boundary render in progress, innermost last, the hooks that the
 * boundaries it creates add to the instance it renders as
 * (`take_own_errors`). Content that throws as it renders is dropped before it
 * mounts, and Vue doesn't dispose of what it created, so the boundary removes
 * those hooks itself; so it does when its fallback throws as it renders. Only
 * those right under it count: a boundary further down hangs its hook on a
 * component that is dropped too, and one in another app that the render
 * mounted stays.
 *
 * @type {CreatingFrame[]}
 */
const creating = [];

/**
 * Runs `render` as a boundary render that collects what the boundaries it
 * creates add to their parents.
 *
 * @template T
 * @param {(created: Array<() => void>) => T} render
 * @returns {T}
 */
function track_created(render) {
	/** @type {Array<() => void>} */
	const created = [];
	const owner = vapor.currentInstance;
	creating.push({ owner, created });
	let done = false;
	try {
		const result = render(created);
		done = true;
		return result;
	} finally {
		creating.pop();
		if (!done) for (const remove of created) remove();
		else {
			// A boundary called as a plain function renders as the instance
			// around it, and what it created goes if that render drops it.
			const outer = creating[creating.length - 1];
			if (outer && outer.owner === owner) outer.created.push(...created);
		}
	}
}

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
 * Whether the error from `source` comes from what `boundary`'s render is
 * removing: the content or the fallback, as it swaps in the fallback for a
 * caught error, or the fallback, as it renders the content again after a
 * reset. What the content then throws, such as a watcher the removal sets
 * off, in a component created since or in the boundary's own inline code, is
 * the boundary's own, as is what the content removes as it updates.
 *
 * @param {unknown} error
 * @param {unknown} source
 * @param {ComponentInternalInstance} boundary
 * @param {BoundaryState} state
 * @returns {boolean}
 */
function torn_down_by_render(error, source, boundary, state) {
	if (dropping !== boundary) return false;
	if (state.removes_for_catch) return true;
	if (!state.removes_fallback) return false;
	// What the removal itself threw, which the boundary reports as its own
	// (`dropping_for`), not what a hook that error reaches sets off.
	if (
		reporting?.boundary === boundary &&
		Object.is(reporting.error, error) &&
		(source === boundary || source === boundary.proxy)
	) {
		return true;
	}
	// A component the fallback showed. Without uids, as before, the content's.
	const from = state.rendered_from;
	if (from == null) return false;
	const chain = chain_to(source, boundary);
	const top = /** @type {{ uid?: number } | undefined} */ (chain[chain.length - 1]);
	return typeof top?.uid === 'number' && top.uid < from;
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
 * That includes an error the inner one is itself the source of while it
 * shows the `@catch`, such as one from the `@catch`'s parameter pattern,
 * which runs as the boundary calls its fallback. A boundary without a twin
 * lets such an error go on too (`take_own_errors`). So does what an inner
 * one, or a component in it, throws as it goes away with the `@try`, such as
 * from an unmount hook, whatever it showed: the app unmounting, or a `@try`
 * around it showing its `@catch`, removes it, possibly before the outer one
 * has begun to go. One that the outer one's own render removed, after a
 * reset, is replaced while the outer one stays, and what still comes from it
 * is the body's, as before, until the outer one goes away too.
 *
 * @param {unknown} error
 * @param {unknown} source
 * @param {ComponentInternalInstance} boundary
 * @returns {boolean}
 */
function thrown_by_twin_fallback(error, source, boundary) {
	const chain = chain_to(source, boundary);
	for (let i = chain.length - 1; i >= 0; i--) {
		const inner = /** @type {ComponentInternalInstance} */ (/** @type {unknown} */ (chain[i]));
		const state = boundary_states.get(inner);
		if (!state) continue;
		// The nearest boundary inside this one.
		if (!props_of(inner)?.sharesCatch) return false;
		if (is_gone(inner, state)) {
			// Going away with the `@try`: what it or a component in it throws
			// goes on.
			if (state.dropped_by !== boundary || is_gone(boundary)) return true;
		} else if (i === 0 && !state.shows_content) {
			return true;
		} else if (torn_down_by_render(error, source, inner, state)) {
			// Torn down as the inner one swaps in the same `@catch`, or removes
			// it after a reset: it went on from there, and goes on from here too.
			return true;
		}
		return thrown_by_fallback(source, inner);
	}
	return false;
}

/**
 * Whether `instance`, the boundary inside a `@pending` `Suspense`, was
 * replaced by its twin around the `Suspense`, which stays: by a reset, or by
 * swapping in the `@catch` for the whole `Suspense`. What the content it
 * showed still throws later, such as a loader it started rejecting, is
 * stale: it doesn't reach the new body (#1421) or replace the error the
 * `@catch` shows, and its error hook keeps taking it, as before.
 *
 * @param {ComponentInternalInstance} instance
 * @param {BoundaryState} state
 * @returns {boolean}
 */
function replaced_by_twin(instance, state) {
	if (!props_of(instance)?.sharesCatch || !state.dropped_by) return false;
	/** @type {InstanceLink | null | undefined} */
	let current = /** @type {InstanceLink} */ (/** @type {unknown} */ (instance)).parent;
	for (; current; current = current.parent) {
		if (
			boundary_states.has(
				/** @type {ComponentInternalInstance} */ (/** @type {unknown} */ (current)),
			)
		) {
			const twin = /** @type {ComponentInternalInstance} */ (/** @type {unknown} */ (current));
			// Except while the twin removes it to swap in its `@catch`: what
			// is torn down then goes on, as for any boundary swapping.
			return (
				current === state.dropped_by &&
				!is_gone(twin) &&
				!(dropping === twin && boundary_states.get(twin)?.caught)
			);
		}
	}
	return false;
}

/**
 * Whether the boundary `instance` is unmounting or has unmounted, or is
 * being disposed of before it mounted.
 *
 * @param {ComponentInternalInstance} instance
 * @param {BoundaryState | undefined} [state]
 * @returns {boolean}
 */
function is_gone(instance, state = boundary_states.get(instance)) {
	const link = /** @type {{ isUnmounted?: boolean, scope?: { active: boolean } }} */ (
		/** @type {unknown} */ (instance)
	);
	// A boundary dropped before it mounted runs no unmount hooks: its scope
	// stopping is what shows it going.
	return !!state?.unmounting || !!link.isUnmounted || link.scope?.active === false;
}

/**
 * Whether `instance` is the boundary inside a `@pending` `Suspense` that
 * renders the same `@catch` as the one around it (`sharesCatch`), while that
 * `Suspense` is pending. It lets an error go on then, from a render too, and
 * the one around it shows the `@catch`, as React's error boundary around a
 * `Suspense` does: it replaces the whole `Suspense`. Swapping inside would
 * unmount part of the branch the `Suspense` waits for. One that is gone,
 * after a reset rendered a new pair, keeps its error, as before: the `@catch`
 * around it now shows the new body.
 *
 * @param {ComponentInternalInstance} instance
 * @returns {boolean}
 */
function passes_to_twin(instance) {
	const suspense = /** @type {{ suspense?: SuspenseState | null }} */ (instance).suspense;
	return (
		!!props_of(instance)?.sharesCatch &&
		!!suspense?.pendingBranch &&
		!suspense.isUnmounted &&
		!(/** @type {{ isUnmounted?: boolean }} */ (instance).isUnmounted)
	);
}

/** How often a waiting swap checks whether its `Suspense` stopped waiting. */
const ROUND_RECHECK_MS = 50;

/**
 * Whether `suspense`, while pending, counts `component`'s setup: it is still
 * pending, and the component was created under that `Suspense` in its current
 * pending round. Vue's `Suspense` counts each such setup, and its
 * `registerDep` callback skips the count for a component that was unmounted,
 * so unmounting one before it settles leaves the `Suspense` pending for good.
 *
 * @param {AsyncInstance} component
 * @param {PendingSuspense} suspense
 * @returns {boolean}
 */
function counted_setup(component, suspense) {
	return (
		!!component.asyncDep &&
		!component.asyncResolved &&
		component.suspense === suspense &&
		component.suspenseId === suspense.pendingId
	);
}

/**
 * The async components in `block` whose setups `suspense` counts (see
 * {@link counted_setup}): the components it holds and what they render,
 * through fragments, but not the children of an element.
 *
 * @param {VaporBlock | undefined} block
 * @param {PendingSuspense} suspense
 * @param {AsyncInstance[]} [found]
 * @returns {AsyncInstance[]}
 */
function pending_setups(block, suspense, found = []) {
	if (!block || block instanceof Node) return found;
	if (Array.isArray(block)) {
		for (const item of block) pending_setups(item, suspense, found);
	} else if (vapor.isVaporComponent(block)) {
		const component = /** @type {AsyncInstance} */ (/** @type {unknown} */ (block));
		if (counted_setup(component, suspense)) found.push(component);
		pending_setups(component.block, suspense, found);
	} else if (vapor.isFragment(block)) {
		pending_setups(block.nodes, suspense, found);
	}
	return found;
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
 * @param {ComponentInternalInstance | null} [owner] the boundary whose render
 * this is, which removes `current`
 * @returns {VaporRenderedBlock}
 */
function resolve_value(current, value, anchor, owner = null) {
	anchor = anchor || (current instanceof Node && current.nodeType === 3 ? current : undefined);
	const node = normalize_block(value, anchor);
	// The same block again is already in place.
	if (node === current) return node;

	if (current) {
		if (vapor.isFragment(current)) {
			const old_anchor = current.anchor;
			if (old_anchor && old_anchor.parentNode) {
				const parent = old_anchor.parentNode;
				dropping_for(owner, () => vapor.remove(current.nodes, parent));
				vapor.insert(node, parent, old_anchor);
				// Unless the new block holds that node, the old anchor would stay
				// behind outside every block, also after unmount.
				if (!uses_node(node, old_anchor)) parent.removeChild(old_anchor);
				if (current.scope) dropping_for(owner, () => current.scope?.stop());
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
 * @param {ComponentInternalInstance | null} instance the boundary, when it
 * renders as a component
 * @returns {Array<VaporRenderedBlock | undefined>}
 */
function create_boundary_nodes(render, instance) {
	/** @type {Array<VaporRenderedBlock | undefined>} */
	const nodes = [];
	/** @type {EffectScope | undefined} */
	let scope;

	vapor.renderEffect(() => {
		const outer = re_rendering;
		re_rendering = instance;
		const state = instance && boundary_states.get(instance);
		if (state) {
			state.removes_fallback = scope !== undefined && !state.shows_content;
			state.removes_for_catch = scope !== undefined && state.caught !== null;
			state.rendered_from = state.removes_fallback ? take_uid() : null;
		}
		try {
			if (scope) dropping_for(instance, () => /** @type {EffectScope} */ (scope).stop());
			scope = new EffectScope();
			nodes[0] = scope.run(() => resolve_value(nodes[0], render(), undefined, instance));
		} finally {
			re_rendering = outer;
		}
	});

	return nodes;
}

/**
 * The boundary whose render is removing what it showed before, which tears
 * down the components in it: what they throw then is a teardown error
 * (see the boundary's error hook).
 *
 * @type {unknown}
 */
let dropping = null;

/**
 * The boundary whose removal threw what it is handing to its error hook, and
 * that error (`dropping_for`).
 *
 * @type {{ boundary: unknown, error: unknown } | null}
 */
let reporting = null;

/**
 * Runs `remove` as `instance`'s removal of what it showed before.
 *
 * What it throws, such as an `onScopeDispose` callback that throws as a
 * component's scope stops, ends Vue's teardown of that component but not the
 * boundary's render: it goes to the boundary's error hook as a teardown
 * error, and the render goes on to show what it renders now. Thrown out of
 * the render, it ended it before it read the boundary's state, which then
 * no longer rendered it again: the old content stayed, and the error was
 * lost.
 *
 * @param {ComponentInternalInstance | null} instance
 * @param {() => void} remove
 */
function dropping_for(instance, remove) {
	const outer = dropping;
	dropping = instance;
	try {
		remove();
	} catch (error) {
		if (!instance) throw error;
		// Logged, not thrown, in development when nothing takes it, as Vue
		// does with a failed async component it shows an error component for:
		// thrown, it would end the render. That includes one Vue reported
		// already and threw again, such as from an `onBeforeUnmount`, which
		// Vue's scheduler reports again too, without a `@try`.
		const outer_reporting = reporting;
		reporting = { boundary: instance, error };
		try {
			handleError(error, instance, ErrorCodes.COMPONENT_UPDATE, false);
		} finally {
			reporting = outer_reporting;
		}
	} finally {
		dropping = outer;
	}
}

/**
 * The boundary whose render is running, which removes what it showed
 * before (`BoundaryState.dropped_by`).
 *
 * @type {unknown}
 */
let re_rendering = null;

/**
 * A reusable Vue error boundary component.
 *
 * Used by the `@tsrx/vue` compiler to implement `try/catch` blocks.
 * The `fallback` prop receives the caught error and a `reset` function
 * that clears the error state to re-render the children.
 *
 * @param {TsrxErrorBoundaryProps} props
 * @param {unknown} [ctx] the instance, when Vapor renders it as a component
 * @returns {unknown} the boundary's blocks, or on the server what the content
 * or the fallback rendered
 */
export function TsrxErrorBoundary(props, ctx) {
	if (typeof vapor.renderEffect !== 'function') return render_on_server(props);
	const instance = own_instance(ctx);
	const state = instance ? initialize_boundary_state(instance) : create_boundary_state();

	const nodes = create_boundary_nodes(
		() =>
			track_created((created) => {
				// Read so a reset, or an error caught after rendering, renders again.
				void state.version.value;
				if (state.caught) {
					return render_fallback(state, props);
				}
				// The content renders again, after a reset: what the fallback created
				// before is gone. Until now, what it throws still goes on, also right
				// after its own call to `reset`.
				state.fallback_from = null;
				state.shows_content = true;
				// A reset can come as this render removes the fallback, from what
				// that tears down: this render shows the content, not the fallback.
				state.removes_for_catch = false;

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
				// The content is dropped before it mounts.
				for (const remove of created.splice(0)) remove();
				if (instance && state.rendered && passes_to_twin(instance)) {
					// Rendering again: hand the error to the boundary around the
					// `Suspense`, which replaces it. Keep what this one showed: the
					// fallback would unmount it, and with it a component the `Suspense`
					// still waits for. A first render that throws has mounted nothing,
					// and shows this `@catch`, as before; a component in an element of
					// what it dropped can still hold the `Suspense` until it settles.
					handleError(frame.errors[0], instance, ErrorCodes.RENDER_FUNCTION);
					return /** @type {unknown[] | undefined} */ (state.rendered)?.[0] ?? null;
				}
				// Not a reactive write: this render already shows the fallback.
				state.caught = { error: frame.errors[0] };
				state.epoch++;
				return render_fallback(state, props);
			}),
		instance,
	);
	state.rendered = nodes;
	return nodes;
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
	state.shows_content = false;
	// What this render removes next, to show the fallback, goes on, also when
	// it began to render the content and the content threw.
	state.removes_for_catch = true;
	if (state.fallback_from === null) state.fallback_from = take_uid();
	return props.fallback(caught.error, state.reset);
}

/**
 * Whether this Vue lacks `nextUid`, an internal of its Vapor renderer.
 * Without it, a boundary can't tell its fallback's components from its
 * content's, and routes errors as it did before it could.
 */
const no_uid = typeof vapor.nextUid !== 'function';

let warned_no_uid = false;

/**
 * The next component uid, or null when this Vue doesn't export `nextUid`.
 *
 * @returns {number | null}
 */
function take_uid() {
	if (!no_uid) return /** @type {() => number} */ (vapor.nextUid)();
	if (!warned_no_uid) {
		warned_no_uid = true;
		warn(
			'[tsrx] This Vue version has no `nextUid` export, so errors a @catch throws are routed as in earlier versions: a @catch that throws again as it renders, with no @try rendering around it, can loop until Vue stops it.',
		);
	}
	return null;
}

// Declared, so they are props rather than attributes: Vue passes a
// component's attributes down to a component or element at the root of what
// it renders, which put them on the DOM and handed a nested boundary this
// one's `content`.
TsrxErrorBoundary.props = ['fallback', 'content', 'sharesCatch'];

// A Vapor component, also to an app with Vue's VDOM interop. vue-jsx-vapor
// renders a function component through one proxy per function, cached for
// every app, whose `__vapor` the app that first made it decides: a proxy
// made while an app without interop, such as one that hydrates, rendered the
// boundary told a later app with interop to mount it as a VDOM component,
// which printed its blocks as text. Its own flag answers the same in each.
// Only where Vue's Vapor renderer is present, as `TsrxErrorBoundary`
// decides between its client and server paths: with Vue's Node build the
// server renderer calls it as a functional VDOM component, and it wraps the
// slots of what an owner with `__vapor` creates as Vapor slots, which loses
// what a component adds to a cloned slot child.
if (typeof vapor.renderEffect === 'function') TsrxErrorBoundary.__vapor = true;

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

/**
 * Renders the boundary on the server. Vue's server build has no Vapor
 * renderer: vue-jsx-vapor compiles a component for the server to VDOM, and the
 * server renderer calls the boundary as a functional component. It renders
 * the content, or the fallback when the content throws as it renders. An
 * error from a component in the content comes later, as the server renders
 * that component, and goes to `app.config.errorHandler` as it does without a
 * boundary.
 *
 * @param {TsrxErrorBoundaryProps} props
 * @returns {unknown}
 */
function render_on_server(props) {
	try {
		return props.content();
	} catch (error) {
		return props.fallback(error, () => {});
	}
}

/** @returns {BoundaryState} */
function create_boundary_state() {
	/** @type {BoundaryState} */
	const state = {
		version: shallowRef(0),
		caught: null,
		fallback_from: null,
		shows_content: false,
		removes_fallback: false,
		removes_for_catch: false,
		rendered_from: null,
		unmounting: false,
		dropped_by: null,
		epoch: 0,
		waits: 0,
		rendered: undefined,
		reset() {
			state.caught = null;
			state.epoch++;
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
	// Registered before anything the content registers, so it runs first.
	onBeforeUnmount(() => {
		state.unmounting = true;
		state.dropped_by = re_rendering;
	});

	/**
	 * @param {unknown} captured_error
	 * @param {unknown} source
	 * @returns {false | undefined}
	 */
	const capture = (captured_error, source) => {
		if (passes_to_twin(instance)) return;
		// The boundary inside this one that renders the same `@catch` let this
		// error from that `@catch` go on: let it go on too.
		if (thrown_by_twin_fallback(captured_error, source, instance)) return;
		// An error from the fallback is for a boundary further out: one
		// rendering around this one takes it here.
		const from_fallback = thrown_by_fallback(source, instance);
		// Without uids, any error while the fallback shows is taken as the
		// fallback's here, as before.
		const frame = find_render_frame(
			source,
			from_fallback || (no_uid && state.caught) ? null : instance,
		);
		if (frame) {
			frame.errors.push(captured_error);
			return false;
		}
		// Thrown as the boundary goes away, or as its render that swaps in the
		// `@catch` removes the content, such as from an unmount hook: a
		// teardown error. It goes on to the next boundary out, or to
		// `app.config.errorHandler`, as without the `@try`. Taking it would show
		// it in a `@catch` that is going away and lose it, or replace the error
		// the `@catch` was just swapped in for. The same goes for the `@catch`
		// a reset removes, as for what the `@catch` throws. What the content's
		// own render removes, as it updates, is the content's, as before.
		if (
			(is_gone(instance, state) && !replaced_by_twin(instance, state)) ||
			torn_down_by_render(captured_error, source, instance, state)
		) {
			return;
		}
		// Thrown by the fallback, with no boundary rendering around it: it goes
		// on to the next boundary out, or to `app.config.errorHandler`, as React
		// does with a render error. Showing the fallback again would throw again, until Vue
		// stopped the loop. An error from the content, which can still come
		// while or after the fallback shows, is the boundary's own, as before.
		// A `@try` the fallback rendered takes what its own content's inline
		// code throws before this hook runs (`take_own_errors`).
		if (from_fallback) return;
		// Thrown outside a render: swap in the fallback.
		const show = () => {
			state.caught = { error: captured_error };
			state.version.value++;
		};
		// Swapping unmounts the content. An async component in it that its
		// `Suspense` still waits for has to settle first, or the `Suspense`
		// stays pending for good: one the boundary's blocks hold, one the
		// error came from or passed through, and what those render once they
		// have settled. Swap after that, unless the boundary has reset or
		// shown another error since.
		// The components waited for, not their setups: two components can
		// share one setup promise, and each is counted.
		/** @type {Set<unknown>} */
		const awaited = new Set();
		const loading = () => {
			const suspense = /** @type {{ suspense?: SuspenseState | null }} */ (instance).suspense;
			/** @type {AsyncInstance[]} */
			const found = [];
			if (suspense?.pendingBranch && !suspense.isUnmounted) {
				pending_setups(/** @type {VaporBlock | undefined} */ (state.rendered), suspense, found);
				for (const current of chain_to(source, instance)) {
					// A VDOM component on the path is left alone, as before: Vue
					// counts its setup down when it unmounts.
					if (!vapor.isVaporComponent(current)) continue;
					const component = /** @type {AsyncInstance} */ (current);
					if (counted_setup(component, suspense)) found.push(component);
				}
			}
			/** @type {Promise<unknown>[]} */
			const fresh = [];
			for (const component of found) {
				if (awaited.has(component)) continue;
				awaited.add(component);
				fresh.push(/** @type {Promise<unknown>} */ (component.asyncDep));
			}
			return fresh;
		};
		const first = loading();
		const pending = /** @type {AsyncSetupState | null} */ (source);
		if (pending?.asyncDep && !pending.asyncResolved && !awaited.has(pending)) {
			awaited.add(pending);
			first.push(pending.asyncDep);
		}
		if (first.length === 0) {
			state.epoch++;
			show();
		} else {
			const at = state.epoch;
			const ticket = ++state.waits;
			// Whether this swap still applies: no reset or other error since,
			// and no later error waiting, and the boundary still there.
			const current = () =>
				state.epoch === at &&
				state.waits === ticket &&
				!state.unmounting &&
				!(/** @type {{ isUnmounted?: boolean }} */ (instance).isUnmounted);
			/** @param {Promise<unknown>[]} setups */
			const wait = (setups) => {
				const suspense = /** @type {{ suspense?: SuspenseState | null }} */ (instance).suspense;
				const round = suspense?.pendingId;
				let settled = false;
				const next = () => {
					if (settled) return;
					settled = true;
					if (!current()) return;
					const more = loading();
					if (more.length > 0) wait(more);
					else show();
				};
				Promise.allSettled(setups).then(next);
				// A `Suspense` that goes back to the branch it was showing, starts
				// a new round, or unmounts while the boundary stays (in a
				// `KeepAlive`), stops counting these setups, and one of them may
				// never settle: look again then.
				const recheck = () => {
					if (settled || !current()) return;
					if (!suspense?.pendingBranch || suspense.isUnmounted || suspense.pendingId !== round)
						next();
					else setTimeout(recheck, ROUND_RECHECK_MS);
				};
				setTimeout(recheck, ROUND_RECHECK_MS);
			};
			wait(first);
		}
		return false;
	};
	onErrorCaptured(capture);
	take_own_errors(instance, state, capture);

	return state;
}

/**
 * Has `capture` take the errors `instance` itself is the source of, while it
 * shows its content.
 *
 * Vue hands an error to the hooks of the parents of the instance it came
 * from, never to that instance's own. A `@try` body's inline code, an
 * expression that updates or an event handler, belongs to the boundary that
 * renders it, so what it throws after the first render skipped the
 * boundary's hook: it went to the next `@try` out, or to
 * `app.config.errorHandler`. A hook put first among the parent's, where Vue
 * starts, takes those errors to the boundary.
 *
 * Some still go on, as before: what the fallback's inline code throws; what
 * comes while the boundary unmounts; and what comes while the boundary's
 * `Suspense` is pending, since swapping could unmount a component in an
 * element of the body that the `Suspense` waits for, which the boundary
 * can't find (see `pending_setups`).
 *
 * The hook is removed when Vue disposes of the boundary, as it unmounts or
 * after it was dropped before it mounted, or when the boundary render that
 * created it drops it.
 *
 * @param {ComponentInternalInstance} instance
 * @param {BoundaryState} state
 * @param {(captured_error: unknown, source: unknown) => false | undefined} capture
 */
function take_own_errors(instance, state, capture) {
	const parent = /** @type {{ ec?: Function[] | null } | null} */ (
		/** @type {unknown} */ (instance.parent)
	);
	if (!parent) return;
	onErrorCaptured((captured_error, proxy) => {
		// Vue passes the instance's public proxy, or the instance itself when
		// it has none, as a Vapor one doesn't.
		const source = /** @type {unknown} */ (proxy);
		if (source !== instance && source !== instance.proxy) return;
		if (!state.shows_content || state.unmounting || instance.isUnmounted) return;
		const suspense = /** @type {{ suspense?: SuspenseState | null }} */ (instance).suspense;
		// Also in the branch a `Suspense` (`timeout: -1`) keeps showing while
		// a new one loads: a component that appeared there in the new round,
		// inside an element, is counted too, and the boundary can't find it.
		if (suspense?.pendingBranch && !suspense.isUnmounted) return;
		return capture(captured_error, instance);
	}, /** @type {ComponentInternalInstance} */ (/** @type {unknown} */ (parent)));
	const hooks = /** @type {Function[]} */ (parent.ec);
	const hook = /** @type {Function} */ (hooks.pop());
	hooks.unshift(hook);
	const remove = () => {
		const index = hooks.indexOf(hook);
		if (index !== -1) hooks.splice(index, 1);
	};
	// The boundary's scope stops as it unmounts, and also when Vue disposes of
	// one it dropped before it mounted, such as one in a `@for` row that threw
	// as it rendered, which runs no unmount hooks.
	onScopeDispose(remove);
	const frame = creating[creating.length - 1];
	if (frame && frame.owner === instance.parent) frame.created.push(remove);
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
// A Vapor component in every app (see `TsrxErrorBoundary.__vapor`).
if (typeof vapor.renderEffect === 'function') TsrxPendingBody.__vapor = true;
