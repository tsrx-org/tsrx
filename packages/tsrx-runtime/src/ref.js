/** @import { MergeableRef, RefProp, RefValue, SpreadFalsy, SpreadProps } from '../types/ref' */

import {
	has_own_property,
	has_prototype_accessor,
	is_array,
	property_is_enumerable,
} from '@tsrx/runtime/language-helpers';

const REF_VALUE = Symbol();
const REINVOKE_REF = Symbol();
/** @type {SpreadProps} */
const EMPTY_SPREAD_PROPS = Object.freeze({});

/**
 * Merge multiple refs (function refs and ref objects) into a single
 * callback ref. Used by React, Preact, and Vue targets when an element has
 * more than one `ref` attribute.
 * This is a public method and also used by the compiler to unite any refs with
 * any of the supported syntaxes.  It does not process spreads, that is delegated to
 * `normalize_spread_props`.
 *
 * @template [T=Element]
 * @param {...MergeableRef<T>} refs
 * @returns {(node: T | null) => (() => void)}
 */
export function mergeRefs(...refs) {
	if (refs.length === 2) {
		return (node) => {
			const first = refs[0];
			const second = refs[1];
			// For `mergeRefs(a, b)`, apply both refs
			// directly and record each cleanup step in a scalar slot — a writable
			// key, `REINVOKE_REF` for a bare callback, or a returned cleanup —
			// instead of materializing a cleanups array per mount.
			/** @type {unknown} */
			let first_step;
			/** @type {unknown} */
			let second_step;
			if (first != null) {
				if (typeof first === 'function') {
					const result = first(node);
					if (typeof result === 'function') {
						first_step = result;
					} else {
						first_step = REINVOKE_REF;
					}
				} else {
					const key = ref_object_prop(first);
					// Named writes keep the monomorphic property ICs a keyed store
					// would lose.
					if (key === 'current') {
						/** @type {{ current: T | null }} */ (first).current = node;
						first_step = key;
					} else if (key === 'value') {
						/** @type {{ value: T | null }} */ (first).value = node;
						first_step = key;
					}
				}
			}
			// This block must stay identical to the `first` block above.
			if (second != null) {
				if (typeof second === 'function') {
					const result = second(node);
					if (typeof result === 'function') {
						second_step = result;
					} else {
						second_step = REINVOKE_REF;
					}
				} else {
					const key = ref_object_prop(second);
					if (key === 'current') {
						/** @type {{ current: T | null }} */ (second).current = node;
						second_step = key;
					} else if (key === 'value') {
						/** @type {{ value: T | null }} */ (second).value = node;
						second_step = key;
					}
				}
			}
			return () => {
				if (first_step === 'current') {
					/** @type {{ current: unknown }} */ (first).current = null;
				} else if (first_step === 'value') {
					/** @type {{ value: unknown }} */ (first).value = null;
				} else if (first_step === REINVOKE_REF) {
					/** @type {(node: null) => void} */ (first)(null);
				} else if (first_step !== undefined) {
					/** @type {() => void} */ (first_step)();
				}
				// This ladder must stay identical to the `first_step` ladder above.
				if (second_step === 'current') {
					/** @type {{ current: unknown }} */ (second).current = null;
				} else if (second_step === 'value') {
					/** @type {{ value: unknown }} */ (second).value = null;
				} else if (second_step === REINVOKE_REF) {
					/** @type {(node: null) => void} */ (second)(null);
				} else if (second_step !== undefined) {
					/** @type {() => void} */ (second_step)();
				}
			};
		};
	}
	return (node) => {
		/**
		 * Flat `[kind, payload]` pairs (kinds defined at `collect_ref_cleanups`):
		 * one array instead of a closure per ref.
		 * @type {unknown[]}
		 */
		const cleanups = [];
		for (const ref of refs) {
			if (ref == null) continue;
			if (typeof ref === 'function') {
				const result = ref(node);
				if (typeof result === 'function') {
					cleanups.push(0, result);
				} else {
					cleanups.push(1, ref);
				}
			} else {
				const ref_prop = ref_object_prop(ref);
				if (ref_prop === 'current') {
					/** @type {{ current: unknown }} */ (ref).current = node;
					cleanups.push(2, ref);
				} else if (ref_prop === 'value') {
					/** @type {{ value: unknown }} */ (ref).value = node;
					cleanups.push(3, ref);
				}
			}
		}
		return () => {
			// Replayed inline at all three sites on purpose: a shared helper
			// call measurably regressed this hot path — do not extract.
			for (let i = 0; i < cleanups.length; i += 2) {
				const kind = cleanups[i];
				const payload = /** @type {any} */ (cleanups[i + 1]);
				if (kind === 0) {
					payload();
				} else if (kind === 1) {
					payload(null);
				} else if (kind === 2) {
					payload.current = null;
				} else if (kind === 3) {
					payload.value = null;
				}
			}
		};
	};
}

