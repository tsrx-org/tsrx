import { describe, expect, it } from 'vitest';
import { check_types } from '../shared/type-diagnostics.js';

const IMPORT = `import {
	type IterationValue,
	map_iterable,
	map_iterable_async,
} from '../tsrx-runtime/types/iterable.js';`;

describe('iterable helper types', () => {
	it('accepts iterators and the compiler-emitted empty fallback arguments', () => {
		const { errors, types } = check_types(`${IMPORT}
			declare const iterator: Iterator<number>;
			const fromIterator = map_iterable(
				iterator,
				(value) => value * 2,
			);
			const iteratorValue = null as unknown as IterationValue<typeof iterator>;
			const withEmpty = map_iterable(
				new Set<string>(),
				(value) => value.toUpperCase(),
				null,
				() => 'empty',
			);
		`);

		expect(errors).toEqual([]);
		expect(types.fromIterator).toBe('number[]');
		expect(types.iteratorValue).toBe('number');
		expect(types.withEmpty).toBe('string[]');
	});

	it('infers the item type from every member of a union source', () => {
		const { errors, types } = check_types(`${IMPORT}
			declare const items: string[] | number[];
			declare const mixed: Set<string> | Iterator<boolean>;
			const fromUnion = map_iterable(items, (item) => item);
			const fromMixed = map_iterable(mixed, (item) => item);
			const settled = await map_iterable_async(items, async (item) => item);
		`);

		expect(errors).toEqual([]);
		expect(types.fromUnion).toBe('(string | number)[]');
		expect(types.fromMixed).toBe('(string | boolean)[]');
		expect(types.settled).toBe('(string | number)[]');
	});

	it('resolves the async helper to the settled item array', () => {
		const { errors, types } = check_types(`${IMPORT}
			declare const iterator: Iterator<number>;
			const settled = await map_iterable_async(
				iterator,
				async (value, index, is_last) => (is_last ? String(value) : String(index)),
			);
			const withEmpty = await map_iterable_async(
				new Set<number>(),
				async (value) => value * 2,
				null,
				async () => [0],
			);
			const pending = map_iterable_async([1], (value) => value);
		`);

		expect(errors).toEqual([]);
		expect(types.settled).toBe('string[]');
		expect(types.withEmpty).toBe('number[]');
		expect(types.pending).toBe('Promise<number[]>');
	});
});
