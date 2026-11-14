import type { ComponentPublicInstance } from 'vue';
import type { MergeableRefValue } from '@tsrx/runtime/ref';

export * from '@tsrx/runtime/ref';

/**
 * Vue types a `ref` callback as receiving an element, a component instance or
 * `null` (`VNodeRef`), so the merged callback accepts all three. With the
 * shared `(node: T | null) => …` signature, `ref={mergeRefs(a, b)}` and the
 * compiler's merged spread ref fail to type-check against `VNodeRef`.
 *
 * vue-jsx-vapor gives every element's `ref` that same `VNodeRef` type, so the
 * type cannot tell elements apart: a ref typed for an `HTMLInputElement` is
 * accepted on a `<div>`.
 *
 * Vue ignores what a function ref returns and calls it with `null` when it
 * unsets the ref, so the merged callback runs its refs' cleanups on that call,
 * or when another merged ref replaces it on the same node. A merged ref among
 * its refs, as in `mergeRefs(mergeRefs(a), mergeRefs(b))`, is set beside the
 * others rather than replacing them.
 */
export function mergeRefs<T = Element>(
	...refs: Array<MergeableRefValue<T>>
): (node: T | Element | ComponentPublicInstance | null) => () => void;
