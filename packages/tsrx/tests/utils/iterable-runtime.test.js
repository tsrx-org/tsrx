import { describe, expect, it } from 'vitest';

import { map_iterable } from '../../../tsrx-runtime/src/iterable.js';

function thrown_by(invoke) {
	try {
		invoke();
	} catch (error) {
		return error;
	}
	throw new Error('Expected invocation to throw');
}

function create_observed_array(label, nested, events) {
	const values = [`${label}:first`, , nested];
	let iterator_calls = 0;

	Object.defineProperty(values, Symbol.iterator, {
		value() {
			iterator_calls++;
			throw new Error(`${label} iterator should not be called`);
		},
	});

	const value = new Proxy(values, {
		get(target, property, receiver) {
			if (property === 'length') {
				events.push(`${label}:length:${target.length}`);
			} else if (typeof property === 'string' && /^\d+$/.test(property)) {
				events.push(`${label}:get:${property}`);
				if (property === '0' && target.length === 3) {
					target.push(`${label}:late`);
				}
			}
			return Reflect.get(target, property, receiver);
		},
	});

	return { value, iterator_calls: () => iterator_calls };
}

function expected_indexed_reads(label) {
	return [
		`${label}:length:3`,
		`${label}:get:0`,
		`${label}:length:4`,
		`${label}:get:1`,
		`${label}:length:4`,
		`${label}:get:2`,
		`${label}:length:4`,
		`${label}:get:3`,
		`${label}:length:4`,
	];
}

