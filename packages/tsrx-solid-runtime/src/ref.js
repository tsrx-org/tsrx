/** @import { SpreadFalsy, SpreadProps } from '@tsrx/runtime/ref' */

import { createMemo, omit } from 'solid-js';
import { normalize_spread_props } from '@tsrx/runtime/ref';

export * from '@tsrx/runtime/ref';

/**
 * Normalize the host spreads of an element that has more than one beside its
 * own `ref`. Solid's prop merge keeps only the last spread's `ref`, so `bag(i)`
 * hands each spread its bag without a `ref`, and `refs` is one more spread whose
 * `ref` lists every bag's ref in order, for `spread()` to apply beside the
 * element's own. Each bag is normalized lazily in a memo that its spread and
 * `refs` share, so it is read when Solid reads the spread and again only when
 * it changes.
 *
 * @param {...() => object | SpreadFalsy} sources
 * @returns {{
 *   bag: (index: number) => object | SpreadFalsy,
 *   refs: { readonly ref: unknown[] },
 * }}
 */
export function spread_ref_bags(...sources) {
	const bags = sources.map((source) => createMemo(() => normalize_spread_props(source())));
	return {
		bag(index) {
			const bag = bags[index]();
			return bag !== null && (typeof bag === 'object' || typeof bag === 'function') && 'ref' in bag
				? omit(/** @type {SpreadProps} */ (bag), 'ref')
				: bag;
		},
		refs: {
			get ref() {
				return bags.map((bag) => {
					const value = bag();
					return value == null ? undefined : /** @type {SpreadProps} */ (value).ref;
				});
			},
		},
	};
}
