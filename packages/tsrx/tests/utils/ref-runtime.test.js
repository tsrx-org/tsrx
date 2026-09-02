/** @import { MergeableRef } from '../../types/runtime/ref' */

import { describe, expect, it } from 'vitest';
import {
	create_ref_prop,
	merge_ref_props,
	mergeRefs,
	normalize_spread_props,
	normalize_spread_props_for_ref_attr,
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
	/**
	 * @param {PropertyKey} key
	 */
	function label_key(key) {
		return typeof key === 'symbol' ? key.toString() : key;
	}

	/**
	 * @template {object} T
	 * @param {T} target
	 * @param {string[]} events
	 * @returns {T}
	 */
	function observe_props(target, events) {
		return new Proxy(target, {
			ownKeys(value) {
				events.push('ownKeys');
				return Reflect.ownKeys(value);
			},
			getOwnPropertyDescriptor(value, key) {
				events.push(`descriptor:${label_key(key)}`);
				return Reflect.getOwnPropertyDescriptor(value, key);
			},
			get(value, key, receiver) {
				events.push(`get:${label_key(key)}`);
				return Reflect.get(value, key, receiver);
			},
		});
	}

	/**
	 * @param {() => unknown} run
	 * @returns {unknown}
	 */
	function capture_error(run) {
		try {
			run();
		} catch (error) {
			return error;
		}
		throw new Error('Expected callback to throw');
	}

	/**
	 * @param {object} props
	 * @param {unknown} ref
	 */
	function expect_explicit_ref_descriptor(props, ref) {
		expect(Object.getOwnPropertyDescriptor(props, 'ref')).toEqual({
			value: ref,
			enumerable: false,
			configurable: true,
			writable: true,
		});
	}

	it('returns ordinary spreads unchanged after observing enumerable keys exactly once in own-key order', () => {
		/** @type {string[]} */
		const events = [];
		const symbol = Symbol('spread');
		const target = {
			get first() {
				events.push('getter:first');
				return 1;
			},
			get second() {
				events.push('getter:second');
				return 2;
			},
			get [symbol]() {
				events.push('getter:Symbol(spread)');
				return 3;
			},
		};
		Object.defineProperty(target, 'hidden', {
			enumerable: false,
			get() {
				events.push('getter:hidden');
				return 4;
			},
		});
		const props = observe_props(target, events);

		const normalized = normalize_spread_props(props);

		expect(normalized === props).toBe(true);
		expect(events).toEqual([
			'ownKeys',
			'descriptor:first',
			'get:first',
			'getter:first',
			'descriptor:second',
			'get:second',
			'getter:second',
			'descriptor:hidden',
			'descriptor:Symbol(spread)',
			'get:Symbol(spread)',
			'getter:Symbol(spread)',
		]);

		events.length = 0;
		expect(/** @type {Record<PropertyKey, unknown>} */ (normalized)[symbol]).toBe(3);
		expect(events).toEqual(['get:Symbol(spread)', 'getter:Symbol(spread)']);
	});

	it('preserves inherited assignment side effects before returning an ordinary spread unchanged', () => {
		/** @type {Array<unknown>} */
		const events = [];
		const setter_key = Symbol('temporary spread assignment');
		/** @type {object | undefined} */
		let setter_receiver;
		const props = {
			get first() {
				events.push('get:first');
				return 'first value';
			},
			get [setter_key]() {
				events.push('get:symbol');
				Object.defineProperty(Object.prototype, setter_key, {
					configurable: true,
					set(value) {
						setter_receiver = this;
						events.push(['set:symbol', value, Reflect.ownKeys(this)]);
					},
				});
				return 'symbol value';
			},
			get last() {
				events.push('get:last');
				return 'last value';
			},
		};

		try {
			const normalized = normalize_spread_props(props);

			expect(normalized).toBe(props);
			expect(events).toEqual([
				'get:first',
				'get:last',
				'get:symbol',
				['set:symbol', 'symbol value', ['first', 'last']],
			]);
			expect(setter_receiver).not.toBe(props);
			expect(Object.getPrototypeOf(setter_receiver)).toBe(Object.prototype);
			expect(Reflect.ownKeys(/** @type {object} */ (setter_receiver))).toEqual(['first', 'last']);
			expect(Object.prototype.hasOwnProperty.call(setter_receiver, setter_key)).toBe(false);
		} finally {
			delete Object.prototype[setter_key];
		}
	});

	it('propagates own-key, descriptor, and getter failures at their observation point', () => {
		const own_keys_error = new RangeError('own keys failed');
		/** @type {string[]} */
		const own_keys_events = [];
		const own_keys_thrown = capture_error(() =>
			normalize_spread_props(
				new Proxy(
					{},
					{
						ownKeys() {
							own_keys_events.push('ownKeys');
							throw own_keys_error;
						},
					},
				),
			),
		);
		expect(own_keys_thrown).toBe(own_keys_error);
		expect(own_keys_events).toEqual(['ownKeys']);

		const descriptor_error = new SyntaxError('descriptor failed');
		/** @type {string[]} */
		const descriptor_events = [];
		const descriptor_thrown = capture_error(() =>
			normalize_spread_props(
				new Proxy(
					{ first: 1, second: 2 },
					{
						ownKeys(target) {
							descriptor_events.push('ownKeys');
							return Reflect.ownKeys(target);
						},
						getOwnPropertyDescriptor(target, key) {
							descriptor_events.push(`descriptor:${String(key)}`);
							if (key === 'second') throw descriptor_error;
							return Reflect.getOwnPropertyDescriptor(target, key);
						},
						get(target, key, receiver) {
							descriptor_events.push(`get:${String(key)}`);
							return Reflect.get(target, key, receiver);
						},
					},
				),
			),
		);
		expect(descriptor_thrown).toBe(descriptor_error);
		expect(descriptor_events).toEqual([
			'ownKeys',
			'descriptor:first',
			'get:first',
			'descriptor:second',
		]);

		const getter_error = new TypeError('getter failed');
		/** @type {string[]} */
		const getter_events = [];
		const getter_target = {
			first: 1,
			get second() {
				getter_events.push('getter:second');
				throw getter_error;
			},
			third: 3,
		};
		const getter_thrown = capture_error(() =>
			normalize_spread_props(observe_props(getter_target, getter_events)),
		);
		expect(getter_thrown).toBe(getter_error);
		expect(getter_events).toEqual([
			'ownKeys',
			'descriptor:first',
			'get:first',
			'descriptor:second',
			'get:second',
			'getter:second',
		]);
	});

	it('keeps explicit no-ref spreads at source identity with no hidden source writes', () => {
		/** @type {string[]} */
		const events = [];
		const target = { id: 'plain' };
		Object.defineProperty(target, 'hidden', {
			enumerable: false,
			get() {
				events.push('getter:hidden');
				return 'unobserved';
			},
		});
		Object.freeze(target);
		const props = observe_props(target, events);

		const normalized = normalize_spread_props_for_ref_attr(props);

		expect(normalized === props).toBe(true);
		expect(events).toEqual([
			'ownKeys',
			'descriptor:id',
			'get:id',
			'descriptor:hidden',
			'descriptor:ref',
		]);
		expect(Reflect.ownKeys(target)).toEqual(['id', 'hidden']);
	});

	it('preserves explicit ordinary-ref reads, source state, and the selected ref value', () => {
		/** @type {string[]} */
		const events = [];
		/** @type {Array<unknown>} */
		const ref_events = [];
		const node = {};
		const refs = [
			/** @param {object | null} value */
			(value) => {
				ref_events.push(['first', value]);
			},
			/** @param {object | null} value */
			(value) => {
				ref_events.push(['second', value]);
				return () => ref_events.push(['second cleanup']);
			},
			/** @param {object | null} value */
			(value) => {
				ref_events.push(['third', value]);
			},
		];
		let ref_reads = 0;
		const target = {};
		Object.defineProperties(target, {
			id: {
				enumerable: true,
				get() {
					events.push('getter:id');
					return 'ordinary';
				},
			},
			ref: {
				enumerable: true,
				get() {
					ref_reads += 1;
					events.push(`getter:ref:${ref_reads}`);
					return refs[ref_reads - 1];
				},
			},
		});
		Object.freeze(target);
		const original_ref_descriptor = Reflect.getOwnPropertyDescriptor(target, 'ref');
		const props = observe_props(target, events);

		const normalized =
			/** @type {Record<PropertyKey, unknown> & {
			 * ref: (node: object) => () => void
			 * }} */ (normalize_spread_props_for_ref_attr(props));

		expect(events).toEqual([
			'ownKeys',
			'descriptor:id',
			'get:id',
			'getter:id',
			'descriptor:ref',
			'get:ref',
			'getter:ref:1',
			'descriptor:ref',
			'get:ref',
			'getter:ref:2',
			'ownKeys',
			'descriptor:id',
			'get:id',
			'getter:id',
			'descriptor:ref',
			'get:ref',
			'getter:ref:3',
		]);
		expect(normalized === props).toBe(false);
		expect(normalized.id).toBe('ordinary');
		expect(normalized.ref).toBe(refs[1]);
		expect_explicit_ref_descriptor(normalized, refs[1]);
		expect(Reflect.getOwnPropertyDescriptor(target, 'ref')).toEqual(original_ref_descriptor);

		const cleanup = normalized.ref(node);
		expect(ref_events).toEqual([['second', node]]);
		cleanup();
		expect(ref_events).toEqual([['second', node], ['second cleanup']]);
	});

	it('preserves explicit compiler-branded ref reads and source state', () => {
		/** @type {string[]} */
		const events = [];
		/** @type {Array<unknown>} */
		const ref_events = [];
		const node = {};
		const branded_ref = create_ref_prop(() => {
			ref_events.push(['resolve branded']);
			return (value) => {
				ref_events.push(['branded', value]);
				return () => ref_events.push(['branded cleanup']);
			};
		});
		const target = Object.freeze({ id: 'branded', ref: branded_ref });
		const props = observe_props(target, events);

		const normalized =
			/** @type {Record<PropertyKey, unknown> & {
			 * ref: (node: object) => () => void
			 * }} */ (normalize_spread_props_for_ref_attr(props));

		expect(events).toEqual(['ownKeys', 'descriptor:id', 'get:id', 'descriptor:ref', 'get:ref']);
		expect(normalized === props).toBe(false);
		expect(normalized.id).toBe('branded');
		expect(normalized.ref).toBe(branded_ref);
		expect_explicit_ref_descriptor(normalized, branded_ref);
		expect(target.ref).toBe(branded_ref);

		const cleanup = normalized.ref(node);
		expect(ref_events).toEqual([['resolve branded'], ['branded', node]]);
		cleanup();
		expect(ref_events).toEqual([['resolve branded'], ['branded', node], ['branded cleanup']]);
	});

	it('preserves explicit outer-ref reads and source state', () => {
		/** @type {string[]} */
		const events = [];
		/** @type {Array<unknown>} */
		const ref_events = [];
		const node = {};
		const target = Object.freeze({ id: 'outer' });
		const props = observe_props(target, events);
		/** @param {object | null} value */
		const outer_ref = (value) => {
			ref_events.push(['outer', value]);
			return () => ref_events.push(['outer cleanup']);
		};

		const normalized =
			/** @type {Record<PropertyKey, unknown> & {
			 * ref: (node: object) => () => void
			 * }} */ (normalize_spread_props_for_ref_attr(props, outer_ref));

		expect(events).toEqual(['ownKeys', 'descriptor:id', 'get:id']);
		expect(normalized === props).toBe(false);
		expect(normalized.id).toBe('outer');
		expect(normalized.ref).toBe(outer_ref);
		expect_explicit_ref_descriptor(normalized, outer_ref);
		expect(Reflect.ownKeys(target)).toEqual(['id']);

		const cleanup = normalized.ref(node);
		expect(ref_events).toEqual([['outer', node]]);
		cleanup();
		expect(ref_events).toEqual([['outer', node], ['outer cleanup']]);
	});

	it('propagates explicit-ref descriptor and getter failures on the same pass', () => {
		const descriptor_error = new EvalError('explicit descriptor failed');
		/** @type {string[]} */
		const descriptor_events = [];
		let descriptor_reads = 0;
		const descriptor_thrown = capture_error(() =>
			normalize_spread_props_for_ref_attr(
				new Proxy(
					{ ref() {} },
					{
						ownKeys(target) {
							descriptor_events.push('ownKeys');
							return Reflect.ownKeys(target);
						},
						getOwnPropertyDescriptor(target, key) {
							descriptor_reads += 1;
							descriptor_events.push(`descriptor:${String(key)}:${descriptor_reads}`);
							if (descriptor_reads === 2) throw descriptor_error;
							return Reflect.getOwnPropertyDescriptor(target, key);
						},
						get(target, key, receiver) {
							descriptor_events.push(`get:${String(key)}`);
							return Reflect.get(target, key, receiver);
						},
					},
				),
			),
		);
		expect(descriptor_thrown).toBe(descriptor_error);
		expect(descriptor_events).toEqual([
			'ownKeys',
			'descriptor:ref:1',
			'get:ref',
			'descriptor:ref:2',
		]);

		const getter_error = new URIError('explicit getter failed');
		/** @type {string[]} */
		const getter_events = [];
		let getter_reads = 0;
		const getter_target = {
			get ref() {
				getter_reads += 1;
				getter_events.push(`getter:ref:${getter_reads}`);
				if (getter_reads === 2) throw getter_error;
				return () => {};
			},
		};
		const getter_thrown = capture_error(() =>
			normalize_spread_props_for_ref_attr(observe_props(getter_target, getter_events)),
		);
		expect(getter_thrown).toBe(getter_error);
		expect(getter_events).toEqual([
			'ownKeys',
			'descriptor:ref',
			'get:ref',
			'getter:ref:1',
			'descriptor:ref',
			'get:ref',
			'getter:ref:2',
		]);
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

		const normalized = normalize_spread_props_for_ref_attr(props, outer_ref);
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
		expect_explicit_ref_descriptor(normalized_props, normalized_props.ref);
		expect({ ...normalized_props }).toEqual({ id: 'field', [symbol]: 'symbol value' });
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
		expect(normalize_spread_props_for_ref_attr(null, outer_ref)).toBeNull();
		expect(normalize_spread_props_for_ref_attr(undefined, outer_ref)).toBeUndefined();
		expect(normalize_spread_props(props, outer_ref)).toEqual({ id: 'field', ref: outer_ref });
	});
});
