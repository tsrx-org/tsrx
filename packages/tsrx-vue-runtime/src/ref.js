import { mergeRefs as merge_refs } from '@tsrx/runtime/ref';

export * from '@tsrx/runtime/ref';

/**
 * The cleanup of the merged ref currently set on each node. Vue replaces a
 * function ref without calling the replaced one with `null`, so the next
 * merged ref set on the node runs the previous one's cleanup.
 *
 * @type {WeakMap<object, () => void>}
 */
const pending_cleanups = new WeakMap();

/**
 * For each node a merged ref is setting its refs on, the `unset` of every
 * merged ref it sets on the same node meanwhile. Such a merged ref, as in
 * `mergeRefs(mergeRefs(a), mergeRefs(b))`, is set beside its siblings rather
 * than in place of one of them, so it leaves `pending_cleanups` to the
 * outermost merged ref, whose cleanup runs its own. If a later ref throws,
 * the outermost merged ref has no cleanup, and the node keeps theirs pending.
 *
 * @type {WeakMap<object, Array<() => void>>}
 */
const nested_unsets = new WeakMap();

/**
 * The shared `mergeRefs`, adapted to how Vue calls a function ref: with the
 * node when it sets the ref and with `null` when it unsets it, ignoring what
 * the callback returns. The cleanup a merged ref returns when it is set (which
 * runs each callback's own cleanup, or calls it with `null`, and clears ref
 * objects) runs on that `null` call instead, or when another merged ref is set
 * on the same node. A merged ref that this one sets the node on is not another
 * merged ref replacing it (see `nested_unsets`).
 *
 * @template T
 * @param {...import('@tsrx/runtime/ref').MergeableRefValue<T>} refs
 * @returns {(node: T | null) => () => void}
 */
export function mergeRefs(...refs) {
	const merged = merge_refs(...refs);
	/** @type {{ node: T, cleanup: () => void } | null} */
	let mounted = null;
	const unset = () => {
		const current = mounted;
		mounted = null;
		if (!current) return;
		if (is_object(current.node) && pending_cleanups.get(current.node) === current.cleanup) {
			pending_cleanups.delete(current.node);
		}
		current.cleanup();
	};
	return (node) => {
		unset();
		if (node == null) return () => {};
		const siblings = is_object(node) ? nested_unsets.get(node) : undefined;
		const outermost = is_object(node) && !siblings;
		/** @type {Array<() => void>} */
		const nested = [];
		if (outermost) {
			const replaced = pending_cleanups.get(node);
			if (replaced) {
				pending_cleanups.delete(node);
				replaced();
			}
			nested_unsets.set(node, nested);
		}
		/** @type {() => void} */
		let cleanup;
		try {
			cleanup = once(merged(node));
		} catch (error) {
			if (outermost && nested.length > 0) {
				pending_cleanups.set(
					node,
					once(() => {
						for (const nested_unset of nested) nested_unset();
					}),
				);
			}
			throw error;
		} finally {
			if (outermost) nested_unsets.delete(node);
		}
		mounted = { node, cleanup };
		if (outermost) {
			pending_cleanups.set(node, cleanup);
		} else {
			siblings?.push(unset);
		}
		return unset;
	};
}

/**
 * @param {unknown} value
 * @returns {value is object}
 */
function is_object(value) {
	return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/**
 * @param {() => void} fn
 * @returns {() => void}
 */
function once(fn) {
	let ran = false;
	return () => {
		if (ran) return;
		ran = true;
		fn();
	};
}
