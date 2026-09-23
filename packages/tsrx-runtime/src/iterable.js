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

	var iterable_prop = /** @type {Iterable<T>} */ (iterable)[Symbol.iterator];
	var source = to_iterable(iterable, iterable_prop);

	// A real Set or Map preallocates the result from its size. The size is only a
	// capacity hint: `is_last` still comes from the walk itself, so callbacks that
	// add or remove entries keep the same semantics as any other iterable.
	var capacity = 0;
	if (
		iterable_prop === Set.prototype[Symbol.iterator] ||
		iterable_prop === Map.prototype[Symbol.iterator]
	) {
		var size = /** @type {Set<T> | Map<unknown, unknown>} */ (iterable).size;
		if (typeof size === 'number' && size > 0) {
			capacity = size;
		}
	}

	/** @type {U[]} */
	var result = capacity > 0 ? new Array(capacity) : [];
	var count = 0;
	var index = 0;
	var has_previous = false;
	/** @type {T | undefined} */
	var previous;

	// `for...of` lets engines skip the per-item iterator result object, and
	// running one item behind keeps the peek-ahead contract: `fn` sees an item
	// only after the next one has been pulled, so `is_last` is exact.
	for (var item of source) {
		if (has_previous) {
			count = write_mapped(
				result,
				capacity,
				count,
				fn(/** @type {T} */ (previous), index++, false),
			);
		}
		previous = item;
		has_previous = true;
	}

	if (!has_previous) {
		return finish_empty(empty);
	}

	count = write_mapped(result, capacity, count, fn(/** @type {T} */ (previous), index, true));
	if (count < capacity) {
		result.length = count;
	}
	return finish_tail(result, tail);
}

/**
 * The `@for` helper for a loop body that awaits: `map_iterable`'s contract, with
 * each item's value settled before the next item is visited, as in a
 * `for...of` loop in an async function.
 *
 * @template T
 * @template U
 * @param {Iterable<T> | Iterator<T>} iterable
 * @param {(item: T, index: number, is_last: boolean) => U | Promise<U>} fn
 * @param {(() => U | U[] | Promise<U | U[]>) | null} [tail]
 * @param {() => U | U[] | Promise<U | U[]>} [empty]
 * @returns {Promise<U[]>}
 */
export async function map_iterable_async(iterable, fn, tail, empty) {
	/** @type {U[]} */
	var result = [];
	var count = 0;

	if (Array.isArray(iterable)) {
		var length = iterable.length;
		for (; count < length; count++) {
			push_mapped(result, await fn(iterable[count], count, count === length - 1));
		}
	} else {
		var source = to_iterable(iterable, /** @type {Iterable<T>} */ (iterable)[Symbol.iterator]);
		var has_previous = false;
		/** @type {T | undefined} */
		var previous;

		for (var item of source) {
			if (has_previous) {
				push_mapped(result, await fn(/** @type {T} */ (previous), count++, false));
			}
			previous = item;
			has_previous = true;
		}

		if (has_previous) {
			push_mapped(result, await fn(/** @type {T} */ (previous), count++, true));
		}
	}

	if (count === 0) {
		if (!empty) {
			return [];
		}
		var empty_value = await empty();
		return Array.isArray(empty_value) ? empty_value : [empty_value];
	}

	if (tail) {
		push_mapped(result, await tail());
	}
	return result;
}

/**
 * @template T
 * @param {Iterable<T> | Iterator<T>} iterable
 * @param {unknown} iterable_prop the value's own `Symbol.iterator`
 * @returns {Iterable<T>}
 */
function to_iterable(iterable, iterable_prop) {
	if (typeof iterable_prop === 'function') {
		return /** @type {Iterable<T>} */ (iterable);
	}
	if (typeof (/** @type {Iterator<T>} */ (iterable).next) === 'function') {
		return Iterator.from(/** @type {Iterator<T>} */ (iterable));
	}
	throw new TypeError('The loop target has to be an Iterable');
}

/**
 * Stores one mapped value. Slots below `capacity` are preallocated and written by
 * index; anything past them is pushed. A fragment result truncates the unused
 * slots and pushes, after which the returned count equals `capacity` so later
 * values push as well.
 *
 * @template U
 * @param {U[]} result
 * @param {number} capacity
 * @param {number} count
 * @param {U | U[]} value
 * @returns {number}
 */
function write_mapped(result, capacity, count, value) {
	if (Array.isArray(value)) {
		if (count < capacity) {
			result.length = count;
		}
		push_mapped(result, value);
		return capacity;
	}
	if (count < capacity) {
		result[count] = value;
		return count + 1;
	}
	result.push(value);
	return count;
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
