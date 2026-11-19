import type { IterationValue } from '@tsrx/runtime/iterable';

export * from '@tsrx/runtime/iterable';

/**
 * Typed like `iterable_to_array`, so the editor reports a source that
 * `for...of` can't walk. At runtime a missing source is no items, as
 * `VaporFor` reads it.
 */
export function for_items<I extends Iterable<unknown> | Iterator<unknown>>(
	source: I,
): IterationValue<I>[];
