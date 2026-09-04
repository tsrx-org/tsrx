/** @type {typeof Object.getOwnPropertyDescriptor} */
export var get_descriptor = Object.getOwnPropertyDescriptor;
/** @type {typeof Object.getOwnPropertyDescriptors} */
export var get_descriptors = Object.getOwnPropertyDescriptors;
/** @type {typeof Array.from} */
export var array_from = Array.from;
/** @type {typeof Array.isArray} */
export var is_array = Array.isArray;
/** @type {typeof Object.defineProperty} */
export var define_property = Object.defineProperty;
/** @type {typeof Object.getPrototypeOf} */
export var get_prototype_of = Object.getPrototypeOf;
/** @type {typeof Object.values} */
export var object_values = Object.values;
/** @type {typeof Object.entries} */
export var object_entries = Object.entries;
/** @type {typeof Object.keys} */
export var object_keys = Object.keys;
/** @type {typeof Object.getOwnPropertySymbols} */
export var get_own_property_symbols = Object.getOwnPropertySymbols;
/** @type {typeof structuredClone} */
export var structured_clone = structuredClone;
/** @type {typeof Object.prototype} */
export var object_prototype = Object.prototype;
/** @type {typeof Array.prototype} */
export var array_prototype = Array.prototype;
/** @type {typeof Object.prototype.hasOwnProperty} */
export var has_own_property = object_prototype.hasOwnProperty;

/**
 * @param {object} value
 * @param {PropertyKey} key
 * @returns {boolean}
 */
export function has_prototype_accessor(value, key) {
	var proto = get_prototype_of(value);
	while (proto != null) {
		var descriptor = get_descriptor(proto, key);
		if (descriptor !== undefined) {
			return typeof descriptor.get === 'function' || typeof descriptor.set === 'function';
		}
		proto = get_prototype_of(proto);
	}
	return false;
}

/**
 * Slice helper for arrays and array-like values.
 * @template T
 * @param {ArrayLike<T>} array_like
 * @param {...number} args
 * @returns {T[]}
 */
export function array_slice(array_like, ...args) {
	return is_array(array_like)
		? array_like.slice(...args)
		: array_prototype.slice.call(array_like, ...args);
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function to_length(value) {
	var len = Number(value);
	if (!Number.isFinite(len) || len <= 0) {
		return 0;
	}
	return Math.min(Math.trunc(len), Number.MAX_SAFE_INTEGER);
}

/**
 * @template T
 * @param {ArrayLike<T>} array_like
 * @param {number} start
 * @param {number} length
 * @returns {T[]}
 */
function copy_from_offset(array_like, start, length) {
	var count = length - start;
	var result = new Array(count);
	for (var i = 0; i < count; i++) {
		result[i] = array_like[start + i];
	}
	return result;
}

/**
 * Indexed copy used when the source is already a length-bearing collection
 * whose iterator walks indexes (arguments, typed arrays). Skip comparison
 * is `start < index` so negative, fractional, and `NaN` indexes match the
 * iterator path. Sparse holes become own `undefined` entries. Strings stay
 * on the iterator path so non-BMP code points are not split into surrogates.
 *
 * @template T
 * @param {ArrayLike<T>} array_like
 * @param {number} index
 * @returns {T[]}
 */
function array_from_index(array_like, index) {
	var length = array_like.length;
	var start = 0;
	while (start < length && start < index) {
		start += 1;
	}
	return copy_from_offset(array_like, start, length);
}

/**
 * Indexed copy matching `Array.from(array_like).slice(index)` for objects
 * that are array-like but not iterable.
 *
 * @template T
 * @param {ArrayLike<T>} array_like
 * @param {number} index
 * @returns {T[]}
 */
function array_like_from_index(array_like, index) {
	var length = to_length(array_like.length);
	var start = Number(index);
	if (!Number.isFinite(start)) {
		start = 0;
	}
	start = Math.trunc(start);
	if (start < 0) {
		start = Math.max(length + start, 0);
	} else if (start > length) {
		start = length;
	}
	return copy_from_offset(array_like, start, length);
}

/**
 * True when `iterable` is a non-array indexed collection whose default
 * iterator is the same as walking `0..length`. Arrays use `slice` — that
 * fast path is owned separately.
 *
 * @param {object} iterable
 * @param {unknown} iterator
 * @returns {boolean}
 */
function is_indexed_iterable(iterable, iterator) {
	return iterator === array_prototype[Symbol.iterator] || ArrayBuffer.isView(iterable);
}

/**
 * Converts iterables, iterators, and array-like values to an array from an index.
 * Arrays use `slice`. Other length-bearing values take an indexed copy.
 *
 * @template T
 * @param {Iterable<T> | Iterator<T> | ArrayLike<T>} iterable
 * @param {number} [index]
 * @returns {T[]}
 */
export function iterable_array_from(iterable, index = 0) {
	if (is_array(iterable)) {
		return iterable.slice(index);
	}

	if (iterable != null && typeof iterable.length === 'number') {
		var length_iter = /** @type {Iterable<T>} */ (iterable)[Symbol.iterator];
		if (typeof length_iter !== 'function') {
			return array_like_from_index(/** @type {ArrayLike<T>} */ (iterable), index);
		}
		if (is_indexed_iterable(iterable, length_iter)) {
			return array_from_index(/** @type {ArrayLike<T>} */ (iterable), index);
		}
	}

	/** @type {Iterator<T>} */
	var iterator;
	var iterable_prop = /** @type {Iterable<T>} */ (iterable)[Symbol.iterator];

	if (typeof iterable_prop === 'function') {
		iterator = iterable_prop.call(iterable);
	} else if (typeof (/** @type {Iterator<T>} */ (iterable).next) === 'function') {
		iterator = Iterator.from(/** @type {Iterator<T>} */ (iterable));
	} else {
		return array_like_from_index(/** @type {ArrayLike<T>} */ (iterable), index);
	}

	var result = [];
	var i = 0;
	var current = iterator.next();
	while (!current.done) {
		if (i++ < index) {
			current = iterator.next();
			continue;
		}
		result.push(current.value);
		current = iterator.next();
	}
	return result;
}

/**
 * Creates a shallow forwarding object without one prop. Values are exposed through
 * getters so compiler-emitted reactive prop accessors are not snapshotted.
 *
 * @template {object} [T=Record<PropertyKey, unknown>]
 * @template {PropertyKey} [K=PropertyKey]
 * @param {T | null | undefined} props
 * @param {K} exclude_prop
 * @returns {Omit<T, K>} the forwarding object; `{}` when `props` is nullish
 */
export function exclude_prop_from_object(props, exclude_prop) {
	/** @type {Record<PropertyKey, unknown>} */
	const next = {};

	if (props != null) {
		const source = /** @type {Record<PropertyKey, unknown>} */ (props);

		for (const prop of Reflect.ownKeys(source)) {
			if (prop === exclude_prop) continue;

			const descriptor = get_descriptor(source, prop);
			if (!descriptor?.enumerable) continue;

			/** @type {PropertyDescriptor} */
			const forwarding_descriptor = {
				enumerable: true,
				configurable: true,
				get() {
					return source[prop];
				},
			};

			if (descriptor.writable === true || typeof descriptor.set === 'function') {
				forwarding_descriptor.set = (value) => {
					source[prop] = value;
				};
			}

			define_property(next, prop, forwarding_descriptor);
		}
	}

	// The forwarding object is assembled key by key, which no incremental type
	// can describe; it mirrors `props` minus `exclude_prop` by construction.
	return /** @type {Omit<T, K>} */ (next);
}
