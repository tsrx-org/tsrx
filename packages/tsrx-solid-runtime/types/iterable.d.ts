import type { IterationValue } from '@tsrx/runtime/iterable';

type Missing = null | undefined | false;

export function for_items<I extends Iterable<unknown> | Iterator<unknown> | Missing>(
	source: I,
): I extends Missing ? I : IterationValue<I>[];

export function for_keyed_rows<I extends Iterable<unknown> | Iterator<unknown> | Missing, K>(
	source: I,
	key: (item: IterationValue<Exclude<I, Missing>>, index: number) => K,
): I extends Missing ? I : Array<{ item: IterationValue<I>; key: K }>;
