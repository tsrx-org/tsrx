import { describe, expect, it } from 'vitest';
import { map_iterable } from '../../src/runtime/iterable.js';

describe('map_iterable', function () {
	/**
	 * @param {unknown} item
	 * @param {number} index
	 * @param {boolean} is_last
	 */
	function text_fn(item, index, is_last) {
		return String(item) + ':' + index + (is_last ? '!' : '');
	}

	it('maps arrays and reports is_last from the captured length', function () {
		expect(map_iterable(['a', 'b', 'c'], text_fn)).toEqual(['a:0', 'b:1', 'c:2!']);
		expect(map_iterable(['only'], text_fn)).toEqual(['only:0!']);
	});

	it('flattens array-valued callback results', function () {
		expect(
			map_iterable(['a', 'b'], function (item, index, is_last) {
				return [item, index, is_last];
			}),
		).toEqual(['a', 0, false, 'b', 1, true]);
	});

	it('flattens when a later callback result is an array', function () {
		expect(
			map_iterable(['a', 'b', 'c'], function (item, index, is_last) {
				if (index === 1) {
					return [item, item];
				}
				return text_fn(item, index, is_last);
			}),
		).toEqual(['a:0', 'b', 'b', 'c:2!']);
	});

	it('maps sets and maps with size-based is_last', function () {
		expect(map_iterable(new Set(['a', 'b']), text_fn)).toEqual(['a:0', 'b:1!']);
		expect(
			map_iterable(
				new Map([
					['k', 'v'],
					['k2', 'v2'],
				]),
				text_fn,
			),
		).toEqual(['k,v:0', 'k2,v2:1!']);
	});

	it('still walks custom iterators that also have size', function () {
		var dual = {
			size: 2,
			[Symbol.iterator]: function* () {
				yield 'x';
			},
		};

		expect(map_iterable(dual, text_fn)).toEqual(['x:0!']);
	});

	it('still walks generators and raw iterators', function () {
		expect(
			map_iterable(
				(function* () {
					yield 'p';
					yield 'q';
				})(),
				text_fn,
			),
		).toEqual(['p:0', 'q:1!']);

		var iterator = ['r', 's'][Symbol.iterator]();
		expect(map_iterable(iterator, text_fn)).toEqual(['r:0', 's:1!']);
	});

	it('handles empty sources, empty fallbacks, and tails', function () {
		expect(map_iterable([], text_fn)).toEqual([]);
		expect(map_iterable(new Set(), text_fn)).toEqual([]);
		expect(
			map_iterable([], text_fn, null, function () {
				return 'empty';
			}),
		).toEqual(['empty']);
		expect(
			map_iterable(new Set(), text_fn, null, function () {
				return ['x', 'y'];
			}),
		).toEqual(['x', 'y']);
		expect(
			map_iterable(['a'], text_fn, function () {
				return 'tail';
			}),
		).toEqual(['a:0!', 'tail']);
		expect(
			map_iterable(new Set(['a']), text_fn, function () {
				return ['t', 'u'];
			}),
		).toEqual(['a:0!', 't', 'u']);
	});

	it('rejects values that are neither iterable nor iterators', function () {
		expect(function () {
			map_iterable(/** @type {any} */ ({ next: 1 }), text_fn);
		}).toThrow(TypeError);
	});
});
