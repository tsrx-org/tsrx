/** @import { MergeableRef, RefProp, RefValue, SpreadProps } from '../types/ref' */

import {
	has_own_property,
	has_prototype_accessor,
	is_array,
	property_is_enumerable,
} from '@tsrx/runtime/language-helpers';

const REF_VALUE = Symbol();

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
 * @returns {RefValue<T>} the single surviving ref, or a callback applying all
 */
function merge_ref_list(refs) {
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
 * @param {object | null | undefined} props a props bag; `object` rather than an
 *   index signature so an interface-typed bag is accepted
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | null | undefined}
 */
export function normalize_spread_props(props, ...outer_refs) {
	if (props == null) {
		return props;
	}

	const source = /** @type {SpreadProps} */ (props);
	/** @type {Array<RefValue<Element>> | undefined} */
	let refs;
	/** @type {SpreadProps} */
	const next = {};
	let existing_ref;

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

	if (refs === undefined && outer_refs.length === 0) {
		return source;
	}

	let merged_ref;
	if (refs === undefined) {
		// `outer_refs` is a fresh rest array owned by this call; unshifting
		// `existing_ref` into place avoids a second concatenated array.
		if (existing_ref != null) {
			outer_refs.unshift(existing_ref);
		}
		merged_ref = merge_ref_list(outer_refs);
	} else if (existing_ref == null && outer_refs.length === 0) {
		// A single collected ref survives unchanged without merge machinery.
		// `refs` holds only `is_ref_prop`-verified non-null entries, so a lone
		// entry can be returned directly instead of routing through
		// `merge_ref_list`'s nullish filtering.
		merged_ref = refs.length === 1 ? refs[0] : merge_ref_list(refs);
	} else {
		if (existing_ref != null) {
			refs.unshift(existing_ref);
		}
		if (outer_refs.length !== 0) {
			refs.push(...outer_refs);
		}
		merged_ref = merge_ref_list(refs);
	}
	if (merged_ref !== undefined) {
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
 * @param {object | null | undefined} props
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | null | undefined}
 */
export function normalize_spread_props_for_ref_attr(props, ...outer_refs) {
	const next = normalize_spread_props(props, ...outer_refs);
	if (next == null || !has_own_property.call(next, 'ref')) {
		return next;
	}

	const ref = next.ref;
	const without_ref = { ...next };
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