export { is_ref_prop as isRefProp };

/**
 * A ref value that is a function is a callback ref — the bare-element branch of
 * `RefValue` is never callable.
 *
 * @template T
 * @param {RefValue<T>} value
 * @returns {value is (node: T | null) => void | (() => void)}
 */
function is_ref_callback(value) {
	return typeof value === 'function';
}

/**
 * @param {unknown} value
 * @returns {value is RefProp<Element>}
 */
function is_ref_prop(value) {
	return typeof value === 'function' && REF_VALUE in value;
}

/**
 * @template [T=Element]
 * @param {RefValue<T>} ref_value
 * @param {T | null} node
 * @param {(value: T | null) => void} [set_ref_value]
 * @returns {void | (() => void)}
 */
export function apply_ref_value(ref_value, node, set_ref_value) {
	if (is_array(ref_value)) {
		return apply_ref_array(ref_value, node);
	}

	if (is_ref_callback(ref_value)) {
		return ref_value(node);
	}

	if (ref_value && typeof ref_value === 'object') {
		const ref_prop = ref_object_prop(ref_value);
		if (ref_prop === 'current') {
			/** @type {{ current: unknown }} */ (ref_value).current = node;
			return () => {
				/** @type {{ current: unknown }} */ (ref_value).current = null;
			};
		}

		if (ref_prop === 'value') {
			/** @type {{ value: unknown }} */ (ref_value).value = node;
			return () => {
				/** @type {{ value: unknown }} */ (ref_value).value = null;
			};
		}
	}

	if (set_ref_value !== undefined) {
		set_ref_value(node);
	}
}

/**
 * Flat `[kind, payload]` pairs, same scheme as `collect_ref_cleanups`.
 *
 * @template [T=Element]
 * @param {RefValue<T>[]} ref_values
 * @param {T | null} node
 * @returns {void | (() => void)}
 */
function apply_ref_array(ref_values, node) {
	/** @type {unknown[]} */
	const cleanups = [];
	for (const item of ref_values) {
		collect_ref_cleanups(item, node, cleanups);
	}
	if (cleanups.length > 0) {
		return () => {
			// Replayed inline at all three sites on purpose: a shared helper
			// call measurably regressed this hot path — do not extract.
			for (let i = 0; i < cleanups.length; i += 2) {
				const kind = cleanups[i];
				const payload = /** @type {any} */ (cleanups[i + 1]);
				if (kind === 0) {
					payload();
				} else if (kind === 1) {
					payload(null);
				} else if (kind === 2) {
					payload.current = null;
				} else if (kind === 3) {
					payload.value = null;
				}
			}
		};
	}
}

/**
 * @template [T=Element]
 * @param {() => RefValue<T>} get_ref_value
 * @param {(value: T | null) => void} [set_ref_value]
 * @returns {RefProp<T>}
 */
export function create_ref_prop(get_ref_value, set_ref_value) {
	/**
	 * @param {T | null} node
	 * @returns {void | (() => void)}
	 */
	function ref_prop_callback(node) {
		const ref_value = get_ref_value();
		const cleanup = apply_ref_value(ref_value, node, set_ref_value);
		if (typeof cleanup === 'function' || node === null) {
			return cleanup;
		}
		return () => {
			apply_ref_value(ref_value, null, set_ref_value);
		};
	}

	Object.defineProperty(ref_prop_callback, REF_VALUE, {
		value: 'ref_value',
		enumerable: false,
	});

	return ref_prop_callback;
}

