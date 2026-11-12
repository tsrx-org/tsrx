// Helper type for item in an array or iterable
// example: IterationValue<typeof something>
export type IterationValue<T> = T extends readonly unknown[]
	? T[number]
	: T extends Iterable<infer U>
		? U
		: T extends Iterator<infer U>
			? U
			: never;

// The source type is inferred whole so a union such as `string[] | number[]`
// yields `string | number` items, as `for...of` does.
export function map_iterable<I extends Iterable<unknown> | Iterator<unknown>, U>(
	value: I,
	fn: (item: IterationValue<I>, index: number, is_last: boolean) => U,
	tail?: (() => U | U[]) | null,
	empty?: () => U | U[],
): U[];

export function map_iterable_async<I extends Iterable<unknown> | Iterator<unknown>, U>(
	value: I,
	fn: (item: IterationValue<I>, index: number, is_last: boolean) => U | Promise<U>,
	tail?: (() => U | U[] | Promise<U | U[]>) | null,
	empty?: () => U | U[] | Promise<U | U[]>,
): Promise<U[]>;

export function iterable_to_array<I extends Iterable<unknown> | Iterator<unknown>>(
	value: I,
): IterationValue<I>[];
