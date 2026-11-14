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
 * For each node a merged ref is setting its refs on, the unsets of the merged
 * refs it sets on the same node meanwhile. Such a merged ref, as in
 * `mergeRefs(mergeRefs(a), mergeRefs(b))`, is set beside its siblings rather
 * than in place of one of them, so it leaves `pending_cleanups` to the
 * outermost merged ref, whose cleanup runs its own. If a later ref throws,
 * the merged ref setting the node has no cleanup of its own, so it keeps
 * theirs to run when it is unset or replaced.
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
	/**
	 * @param {T} node
	 * @param {() => void} cleanup
	 * @param {boolean} outermost
	 * @param {Array<() => void> | undefined} parent
	 */
	const set = (node, cleanup, outermost, parent) => {
		const current = { node, cleanup };
		mounted = current;
		if (outermost && is_object(node)) {
			pending_cleanups.set(node, cleanup);
		} else if (parent) {
			// Only while this merged ref is still set on the node: it may be set on
			// another node before the one it was set beside is replaced.
			parent.push(() => {
				if (mounted === current) unset();
			});
		}
	};
	return (node) => {
		unset();
		if (node == null) return () => {};
		const parent = is_object(node) ? nested_unsets.get(node) : undefined;
		const outermost = is_object(node) && !parent;
		/** @type {Array<() => void>} */
		const nested = [];
		if (outermost) {
			const replaced = pending_cleanups.get(node);
			if (replaced) {
				pending_cleanups.delete(node);
				replaced();
			}
		}
		if (is_object(node)) nested_unsets.set(node, nested);
		/** @type {() => void} */
		let cleanup;
		try {
			cleanup = once(merged(node));
		} catch (error) {
			if (nested.length > 0) {
				cleanup = once(() => {
					for (const nested_unset of nested) nested_unset();
				});
				set(node, cleanup, outermost, parent);
			}
			throw error;
		} finally {
			if (outermost) {
				nested_unsets.delete(node);
			} else if (parent) {
				nested_unsets.set(node, parent);
			}
		}
		set(node, cleanup, outermost, parent);
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