/**
 * @template [T=Element]
 * @param {...RefValue<T>} refs
 * @returns {RefValue<T>} the single surviving ref, or a callback applying all
 */
export function merge_ref_props(...refs) {
	return merge_ref_list(refs);
}

/**
 * Merge an already-collected ref list into a single callback ref. The list is
 * compacted in place and captured by the returned callback, so callers must
 * pass an array they own — `merge_ref_props`' rest array, or a list assembled
 * internally for the same purpose.
 *
 * @template [T=Element]
 * @param {RefValue<T>[]} refs
 * @param {boolean} [merge_lone_object] read nested lists as their refs, and
 *   merge a lone ref object as well, so only a lone callback comes back as itself
 * @returns {RefValue<T>} the single surviving ref, or a callback applying all
 */
function merge_ref_list(refs, merge_lone_object = false) {
	if (merge_lone_object) {
		/** @type {RefValue<T>[]} */
		const live = [];
		collect_live_refs(refs, live);
		return live.length === 1 && typeof live[0] === 'object'
			? create_merged_ref(live)
			: merge_ref_list(live);
	}
	if (refs.length <= 2) {
		const first = refs[0];
		const second = refs[1];
		if (first == null) {
			return second ?? undefined;
		}
		if (second == null) {
			return first;
		}
	} else {
		let count = 0;
		for (let index = 0; index < refs.length; index++) {
			const ref = refs[index];
			if (ref != null) {
				if (count !== index) {
					refs[count] = ref;
				}
				count++;
			}
		}
		if (count === 0) {
			return undefined;
		}
		if (count === 1) {
			return refs[0];
		}
		if (count !== refs.length) {
			refs.length = count;
		}
	}

	return create_merged_ref(refs);
}

/**
 * A callback that applies each ref of a compacted list and returns a cleanup
 * that clears them in the same order. It captures the list.
 *
 * @template [T=Element]
 * @param {RefValue<T>[]} refs
 * @returns {(node: T | null) => void | (() => void)}
 */
function create_merged_ref(refs) {
	/**
	 * @param {T | null} node
	 * @returns {void | (() => void)}
	 */
	function merged_ref_prop(node) {
		/**
		 * Flat `[kind, payload]` pairs: one array instead of a closure per ref.
		 * @type {unknown[]}
		 */
		const cleanups = [];

		for (const ref of refs) {
			collect_ref_cleanups(ref, node, cleanups);
		}

		return () => {
			// Replayed inline at all three sites on purpose: a shared helper
			// call measurably regressed this hot path — do not extract.
			for (let i = 0; i < cleanups.length; i += 2) {
				const kind = cleanups[i];
				const payload = /** @type {any} */ (cleanups[i + 1]);
				if (kind === 0) {
					payload();
				} else if (kind === 1) {
					payload(null);
				} else if (kind === 2) {
					payload.current = null;
				} else if (kind === 3) {
					payload.value = null;
				}
			}
		};
	}

	return merged_ref_prop;
}

/**
 * @typedef {{
 *   next: WeakMap<object, MergedRefEntry> | undefined,
 *   ref: RefValue<any> | undefined,
 * }} MergedRefEntry
 */

/**
 * `merge_element_refs` callbacks by their refs, one level per ref.
 * @type {MergedRefEntry}
 */
const merged_element_refs = { next: undefined, ref: undefined };

/**
 * Merge the refs of one compiled element into its `ref`. A single ref comes back
 * as itself, and the same refs give back the same callback, so a JSX runtime
 * that applies a `ref` again whenever its identity changes applies them once
 * rather than on every render. A ref list counts as the refs in it, so an
 * inline `[a, b]` written each render gives back the same callback too.
 *
 * Every element given the same refs shares the callback, so only a runtime
 * that keeps a ref's cleanup per element can use it (React, Hono): Preact
 * stores the cleanup on the function, where another element's would replace
 * it.
 *
 * @template [T=Element]
 * @param {...RefValue<T>} refs
 * @returns {RefValue<T>}
 */
