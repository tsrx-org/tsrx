import { isProxy, toRaw } from 'vue';
import { iterable_to_array } from '@tsrx/runtime/iterable';

export * from '@tsrx/runtime/iterable';

/**
 * The `in` of the `VaporFor` an `@for` becomes: the source's items as an array,
 * walked once the way `for...of` walks them. `VaporFor` reads an array by index
 * and any other iterable its own way, so it can't take the source as it is. A
 * missing source is no items, as `VaporFor` reads it.
 *
 * A reactive array (`reactive([])`, or `ref([]).value`) is a proxy with Vue's
 * own `Symbol.iterator`, so `iterable_to_array` would copy it on every update.
 * When the array underneath walks the built-in way, it goes through as it is:
 * `VaporFor` reads it by index and tracks it in place.
 *
 * @template T
 * @param {Iterable<T> | Iterator<T> | null | undefined | false} source
 * @returns {T[]}
 */
export function for_items(source) {
	if (source == null || source === false) {
		return [];
	}
	if (isProxy(source) && Array.isArray(source)) {
		var raw = toRaw(source);
		// Checked without reading `Symbol.iterator`, which a getter could answer
		// differently the one time the walk reads it.
		if (
			Object.getPrototypeOf(raw) === Array.prototype &&
			!Object.prototype.hasOwnProperty.call(raw, Symbol.iterator)
		) {
			return /** @type {T[]} */ (source);
		}
	}
	return iterable_to_array(source);
}
