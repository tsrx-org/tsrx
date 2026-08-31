/** @import { MergeableRef } from '../../types/runtime/ref' */

import { describe, expect, it } from 'vitest';
import {
	create_ref_prop,
	merge_ref_props,
	mergeRefs,
	normalize_spread_props,
} from '../../src/runtime/ref.js';

describe('ref runtime helpers', () => {
	it('clears mutable ref props on unmount without treating DOM-like values as ref objects', () => {
		const input_like = {
			nodeType: 1,
			nodeName: 'INPUT',
			value: 'keep',
		};
		/** @type {object | null | undefined} */
		let slot = undefined;
		const ref = create_ref_prop(
			() => slot,
			(value) => {
				slot = value;
			},
		);

		ref(input_like);
		expect(slot).toBe(input_like);

		ref(null);
		expect(slot).toBeNull();
		expect(input_like.value).toBe('keep');
	});

	it('returns cleanup for mutable ref props', () => {
		const node = {};
		/** @type {object | null | undefined} */
		let slot = undefined;
		const ref = create_ref_prop(
			() => slot,
			(value) => {
				slot = value;
			},
		);

		const cleanup = ref(node);
		expect(slot).toBe(node);
		expect(typeof cleanup).toBe('function');

		cleanup?.();
		expect(slot).toBeNull();
	});

	it('still assigns real current and value ref objects by own property', () => {
		const node = {};
		/** @type {{ current: object | null }} */
		const current_ref = { current: null };
		/** @type {{ value: object | null }} */
		const value_ref = { value: null };
		/** @type {object | null} */
		let current_slot = current_ref;
		/** @type {object | null} */
		let value_slot = value_ref;

		create_ref_prop(
			() => current_slot,
			(value) => {
				current_slot = value;
			},
		)(node);
		create_ref_prop(
			() => value_slot,
			(value) => {
				value_slot = value;
			},
		)(node);

		expect(current_ref.current).toBe(node);
		expect(value_ref.value).toBe(node);
		expect(current_slot).toBe(current_ref);
		expect(value_slot).toBe(value_ref);
	});

	it('assigns Vue-style ref objects marked with __v_isRef even when value is inherited', () => {
		const node = {};
		const vue_ref = Object.create({ value: null });
		vue_ref.__v_isRef = true;

		create_ref_prop(
			() => vue_ref,
			() => {
				throw new Error('setter should not run for Vue refs');
			},
		)(node);

		expect(vue_ref.value).toBe(node);
	});

	it('assigns value ref objects with inherited accessors', () => {
		const node = {};
		/** @type {object | null} */
		let stored = null;
		const value_ref = Object.create({
			get value() {
				return stored;
			},
			set value(value) {
				stored = value;
			},
		});

		create_ref_prop(
			() => value_ref,
			() => {
				throw new Error('setter should not run for inherited accessor value refs');
			},
		)(node);

		expect(stored).toBe(node);
	});

	it('does not mutate objects that only inherit current or value properties when merging refs', () => {
		const inherited_ref_shape = Object.create({ current: 'inherited', value: 'inherited' });
		const merged = mergeRefs(/** @type {MergeableRef<object>} */ (inherited_ref_shape));

		const cleanup = merged({});
		cleanup();

		expect(inherited_ref_shape.current).toBe('inherited');
		expect(inherited_ref_shape.value).toBe('inherited');
		expect(Object.prototype.hasOwnProperty.call(inherited_ref_shape, 'current')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(inherited_ref_shape, 'value')).toBe(false);
	});

	it('keeps nullish filtering, single-ref identity, and merged cleanup order', () => {
		/** @type {Array<unknown>} */
		const events = [];
		const node = {};
		/** @param {object | null} value */
		const first = (value) => {
			events.push(['first', value]);
			return () => {
				events.push(['first cleanup']);
			};
		};
		/** @param {object | null} value */
		const second = (value) => {
			events.push(['second', value]);
			return () => {
				events.push(['second cleanup']);
			};
		};

		expect(merge_ref_props(null, undefined)).toBeUndefined();
		expect(merge_ref_props(null, first)).toBe(first);
		expect(merge_ref_props(first, null)).toBe(first);

		const merged = merge_ref_props(first, second);
		if (typeof merged !== 'function') {
			throw new TypeError('Expected multiple refs to produce a callback');
		}
		const cleanup = merged(node);
		expect(events).toEqual([
			['first', node],
			['second', node],
		]);

		cleanup();
		expect(events).toEqual([
			['first', node],
			['second', node],
			['first cleanup'],
			['second cleanup'],
		]);
	});
});

describe('spread ref normalization', () => {
	it('returns ordinary spreads unchanged after reading each enumerable value once', () => {
		/** @type {string[]} */
		const reads = [];
		const symbol = Symbol('spread');
		const props = {
			get first() {
				reads.push('first');
				return 1;
			},
			get second() {
				reads.push('second');
				return 2;
			},
			get [symbol]() {
				reads.push('symbol');
				return 3;
			},
		};
		Object.defineProperty(props, 'hidden', {
			enumerable: false,
			get() {
				reads.push('hidden');
				return 4;
			},
		});

		const normalized = normalize_spread_props(props);

		expect(normalized).toBe(props);
		expect(reads).toEqual(['first', 'second', 'symbol']);
		expect(/** @type {Record<PropertyKey, unknown>} */ (normalized)[symbol]).toBe(3);
	});

	it('extracts branded refs while preserving props, symbols, and cleanup order', () => {
		/** @type {Array<unknown>} */
		const events = [];
		const symbol = Symbol('spread');
		const node = {};
		/** @param {object | null} value */
		const existing_ref = (value) => {
			events.push(['existing', value]);
			return () => {
				events.push(['existing cleanup']);
			};
		};
		/** @param {object | null} value */
		const branded_callback = (value) => {
			events.push(['branded', value]);
			return () => {
				events.push(['branded cleanup']);
			};
		};
		const branded_ref = create_ref_prop(() => branded_callback);
		/** @param {object | null} value */
		const outer_ref = (value) => {
			events.push(['outer', value]);
			return () => {
				events.push(['outer cleanup']);
			};
		};
		const props = {
			get id() {
				events.push(['read id']);
				return 'field';
			},
			ref: existing_ref,
			forwarded: branded_ref,
			[symbol]: 'symbol value',
		};

		const normalized = normalize_spread_props(props, outer_ref);
		const normalized_props =
			/** @type {Record<PropertyKey, unknown> & {
			 * ref: (node: object) => () => void
			 * }} */ (normalized);

		expect(normalized === props).toBe(false);
		expect(Object.getOwnPropertyDescriptor(normalized_props, 'id')).toMatchObject({
			value: 'field',
			enumerable: true,
		});
		expect(normalized_props).not.toHaveProperty('forwarded');
		expect(normalized_props[symbol]).toBe('symbol value');
		expect(events).toEqual([['read id']]);

		const cleanup = normalized_props.ref(node);
		expect(events).toEqual([['read id'], ['existing', node], ['branded', node], ['outer', node]]);

		cleanup();
		expect(events).toEqual([
			['read id'],
			['existing', node],
			['branded', node],
			['outer', node],
			['existing cleanup'],
			['branded cleanup'],
			['outer cleanup'],
		]);
	});

	it('preserves nullish spreads and appends a single outer ref without wrapping it', () => {
		const outer_ref = () => {};
		const props = { id: 'field' };

		expect(normalize_spread_props(null)).toBeNull();
		expect(normalize_spread_props(undefined)).toBeUndefined();
		expect(normalize_spread_props(props, outer_ref)).toEqual({ id: 'field', ref: outer_ref });
	});
});