export function merge_element_refs(...refs) {
	return merge_shared_ref_list(refs);
}

/**
 * `merge_element_refs` for a ref list the caller has already collected.
 *
 * @template [T=Element]
 * @param {RefValue<T>[]} refs
 * @param {boolean} [merge_lone_object] merge a lone ref object as well, so
 *   only a lone callback comes back as itself
 * @returns {RefValue<T>}
 */
function merge_shared_ref_list(refs, merge_lone_object = false) {
	/** @type {RefValue<T>[]} */
	const live = [];
	collect_live_refs(refs, live);
	if (live.length < 2 && !(merge_lone_object && typeof live[0] === 'object')) {
		return live[0];
	}

	let entry = merged_element_refs;
	for (const ref of live) {
		const next = (entry.next ??= new WeakMap());
		let child = next.get(/** @type {object} */ (ref));
		if (child === undefined) {
			child = { next: undefined, ref: undefined };
			next.set(/** @type {object} */ (ref), child);
		}
		entry = child;
	}
	return (entry.ref ??= create_merged_ref(live));
}

/**
 * Collect the refs of a list, and of the lists in it, so the cache keys an
 * inline `ref: [a, b]` by `a` and `b` rather than by a new array each render.
 * Only a function or an object is a ref; `ref={cond && cb}` may be `false`.
 *
 * @template T
 * @param {readonly RefValue<T>[]} refs
 * @param {RefValue<T>[]} live
 * @returns {void}
 */
function collect_live_refs(refs, live) {
	for (const ref of refs) {
		if (is_array(ref)) {
			collect_live_refs(ref, live);
		} else if (typeof ref === 'function' || (typeof ref === 'object' && ref !== null)) {
			live.push(ref);
		}
	}
}

/**
 * Collect ref cleanups as flat `[kind, payload]` pairs, matching
 * `apply_ref_value`'s observable behavior for every ref shape: kind 0 is a
 * cleanup a callback ref returned, kind 1 a callback ref to re-invoke with
 * `null`, kind 2/3 ref objects whose `current`/`value` is nulled.
 *
 * @template [T=Element]
 * @param {RefValue<T>} ref_value
 * @param {T | null} node
 * @param {unknown[]} cleanups
 * @returns {void}
 */
function collect_ref_cleanups(ref_value, node, cleanups) {
	if (is_array(ref_value)) {
		for (const item of ref_value) {
			collect_ref_cleanups(item, node, cleanups);
		}
		return;
	}

	if (is_ref_callback(ref_value)) {
		const result = ref_value(node);
		if (typeof result === 'function') {
			cleanups.push(0, result);
		} else if (node !== null) {
			cleanups.push(1, ref_value);
		}
		return;
	}

	if (ref_value && typeof ref_value === 'object') {
		const ref_prop = ref_object_prop(ref_value);
		if (ref_prop === 'current') {
			/** @type {{ current: unknown }} */ (ref_value).current = node;
			cleanups.push(2, ref_value);
			return;
		}
		if (ref_prop === 'value') {
			/** @type {{ value: unknown }} */ (ref_value).value = node;
			cleanups.push(3, ref_value);
		}
	}
}

/**
 * Collect a spread's refs into one `ref`. A bag with no refs to merge comes back
 * as itself, so a JSX runtime that reads a spread lazily, property by property
 * (Solid's), keeps reading the original bag. That includes a bag whose only ref
 * is a ref list, which Solid applies itself.
 *
 * @param {object | SpreadFalsy} props a props bag, or the falsy value of a
 *   conditional spread such as `{...(enabled && { disabled: true })}`; `object`
 *   rather than an index signature so an interface-typed bag is accepted
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | SpreadFalsy}
 */
