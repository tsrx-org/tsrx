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

	it('applies mergeRefs in order and cleans up in the same order', () => {
		/** @type {Array<unknown>} */
		const events = [];
		const node = {};
		/** @type {{ current: object | null }} */
		const current_ref = { current: null };
		/** @type {{ value: object | null }} */
		const value_ref = { value: null };
		/** @param {object | null} value */
		const callback_with_cleanup = (value) => {
			events.push(['callback', value]);
			return () => events.push(['callback cleanup']);
		};
		/** @param {object | null} value */
		const callback_without_cleanup = (value) => {
			events.push(['bare callback', value]);
		};

		const merged = mergeRefs(
			null,
			callback_with_cleanup,
			undefined,
			current_ref,
			callback_without_cleanup,
			value_ref,
		);
		const cleanup = merged(node);
		expect(events).toEqual([
			['callback', node],
			['bare callback', node],
		]);
		expect(current_ref.current).toBe(node);
		expect(value_ref.value).toBe(node);

		cleanup();
		expect(events).toEqual([
			['callback', node],
			['bare callback', node],
			['callback cleanup'],
			['bare callback', null],
		]);
		expect(current_ref.current).toBeNull();
		expect(value_ref.value).toBeNull();
	});

	it('stops mergeRefs at a thrown callback or cleanup in the original order', () => {
		/** @type {string[]} */
		const events = [];
		const error = new Error('ref failure');
		/** @param {object | null} _node */
		const first = (_node) => {
			events.push('first');
			return () => events.push('first cleanup');
		};
		/** @param {object | null} _node */
		const second = (_node) => {
			events.push('second');
			throw error;
		};
		/** @param {object | null} _node */
		const third = (_node) => {
			events.push('third');
		};

		expect(() => mergeRefs(first, second, third)({})).toThrow(error);
		expect(events).toEqual(['first', 'second']);

		events.length = 0;
		/** @type {{ current: object | null }} */
		const current_ref = { current: null };
		/** @param {object | null} _node */
		const throwing_cleanup = (_node) => {
			events.push('callback');
			return () => {
				events.push('throwing cleanup');
				throw error;
			};
		};
		const cleanup = mergeRefs(first, current_ref, throwing_cleanup, third)({});
		expect(events).toEqual(['first', 'callback', 'third']);
		expect(() => cleanup()).toThrow(error);
		expect(events).toEqual(['first', 'callback', 'third', 'first cleanup', 'throwing cleanup']);
		expect(current_ref.current).toBeNull();
	});

	it('mergeRefs ignores array refs and DOM-like objects', () => {
		const node = {};
		const dom_like = { nodeType: 1, nodeName: 'DIV', current: null, value: null };
		/** @type {{ current: object | null }} */
		const current_ref = { current: null };
		/** @type {object[]} */
		const callback_seen = [];
		/** @param {object | null} value */
		const callback = (value) => {
			if (value === null) return;
			callback_seen.push(value);
		};

		const cleanup = mergeRefs(
			/** @type {MergeableRef<object>} */ (/** @type {unknown} */ ([callback])),
			/** @type {MergeableRef<object>} */ (dom_like),
			current_ref,
		)(node);

		expect(callback_seen).toEqual([]);
		expect(dom_like.current).toBeNull();
		expect(dom_like.value).toBeNull();
		expect(current_ref.current).toBe(node);
		cleanup();
		expect(current_ref.current).toBeNull();
	});

	it('mergeRefs assigns branded and inherited-accessor value refs', () => {
		const node = {};
		/** @type {object | null} */
		let inherited_stored = null;
		const inherited_value_ref = Object.create({
			get value() {
				return inherited_stored;
			},
			set value(value) {
				inherited_stored = value;
			},
		});
		const branded_ref = { __v_isRef: true };
		/** @param {object | null} _node */
		const callback = (_node) => {};

		const cleanup = mergeRefs(
			/** @type {MergeableRef<object>} */ (inherited_value_ref),
			/** @type {MergeableRef<object>} */ (/** @type {unknown} */ (branded_ref)),
			callback,
		)(node);

		expect(inherited_stored).toBe(node);
		expect(/** @type {{ value?: unknown }} */ (branded_ref).value).toBe(node);
		cleanup();
		expect(inherited_stored).toBeNull();
		expect(/** @type {{ value?: unknown }} */ (branded_ref).value).toBeNull();
	});

	it('mergeRefs re-applies bare callback refs with null on cleanup after a null mount', () => {
		/** @type {Array<object | null>} */
		const seen = [];
		/** @param {object | null} value */
		const callback = (value) => {
			seen.push(value);
		};

		const cleanup = mergeRefs(callback)(null);
		expect(seen).toEqual([null]);
		cleanup();
		expect(seen).toEqual([null, null]);
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

	it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])(
		'preserves all-nullish results and surviving ref identity with %i arguments',
		(length) => {
			const nullish_refs = Array.from({ length }, (_, index) => (index % 2 ? null : undefined));
			const callback = () => {};
			const survivors = [callback, { current: null }, { value: null }, [callback]];

			expect(merge_ref_props(...nullish_refs)).toBeUndefined();
			for (const survivor of survivors) {
				for (let index = 0; index < length; index++) {
					const refs = [
						...nullish_refs.slice(0, index),
						survivor,
						...nullish_refs.slice(index + 1),
					];
					const original_refs = refs.slice();

					expect(merge_ref_props(...refs)).toBe(survivor);
					expect(refs).toEqual(original_refs);
				}
			}
		},
	);

	it.each([3, 4, 5, 6, 7, 8])(
		'preserves callback cleanup and null fallback across repeated invocations with %i arguments',
		(length) => {
			/** @type {Array<unknown>} */
			const events = [];
			/** @param {object | null} node */
			const legacy = (node) => {
				events.push(['legacy', node]);
			};
			/** @param {object | null} node */
			const custom = (node) => {
				events.push(['custom', node]);
				return () => events.push(['custom cleanup', node]);
			};
			const refs = [null, legacy, ...Array(length - 3).fill(undefined), custom];
			const original_refs = refs.slice();
			const merged = merge_ref_props(...refs);
			if (typeof merged !== 'function') {
				throw new TypeError('Expected multiple refs to produce a callback');
			}
			expect(events).toEqual([]);
			expect(refs).toEqual(original_refs);

			for (const node of [{ id: 'first' }, { id: 'second' }, null]) {
				events.length = 0;
				const cleanup = merged(node);
				expect(events).toEqual([
					['legacy', node],
					['custom', node],
				]);
				expect(typeof cleanup).toBe('function');

				cleanup?.();
				expect(events).toEqual([
					['legacy', node],
					['custom', node],
					...(node === null ? [] : [['legacy', null]]),
					['custom cleanup', node],
				]);
			}
		},
	);

	it('preserves object-ref assignment and cleanup order among eight mixed refs', () => {
		/** @type {Array<unknown>} */
		const events = [];
		const node = {};
		/** @type {{ current: object | null }} */
		const current_ref = { current: null };
		/** @type {{ value: object | null }} */
		const value_ref = { value: null };
		const first = () => {
			events.push(['first', current_ref.current, value_ref.value]);
			return () => events.push(['first cleanup', current_ref.current, value_ref.value]);
		};
		const last = () => {
			events.push(['last', current_ref.current, value_ref.value]);
			return () => events.push(['last cleanup', current_ref.current, value_ref.value]);
		};
		const merged = merge_ref_props(
			null,
			first,
			undefined,
			current_ref,
			null,
			value_ref,
			last,
			null,
		);
		if (typeof merged !== 'function') {
			throw new TypeError('Expected multiple refs to produce a callback');
		}

		const cleanup = merged(node);
		expect(events).toEqual([
			['first', null, null],
			['last', node, node],
		]);
		cleanup?.();
		expect(events).toEqual([
			['first', null, null],
			['last', node, node],
			['first cleanup', node, node],
			['last cleanup', null, null],
		]);
		expect(current_ref.current).toBeNull();
		expect(value_ref.value).toBeNull();
	});

	it.each(['callback', 'cleanup'])(
		'stops merged refs at a thrown %s in the original order',
		(phase) => {
			/** @type {string[]} */
			const events = [];
			const error = new Error(`failed ${phase}`);
			/** @param {object | null} _node */
			const first = (_node) => {
				events.push('first');
				return () => events.push('first cleanup');
			};
			/** @param {object | null} _node */
			const second = (_node) => {
				events.push('second');
				if (phase === 'callback') throw error;
				return () => {
					events.push('second cleanup');
					throw error;
				};
			};
			/** @param {object | null} _node */
			const third = (_node) => {
				events.push('third');
				return () => events.push('third cleanup');
			};
			const merged = merge_ref_props(null, first, undefined, second, third);
			if (typeof merged !== 'function') {
				throw new TypeError('Expected multiple refs to produce a callback');
			}

			if (phase === 'callback') {
				expect(() => merged({})).toThrow(error);
				expect(events).toEqual(['first', 'second']);
			} else {
				const cleanup = merged({});
				expect(cleanup).toThrow(error);
				expect(events).toEqual(['first', 'second', 'third', 'first cleanup', 'second cleanup']);
			}
		},
	);

	it('flattens array refs and branded value refs into merged cleanup order', () => {
		/** @type {string[]} */
		const events = [];
		const node = {};
		/** @type {{ value: object | null, __v_isRef: boolean }} */
		const branded_ref = { value: null, __v_isRef: true };
		/** @type {{ current: object | null }} */
		const inner_ref = { current: null };
		const merged = merge_ref_props(
			/** @param {object | null} _node */
			(_node) => {
				events.push('outer');
				return () => events.push('outer cleanup');
			},
			[
				inner_ref,
				/** @param {object | null} _node */
				(_node) => {
					events.push('inner');
				},
			],
			branded_ref,
		);
		if (typeof merged !== 'function') {
			throw new TypeError('Expected multiple refs to produce a callback');
		}

		const cleanup = merged(node);
		expect(events).toEqual(['outer', 'inner']);
		expect(inner_ref.current).toBe(node);
		expect(branded_ref.value).toBe(node);
		cleanup?.();
		expect(events).toEqual(['outer', 'inner', 'outer cleanup', 'inner']);
		expect(inner_ref.current).toBeNull();
		expect(branded_ref.value).toBeNull();
	});

	it('does not re-invoke bare callbacks on cleanup after a null mount', () => {
		/** @type {Array<object | null>} */
		const callback_seen = [];
		/** @type {{ current: object | null }} */
		const object_ref = { current: null };
		const merged = merge_ref_props(
			/** @param {object | null} node */
			(node) => {
				callback_seen.push(node);
			},
			object_ref,
		);
		if (typeof merged !== 'function') {
			throw new TypeError('Expected multiple refs to produce a callback');
		}

		const cleanup = merged(/** @type {object} */ (/** @type {unknown} */ (null)));
		expect(callback_seen).toEqual([null]);
		expect(object_ref.current).toBeNull();
		cleanup?.();
		expect(callback_seen).toEqual([null]);
		expect(object_ref.current).toBeNull();
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
			delete (/** @type {Record<PropertyKey, unknown>} */ (Object.prototype)[setter_key]);
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
			return /** @param {object | null} value */ (value) => {
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
		expect(normalized).not.toBe(props);
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

	it('passes a single collected ref through unwrapped', () => {
		/** @type {Array<unknown>} */
		const events = [];
		const node = {};
		/** @param {object | null} value */
		const named_callback = (value) => {
			events.push(['named', value]);
		};
		const named_ref = create_ref_prop(() => named_callback);
		/** @param {object | null} value */
		const keyed_callback = (value) => {
			events.push(['keyed', value]);
		};
		const keyed_ref = create_ref_prop(() => keyed_callback);

		const named_only = normalize_spread_props({ id: 'a', onMount: named_ref });
		expect(named_only).toMatchObject({ id: 'a' });
		expect(named_only).not.toHaveProperty('onMount');
		expect(/** @type {Record<PropertyKey, unknown>} */ (named_only).ref).toBe(named_ref);

		const keyed_only = normalize_spread_props({ id: 'b', ref: keyed_ref });
		expect(/** @type {Record<PropertyKey, unknown>} */ (keyed_only).ref).toBe(keyed_ref);

		// Two collected refs merge in key order and stay wrapped.
		const merged = normalize_spread_props({ first: named_ref, second: keyed_ref });
		const merged_ref = /** @type {(value: object | null) => () => void} */ (
			/** @type {Record<PropertyKey, unknown>} */ (merged).ref
		);
		expect(merged_ref).not.toBe(named_ref);
		expect(merged_ref).not.toBe(keyed_ref);
		const cleanup = merged_ref(node);
		expect(events).toEqual([
			['named', node],
			['keyed', node],
		]);
		cleanup();
		expect(events).toEqual([
			['named', node],
			['keyed', node],
			['named', null],
			['keyed', null],
		]);
	});

	it('prepends a plain ref ahead of outer refs when no branded refs were collected', () => {
		/** @type {Array<unknown>} */
		const events = [];
		const node = {};
		/** @param {object | null} value */
		const existing = (value) => {
			events.push(['existing', value]);
			return () => {
				events.push(['existing cleanup']);
			};
		};
		/** @param {object | null} value */
		const outer_first = (value) => {
			events.push(['outer1', value]);
		};
		/** @param {object | null} value */
		const outer_second = (value) => {
			events.push(['outer2', value]);
		};

		const normalized = normalize_spread_props(
			{ id: 'field', ref: existing },
			outer_first,
			null,
			outer_second,
		);
		const merged_ref = /** @type {(value: object | null) => () => void} */ (
			/** @type {Record<PropertyKey, unknown>} */ (normalized).ref
		);
		expect(merged_ref).not.toBe(existing);

		const cleanup = merged_ref(node);
		expect(events).toEqual([
			['existing', node],
			['outer1', node],
			['outer2', node],
		]);
		cleanup();
		expect(events).toEqual([
			['existing', node],
			['outer1', node],
			['outer2', node],
			['existing cleanup'],
			['outer1', null],
			['outer2', null],
		]);
	});
});
