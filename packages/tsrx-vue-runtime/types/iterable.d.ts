import type { IterationValue } from '@tsrx/runtime/iterable';

export * from '@tsrx/runtime/iterable';

export function for_items<I extends Iterable<unknown> | Iterator<unknown>>(
	source: I,
): IterationValue<I>[];