export function normalize_spread_props(props, ...outer_refs) {
	return normalize_spread(props, outer_refs, false, merge_ref_list, false);
}

/**
 * `normalize_spread_props` for a JSX runtime that copies the result where it is
 * spread, as `jsx()` and `createElement` do. It returns the normalized copy even
 * when the bag has no refs to merge, so the bag's getters are read once.
 *
 * @param {object | SpreadFalsy} props
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | SpreadFalsy}
 */
export function copy_spread_props(props, ...outer_refs) {
	return normalize_spread(props, outer_refs, true, merge_ref_list, true);
}

/**
 * `copy_spread_props` that merges a bag's refs as `merge_element_refs` does, so
 * a new bag with the same refs gets the same `ref` and a JSX runtime that
 * applies a `ref` again whenever its identity changes leaves it applied. As
 * with `merge_element_refs`, only a runtime that keeps a ref's cleanup per
 * element can use it (React, Hono).
 *
 * @param {object | SpreadFalsy} props
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | SpreadFalsy}
 */
export function copy_spread_props_sharing_refs(props, ...outer_refs) {
	return normalize_spread(props, outer_refs, true, merge_shared_ref_list, true);
}

/**
 * @param {object | SpreadFalsy} props
 * @param {Array<RefValue<Element>>} outer_refs a rest array owned by the caller
 * @param {boolean} copy return the normalized copy even with nothing to merge
 * @param {(refs: RefValue<Element>[], merge_lone_object?: boolean) => RefValue<Element>} merge
 *   merges an owned list of the bag's refs into one
 * @param {boolean} merge_ref_lists merge a `ref` that is a ref list even when
 *   it is the bag's only ref, for a JSX runtime that takes a single ref
 * @returns {SpreadProps | SpreadFalsy}
 */
function normalize_spread(props, outer_refs, copy, merge, merge_ref_lists) {
	// A non-object carries no refs to collect. Returning it unchanged leaves the
	// spread to treat it exactly as a native JSX spread would.
	if (props === null || (typeof props !== 'object' && typeof props !== 'function')) {
		return props;
	}

	const source = /** @type {SpreadProps} */ (props);
	/** @type {Array<RefValue<Element>> | undefined} */
	let refs;
	/** @type {SpreadProps} */
	const next = {};
	let existing_ref;
	let has_existing_ref = false;

	const keys = Reflect.ownKeys(source);
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		if (!property_is_enumerable.call(source, key)) {
			continue;
		}

		const value = source[key];

		if (key === 'ref') {
			if (is_ref_prop(value)) {
				if (refs === undefined) {
					refs = [value];
				} else {
					refs.push(value);
				}
			} else {
				existing_ref = /** @type {RefValue<Element>} */ (value);
				has_existing_ref = true;
			}
			continue;
		}

		if (is_ref_prop(value)) {
			if (refs === undefined) {
				refs = [value];
			} else {
				refs.push(value);
			}
			continue;
		}

		next[key] = value;
	}

	const merges_ref_list = merge_ref_lists && is_array(existing_ref);
	if (refs === undefined && outer_refs.length === 0 && !merges_ref_list) {
		if (!copy) {
			return source;
		}
		// Even `ref: undefined` is kept: a later spread's own `ref` key replaces
		// an earlier spread's ref, as in native JSX.
		if (has_existing_ref) {
			next.ref = existing_ref;
		}
		return next;
	}

	let merged_ref;
	if (refs === undefined) {
		// `outer_refs` is a fresh rest array owned by the caller; unshifting
		// `existing_ref` into place avoids a second concatenated array.
		if (existing_ref != null) {
			outer_refs.unshift(existing_ref);
		}
		// A list's lone ref object is merged too, since a JSX runtime reads a bare
		// ref object as its own kind: React sets `current` on a `{ value }` ref,
		// and Vue ignores a plain one.
		merged_ref = merge(outer_refs, merges_ref_list);
	} else if (existing_ref == null && outer_refs.length === 0) {
		// A single collected ref survives unchanged without merge machinery.
		// `refs` holds only `is_ref_prop`-verified non-null entries, so a lone
		// entry can be returned directly instead of routing through
		// `merge`'s filtering.
		merged_ref = refs.length === 1 ? refs[0] : merge(refs);
	} else {
		if (existing_ref != null) {
			refs.unshift(existing_ref);
		}
		if (outer_refs.length !== 0) {
			refs.push(...outer_refs);
		}
		merged_ref = merge(refs);
	}
	// An empty list still replaces an earlier spread's ref, as its `ref` key
	// would in native JSX.
	if (merged_ref !== undefined || merges_ref_list) {
		next.ref = merged_ref;
	}

	return next;
}

