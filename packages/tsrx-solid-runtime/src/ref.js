/** @import { SpreadFalsy, SpreadProps } from '@tsrx/runtime/ref' */

import { createMemo, omit } from 'solid-js';
import { normalize_spread_props_sharing_refs } from '@tsrx/runtime/ref';

export * from '@tsrx/runtime/ref';

/**
 * Normalize the host spreads of an element that has more than one beside its
 * own `ref`. Solid's prop merge keeps only the last spread's `ref`, so `bag(i)`
 * hands each spread its bag without a `ref`, and `refs` is one more spread whose
 * `ref` lists the bags' refs in order, for `spread()` to apply beside the
 * element's own. Each bag is normalized lazily in a memo that its spread and
 * `refs` share, so it is read when Solid reads the spread and again only when
 * it changes.
 *
 * `spread()` applies every function in the list each time the list changes, so
 * after the first list `refs.ref` holds only the refs that changed, and it
 * changes only when one does: a bag update that keeps its refs applies nothing.
 * A bag's several refs merge into the same `ref` while they stay the same.
 *
 * @param {...() => object | SpreadFalsy} sources
 * @returns {{
 *   bag: (index: number) => object | SpreadFalsy,
 *   refs: { readonly ref: unknown[] },
 * }}
 */
export function spread_ref_bags(...sources) {
	const bags = sources.map((source) =>
		createMemo(() => normalize_spread_props_sharing_refs(source())),
	);
	/** @type {unknown[]} */
	let applied = [];
	const changed_refs = createMemo(
		() => {
			const refs = bags.map((bag) => {
				const value = bag();
				return value == null ? undefined : /** @type {SpreadProps} */ (value).ref;
			});
			const changed = refs.map((ref, index) => (ref === applied[index] ? undefined : ref));
			applied = refs;
			return changed;
		},
		{ equals: (_, changed) => changed.every((ref) => ref === undefined) },
	);
	return {
		bag(index) {
			const bag = bags[index]();
			return bag !== null && (typeof bag === 'object' || typeof bag === 'function') && 'ref' in bag
				? omit(/** @type {SpreadProps} */ (bag), 'ref')
				: bag;
		},
		refs: {
			get ref() {
				return changed_refs();
			},
		},
	};
}