describe('iterable runtime', () => {
	it('captures array length once while visiting holes and reading future entries live', () => {
		const values = [10, , 30];
		let length_reads = 0;
		const source = new Proxy(values, {
			get(target, property, receiver) {
				if (property === 'length') length_reads++;
				return Reflect.get(target, property, receiver);
			},
		});
		const callbacks = [];

		const result = map_iterable(source, (value, index, is_last) => {
			callbacks.push([value, index, is_last]);
			if (index === 0) {
				values[2] = 31;
				values.push(40);
			}
			return value;
		});

		expect(result).toEqual([10, undefined, 31]);
		expect(Object.hasOwn(result, 1)).toBe(true);
		expect(callbacks).toEqual([
			[10, 0, false],
			[undefined, 1, false],
			[31, 2, true],
		]);
		expect(length_reads).toBe(1);
	});

	it('flattens mapper arrays one indexed level with live reads', () => {
		const events = [];
		const nested = ['nested'];
		const returned = create_observed_array('mapper', nested, events);

		const result = map_iterable([1], (value, index, is_last) => {
			events.push(`callback:${value}:${index}:${is_last}`);
			return returned.value;
		});

		expect(result).toEqual(['mapper:first', undefined, nested, 'mapper:late']);
		expect(result[2]).toBe(nested);
		expect(Object.hasOwn(result, 1)).toBe(true);
		expect(events).toEqual(['callback:1:0:true', ...expected_indexed_reads('mapper')]);
		expect(returned.iterator_calls()).toBe(0);
	});

	it('flattens tail arrays one indexed level with live reads', () => {
		const events = [];
		const nested = ['nested'];
		const returned = create_observed_array('tail', nested, events);

		const result = map_iterable(
			[1],
			(value, index, is_last) => {
				events.push(`callback:${value}:${index}:${is_last}`);
				return 'mapped';
			},
			() => {
				events.push('tail');
				return returned.value;
			},
		);

		expect(result).toEqual(['mapped', 'tail:first', undefined, nested, 'tail:late']);
		expect(result[3]).toBe(nested);
		expect(Object.hasOwn(result, 2)).toBe(true);
		expect(events).toEqual(['callback:1:0:true', 'tail', ...expected_indexed_reads('tail')]);
		expect(returned.iterator_calls()).toBe(0);
	});

	it('runs the empty callback only for an empty source and preserves its return contract', () => {
		const events = [];
		const fallback = ['empty'];
		const mapper = (value) => {
			events.push(`map:${value}`);
			return value * 2;
		};
		const tail = () => {
			events.push('tail');
			return 'tail';
		};
		const empty = () => {
			events.push('empty');
			return fallback;
		};

		expect(map_iterable([], mapper, tail, empty)).toBe(fallback);
		expect(events).toEqual(['empty']);

		expect(map_iterable([2], mapper, tail, empty)).toEqual([4, 'tail']);
		expect(events).toEqual(['empty', 'map:2', 'tail']);

		expect(map_iterable([], mapper, null, () => 42)).toEqual([42]);
	});

	it('maps Set, generator, and raw iterator sources with exact callback arguments', () => {
		const expected = ['a:0:false', 'b:1:false', 'c:2:true'];
		const mapper = (value, index, is_last) => `${value}:${index}:${is_last}`;
		function* generate() {
			yield 'a';
			yield 'b';
			yield 'c';
		}
		let raw_index = 0;
		const raw = {
			next() {
				if (raw_index === 3) return { done: true };
				return { done: false, value: ['a', 'b', 'c'][raw_index++] };
			},
		};

		expect(map_iterable(new Set(['a', 'b', 'c']), mapper)).toEqual(expected);
		expect(map_iterable(generate(), mapper)).toEqual(expected);
		expect(map_iterable(raw, mapper)).toEqual(expected);
	});

	it('looks ahead once before each generic-source callback', () => {
		const events = [];
		let next_index = 0;
		const source = {
			[Symbol.iterator]() {
				events.push('iterator');
				return {
					next() {
						const index = next_index++;
						events.push(`next:${index}`);
						return index < 3 ? { done: false, value: ['a', 'b', 'c'][index] } : { done: true };
					},
				};
			},
		};

		expect(
			map_iterable(source, (value, index, is_last) => {
				events.push(`callback:${value}:${index}:${is_last}`);
				return value;
			}),
		).toEqual(['a', 'b', 'c']);
		expect(events).toEqual([
			'iterator',
			'next:0',
			'next:1',
			'callback:a:0:false',
			'next:2',
			'callback:b:1:false',
			'next:3',
			'callback:c:2:true',
		]);
	});

	it('preserves array mapper errors and stops before later entries or the tail', () => {
		const marker = new Error('mapper abrupt');
		const events = [];
		const source = [1, 2, 3];
		Object.defineProperty(source, '2', {
			get() {
				events.push('get:2');
				return 3;
			},
		});

		const error = thrown_by(() =>
			map_iterable(
				source,
				(value, index, is_last) => {
					events.push(`callback:${value}:${index}:${is_last}`);
					if (index === 1) throw marker;
					return value;
				},
				() => {
					events.push('tail');
					return 4;
				},
			),
		);

		expect(error).toBe(marker);
		expect(events).toEqual(['callback:1:0:false', 'callback:2:1:false']);
	});

	it('looks ahead before a generic mapper error without closing the iterator', () => {
		const marker = new Error('generic mapper abrupt');
		const events = [];
		let next_index = 0;
		const source = {
			[Symbol.iterator]() {
				events.push('iterator');
				return {
					next() {
						events.push(`next:${next_index}`);
						return { done: false, value: ++next_index };
					},
					return() {
						events.push('return');
						return { done: true };
					},
				};
			},
		};

		const error = thrown_by(() =>
			map_iterable(source, (value, index, is_last) => {
				events.push(`callback:${value}:${index}:${is_last}`);
				throw marker;
			}),
		);

		expect(error).toBe(marker);
		expect(events).toEqual(['iterator', 'next:0', 'next:1', 'callback:1:0:false']);
	});

	it('preserves iterator next errors and stops before the pending callback', () => {
		const marker = new Error('next abrupt');
		const events = [];
		let next_index = 0;
		const source = {
			[Symbol.iterator]() {
				events.push('iterator');
				return {
					next() {
						events.push(`next:${next_index}`);
						if (next_index === 2) throw marker;
						return { done: false, value: ++next_index };
					},
				};
			},
		};

		const error = thrown_by(() =>
			map_iterable(source, (value, index, is_last) => {
				events.push(`callback:${value}:${index}:${is_last}`);
				return value;
			}),
		);

		expect(error).toBe(marker);
		expect(events).toEqual(['iterator', 'next:0', 'next:1', 'callback:1:0:false', 'next:2']);
	});

	it('preserves empty and tail errors at their callback boundaries', () => {
		const empty_marker = new Error('empty abrupt');
		const tail_marker = new Error('tail abrupt');
		const events = [];

		const empty_error = thrown_by(() =>
			map_iterable(
				[],
				() => {
					events.push('mapper');
					return 0;
				},
				() => {
					events.push('tail');
					return 0;
				},
				() => {
					events.push('empty');
					throw empty_marker;
				},
			),
		);
		expect(empty_error).toBe(empty_marker);
		expect(events).toEqual(['empty']);

		const tail_error = thrown_by(() =>
			map_iterable(
				[1, 2],
				(value, index, is_last) => {
					events.push(`callback:${value}:${index}:${is_last}`);
					return value;
				},
				() => {
					events.push('tail');
					throw tail_marker;
				},
			),
		);
		expect(tail_error).toBe(tail_marker);
		expect(events).toEqual(['empty', 'callback:1:0:false', 'callback:2:1:true', 'tail']);
	});

	it('preserves returned-array accessor errors and stops indexed flattening', () => {
		const marker = new Error('accessor abrupt');
		const events = [];
		const returned = [];
		for (const index of [0, 1, 2]) {
			Object.defineProperty(returned, String(index), {
				get() {
					events.push(`get:${index}`);
					if (index === 1) throw marker;
					return index;
				},
			});
		}
		returned.length = 3;

		const error = thrown_by(() =>
			map_iterable(
				[1],
				() => {
					events.push('mapper');
					return returned;
				},
				() => {
					events.push('tail');
					return 2;
				},
			),
		);

		expect(error).toBe(marker);
		expect(events).toEqual(['mapper', 'get:0', 'get:1']);
	});

	it('throws the guaranteed TypeError for a non-iterable target', () => {
		const error = thrown_by(() => map_iterable({}, () => null));

		expect(error).toBeInstanceOf(TypeError);
		expect(error.name).toBe('TypeError');
		expect(error.message).toBe('The loop target has to be an Iterable');
	});
});