/**
 * Normalize spread props for targets that read refs through an explicit
 * `ref={normalized.ref}` attribute. The returned `ref` stays readable for that
 * attribute but is non-enumerable so `{...normalized}` does not also pass it as
 * a DOM prop.
 *
 * @param {object | SpreadFalsy} props
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | Exclude<SpreadFalsy, null | undefined | void>}
 */
export function normalize_spread_props_for_ref_attr(props, ...outer_refs) {
	return hide_spread_ref(normalize_spread(props, outer_refs, false, merge_ref_list, true));
}

/**
 * `normalize_spread_props_for_ref_attr` for a JSX runtime that copies the
 * result where it is spread; see `copy_spread_props`.
 *
 * @param {object | SpreadFalsy} props
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | Exclude<SpreadFalsy, null | undefined | void>}
 */
export function copy_spread_props_for_ref_attr(props, ...outer_refs) {
	return hide_spread_ref(normalize_spread(props, outer_refs, true, merge_ref_list, true));
}

/**
 * `copy_spread_props_for_ref_attr` that merges a bag's refs as
 * `merge_element_refs` does; see `copy_spread_props_sharing_refs`.
 *
 * @param {object | SpreadFalsy} props
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | Exclude<SpreadFalsy, null | undefined | void>}
 */
export function copy_spread_props_for_ref_attr_sharing_refs(props, ...outer_refs) {
	return hide_spread_ref(normalize_spread(props, outer_refs, true, merge_shared_ref_list, true));
}

/**
 * @param {SpreadProps | SpreadFalsy} next
 * @returns {SpreadProps | Exclude<SpreadFalsy, null | undefined | void>}
 */
function hide_spread_ref(next) {
	// The compiler reads `normalized.ref` for the ref attribute, which throws on
	// a nullish spread; an empty bag spreads to nothing just the same. Other
	// primitives read `ref` as `undefined` and pass through.
	if (next == null) {
		return EMPTY_SPREAD_PROPS;
	}
	if (!has_own_property.call(next, 'ref')) {
		return next;
	}

	// A primitive never has an own `ref`, so this is a props bag.
	const bag = /** @type {SpreadProps} */ (next);
	const ref = bag.ref;
	const without_ref = { ...bag };
	delete without_ref.ref;
	Object.defineProperty(without_ref, 'ref', {
		value: ref,
		enumerable: false,
		configurable: true,
		writable: true,
	});
	return without_ref;
}

/**
 * Classify a non-function ref value in one pass so `is_dom_node` runs once per
 * value. `current` wins over `value`.
 *
 * @param {object} value
 * @returns {'current' | 'value' | null}
 */
function ref_object_prop(value) {
	if (is_dom_node(value)) {
		return null;
	}
	if (has_own_property.call(value, 'current')) {
		return 'current';
	}
	if (
		'__v_isRef' in value ||
		has_own_property.call(value, 'value') ||
		has_prototype_accessor(value, 'value')
	) {
		return 'value';
	}
	return null;
}

/**
 * @param {object} value
 * @returns {boolean}
 */
function is_dom_node(value) {
	return (
		(typeof Node !== 'undefined' && value instanceof Node) ||
		('nodeType' in value &&
			typeof (/** @type {{ nodeType?: unknown }} */ (value).nodeType) === 'number' &&
			'nodeName' in value &&
			typeof (/** @type {{ nodeName?: unknown }} */ (value).nodeName) === 'string')
	);
}
