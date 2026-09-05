/**
 * @template T
 * @template U
 * @param {Iterable<T> | Iterator<T>} iterable
 * @param {(item: T, index: number, is_last: boolean) => U} fn
 * @param {(() => U | U[]) | null} [tail]
 * @param {() => U | U[]} [empty]
 * @returns {U[]}
 */
export function map_iterable(iterable, fn, tail, empty) {
	if (Array.isArray(iterable)) {
		return map_array(iterable, fn, tail, empty);
	}

	if (is_sized_iterable(iterable)) {
		return map_sized(/** @type {Set<T> | Map<unknown, unknown>} */ (iterable), fn, tail, empty);
	}

	/** @type {Iterator<T>} */
	var iterator;
	var iterable_prop = /** @type {Iterable<T>} */ (iterable)[Symbol.iterator];

	if (typeof iterable_prop === 'function') {
		iterator = iterable_prop.call(iterable);
	} else if (typeof (/** @type {Iterator<T>} */ (iterable).next) === 'function') {
		iterator = Iterator.from(iterable);
	} else {
		throw new TypeError('The loop target has to be an Iterable');
	}

	var current = iterator.next();
	if (current.done) {
		return finish_empty(empty);
	}

	var index = 0;
	/** @type {U[]} */
	var result = [];
	while (true) {
		var next = iterator.next();
		push_mapped(result, fn(current.value, index++, !!next.done));
		if (next.done) {
			break;
		}
		current = next;
	}
	return finish_tail(result, tail);
}

/**
 * True for Set and Map instances whose iterator is the default sized walk.
 * Custom iterators that happen to have `size` still take the peek-ahead path.
 *
 * @param {unknown} iterable
 * @returns {iterable is Set<unknown> | Map<unknown, unknown>}
 */
function is_sized_iterable(iterable) {
	if (iterable == null) {
		return false;
	}
	var iterator = /** @type {Iterable<unknown>} */ (iterable)[Symbol.iterator];
	return iterator === Set.prototype[Symbol.iterator] || iterator === Map.prototype[Symbol.iterator];
}

/**
 * @template T
 * @template U
 * @param {Set<T> | Map<unknown, unknown>} iterable
 * @param {(item: T, index: number, is_last: boolean) => U} fn
 * @param {(() => U | U[]) | null} [tail]
 * @param {() => U | U[]} [empty]
 * @returns {U[]}
 */
function map_sized(iterable, fn, tail, empty) {
	var length = iterable.size;
	if (length === 0) {
		return finish_empty(empty);
	}

	var iterator = iterable[Symbol.iterator]();
	var first = fn(/** @type {T} */ (iterator.next().value), 0, length === 1);
	if (Array.isArray(first)) {
		/** @type {U[]} */
		var flat = [];
		push_mapped(flat, first);
		for (var i = 1; i < length; i++) {
			push_mapped(flat, fn(/** @type {T} */ (iterator.next().value), i, i === length - 1));
		}
		return finish_tail(flat, tail);
	}

	var result = new Array(length);
	result[0] = first;
	for (var i = 1; i < length; i++) {
		var value = fn(/** @type {T} */ (iterator.next().value), i, i === length - 1);
		if (Array.isArray(value)) {
			result.length = i;
			push_mapped(result, value);
			i += 1;
			for (; i < length; i++) {
				push_mapped(result, fn(/** @type {T} */ (iterator.next().value), i, i === length - 1));
			}
			return finish_tail(result, tail);
		}
		result[i] = value;
	}
	return finish_tail(result, tail);
}

/**
 * @template T
 * @template U
 * @param {Array<T>} array
 * @param {(item: T, index: number, is_last: boolean) => U} fn
 * @param {(() => U | U[]) | null} [tail]
 * @param {() => U | U[]} [empty]
 * @returns {U[]}
 */
function map_array(array, fn, tail, empty) {
	var length = array.length;
	if (length === 0) {
		return finish_empty(empty);
	}

	var first = fn(array[0], 0, length === 1);
	if (Array.isArray(first)) {
		/** @type {U[]} */
		var flat = [];
		push_mapped(flat, first);
		for (var i = 1; i < length; i++) {
			push_mapped(flat, fn(array[i], i, i === length - 1));
		}
		return finish_tail(flat, tail);
	}

	var result = new Array(length);
	result[0] = first;
	for (var i = 1; i < length; i++) {
		var value = fn(array[i], i, i === length - 1);
		if (Array.isArray(value)) {
			result.length = i;
			push_mapped(result, value);
			i += 1;
			for (; i < length; i++) {
				push_mapped(result, fn(array[i], i, i === length - 1));
			}
			return finish_tail(result, tail);
		}
		result[i] = value;
	}
	return finish_tail(result, tail);
}

/**
 * @template U
 * @param {U[]} result
 * @param {U | U[]} value
 * @returns {void}
 */
function push_mapped(result, value) {
	if (Array.isArray(value)) {
		for (var j = 0; j < value.length; j++) {
			result.push(value[j]);
		}
	} else {
		result.push(value);
	}
}

/**
 * @template U
 * @param {(() => U | U[]) | undefined} empty
 * @returns {U[]}
 */
function finish_empty(empty) {
	if (!empty) {
		return [];
	}
	var empty_value = empty();
	if (Array.isArray(empty_value)) {
		return empty_value;
	}
	return [empty_value];
}

/**
 * @template U
 * @param {U[]} result
 * @param {(() => U | U[]) | null | undefined} tail
 * @returns {U[]}
 */
function finish_tail(result, tail) {
	if (tail) {
		push_mapped(result, tail());
	}
	return result;
}
