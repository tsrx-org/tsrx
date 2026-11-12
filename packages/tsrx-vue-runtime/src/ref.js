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
 * The shared `mergeRefs`, adapted to how Vue calls a function ref: with the
 * node when it sets the ref and with `null` when it unsets it, ignoring what
 * the callback returns. The cleanup a merged ref returns when it is set (which
 * runs each callback's own cleanup, or calls it with `null`, and clears ref
 * objects) runs on that `null` call instead, or when another merged ref is set
 * on the same node.
 *
 * @template T
 * @param {...import('@tsrx/runtime/ref').MergeableRef<T>} refs
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
		if (is_object(node)) {
			const replaced = pending_cleanups.get(node);
			if (replaced) {
				pending_cleanups.delete(node);
				replaced();
			}
		}
		const cleanup = once(merged(node));
		mounted = { node, cleanup };
		if (is_object(node)) pending_cleanups.set(node, cleanup);
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
