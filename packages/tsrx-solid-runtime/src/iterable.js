import { iterable_to_array } from '@tsrx/runtime/iterable';

/**
 * The `each` of the `<For>` an `@for` becomes: the source's items as an array,
 * walked the way `for...of` walks them. A missing source stays as it is, so
 * `<For>` renders its fallback.
 *
 * @template T
 * @param {Iterable<T> | Iterator<T> | null | undefined | false} source
 * @returns {T[] | null | undefined | false}
 */
export function for_items(source) {
	return source == null || source === false ? source : iterable_to_array(source);
}

/**
 * The last row made for each object item, so an evaluation that finds the
 * item under the same key hands `<For>` the same row and its accessor doesn't
 * change. A row holds only its item and key, so loops can share it.
 * @type {WeakMap<object, { item: unknown, key: unknown }>}
 */
var rows_by_item = new WeakMap();

/**
 * The `each` of the `<For>` an `@for` becomes when its key reads the loop
 * index, which Solid's `keyed` callback doesn't receive: each item paired with
 * its key, computed from the item and its index. A hole in a sparse array is
 * an `undefined` item, as `for...of` reads it.
 *
 * @template T
 * @template K
 * @param {Iterable<T> | Iterator<T> | null | undefined | false} source
 * @param {(item: T, index: number) => K} key
 * @returns {Array<{ item: T, key: K }> | null | undefined | false}
 */
export function for_keyed_rows(source, key) {
	if (source == null || source === false) {
		return source;
	}
	return Array.from(iterable_to_array(source), (item, index) => {
		var row_key = key(item, index);
		if ((typeof item !== 'object' && typeof item !== 'function') || item === null) {
			return { item, key: row_key };
		}
		var row = /** @type {{ item: T, key: K } | undefined} */ (rows_by_item.get(item));
		if (row === undefined || !Object.is(row.key, row_key)) {
			row = { item, key: row_key };
			rows_by_item.set(item, row);
		}
		return row;
	});
}
