import { describe, expect, it } from 'vitest';
import {
	exclude_prop_from_object,
	iterable_array_from,
} from '../../src/runtime/language-helpers.js';

describe('language runtime helpers', () => {
	it('excludes a prop while preserving live getter reads', () => {
		let value = 'initial';
		let reads = 0;
		const symbol = Symbol('live');
		const props = {
			is: 'div',
			static: 'static',
			get live() {
				reads++;
				return value;
			},
			get [symbol]() {
				return `${value}-symbol`;
			},
		};

		Object.defineProperty(props, 'hidden', {
			enumerable: false,
			value: 'hidden',
		});

		const rest = exclude_prop_from_object(props, 'is');

		expect(reads).toBe(0);
		expect(Reflect.ownKeys(rest)).toEqual(['static', 'live', symbol]);
		// `Omit` drops both statically, so read them back off a plain view.
		const rest_view = /** @type {Record<PropertyKey, unknown>} */ (rest);
		expect(rest_view.is).toBeUndefined();
		expect(rest_view.hidden).toBeUndefined();

		expect(rest.live).toBe('initial');
		expect(reads).toBe(1);

		value = 'updated';
		expect(rest.live).toBe('updated');
		expect(rest[symbol]).toBe('updated-symbol');
	});

	it('forwards writes when the original prop is writable or setter-backed', () => {
		let accessor_value = 'initial';
		const props = {
			is: 'div',
			writable: 'before',
			readonly: 'fixed',
			get accessor() {
				return accessor_value;
			},
			set accessor(value) {
				accessor_value = value;
			},
		};

		Object.defineProperty(props, 'readonly', {
			enumerable: true,
			writable: false,
			value: 'fixed',
		});

		const rest = exclude_prop_from_object(props, 'is');

		rest.writable = 'after';
		expect(props.writable).toBe('after');
		expect(rest.writable).toBe('after');

		rest.accessor = 'updated';
		expect(accessor_value).toBe('updated');
		expect(rest.accessor).toBe('updated');

		expect(Object.getOwnPropertyDescriptor(rest, 'readonly')?.set).toBeUndefined();
		expect(() => {
			rest.readonly = 'changed';
		}).toThrow(TypeError);
		expect(rest.readonly).toBe('fixed');
	});

	it('returns an empty object for nullish props', () => {
		expect(exclude_prop_from_object(null, 'is')).toEqual({});
		expect(exclude_prop_from_object(undefined, 'is')).toEqual({});
	});
});

describe('iterable_array_from', function () {
	it('copies arrays from an index with slice semantics', function () {
		expect(iterable_array_from(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
		expect(iterable_array_from(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c']);
		expect(iterable_array_from(['a', 'b', 'c'], 1)).toEqual(['b', 'c']);
		expect(iterable_array_from(['a', 'b', 'c'], 3)).toEqual([]);
		expect(iterable_array_from(['a', 'b', 'c'], -1)).toEqual(['c']);
		expect(iterable_array_from(['a', 'b', 'c'], 1.5)).toEqual(['b', 'c']);
		expect(iterable_array_from(['a', 'b', 'c'], NaN)).toEqual(['a', 'b', 'c']);
	});

	it('keeps holes in holey arrays', function () {
		const sparse = [1, , 3];
		const copied = iterable_array_from(sparse);

		expect(copied).toEqual([1, undefined, 3]);
		expect(1 in copied).toBe(false);
		expect(Object.hasOwn(copied, 1)).toBe(false);
	});

	it('copies non-iterable array-likes with slice index semantics', function () {
		var like = { length: 3, 0: 'a', 1: 'b', 2: 'c' };

		expect(iterable_array_from(like)).toEqual(['a', 'b', 'c']);
		expect(iterable_array_from(like, 0)).toEqual(['a', 'b', 'c']);
		expect(iterable_array_from(like, 1)).toEqual(['b', 'c']);
		expect(iterable_array_from(like, 3)).toEqual([]);
		expect(iterable_array_from(like, -1)).toEqual(['c']);
		expect(iterable_array_from(like, 1.5)).toEqual(['b', 'c']);
		expect(iterable_array_from(like, NaN)).toEqual(['a', 'b', 'c']);
	});

	it('materializes sparse array-like holes as own undefined entries', function () {
		var sparse = { length: 3, 0: 1, 2: 3 };
		var copied = iterable_array_from(sparse);

		expect(copied).toEqual([1, undefined, 3]);
		expect(1 in copied).toBe(true);
		expect(Object.hasOwn(copied, 1)).toBe(true);
	});

	it('copies arguments and typed arrays with iterator skip semantics', function () {
		var args = (function () {
			return arguments;
		})('a', 'b', 'c');

		expect(iterable_array_from(args)).toEqual(['a', 'b', 'c']);
		expect(iterable_array_from(args, 1)).toEqual(['b', 'c']);
		expect(iterable_array_from(args, -1)).toEqual(['a', 'b', 'c']);
		expect(iterable_array_from(args, 1.5)).toEqual(['c']);
		expect(iterable_array_from(args, NaN)).toEqual(['a', 'b', 'c']);

		var typed = new Uint8Array([4, 5, 6]);
		expect(iterable_array_from(typed, 1)).toEqual([5, 6]);
		expect(iterable_array_from(typed, -1)).toEqual([4, 5, 6]);
		expect(iterable_array_from(typed, 1.5)).toEqual([6]);
	});

	it('walks strings by code point so surrogate pairs stay intact', function () {
		expect(iterable_array_from('abc', 1)).toEqual(['b', 'c']);
		expect(iterable_array_from('abc', -1)).toEqual(['a', 'b', 'c']);
		expect(iterable_array_from('abc', 1.5)).toEqual(['c']);

		expect(iterable_array_from('a😀b')).toEqual(['a', '😀', 'b']);
		expect(iterable_array_from('a😀b', 1)).toEqual(['😀', 'b']);
		expect(iterable_array_from('a😀b', 1.5)).toEqual(['b']);
		expect(iterable_array_from('a😀b', -1)).toEqual(['a', '😀', 'b']);
	});

	it('still walks custom iterators even when the object also has length', function () {
		var dual = {
			length: 2,
			0: 'a',
			1: 'b',
			[Symbol.iterator]: function* () {
				yield 'x';
			},
		};

		expect(iterable_array_from(dual)).toEqual(['x']);
		expect(iterable_array_from(dual, 0)).toEqual(['x']);
	});

	it('still walks sets, iterators, and array-like values', function () {
		expect(iterable_array_from(new Set([1, 2, 3]), 1)).toEqual([2, 3]);

		const iterator = [4, 5, 6][Symbol.iterator]();
		expect(iterable_array_from(iterator, 1)).toEqual([5, 6]);

		const array_like = { length: 3, 0: 'x', 1: 'y', 2: 'z' };
		expect(iterable_array_from(array_like, 1)).toEqual(['y', 'z']);
	});
});
