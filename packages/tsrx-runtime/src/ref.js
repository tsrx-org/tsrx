/** @import { ClassValueKind, MergeableRef, RefProp, RefValue, SpreadFalsy, SpreadProps } from '../types/ref' */

import {
	define_property,
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
 * @param {object | SpreadFalsy} props a props bag, or the falsy value of a
 *   conditional spread such as `{...(enabled && { disabled: true })}`; `object`
 *   rather than an index signature so an interface-typed bag is accepted
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | SpreadFalsy}
 */
export function normalize_spread_props(props, ...outer_refs) {
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
 * @param {object | SpreadFalsy} props
 * @param {...RefValue<Element>} outer_refs
 * @returns {SpreadProps | Exclude<SpreadFalsy, null | undefined | void>}
 */
export function normalize_spread_props_for_ref_attr(props, ...outer_refs) {
	const next = normalize_spread_props(props, ...outer_refs);
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

/**
 * Join the class a host spread passes an element with the scope classes TSRX
 * adds to it. The compiler wraps each spread written after the element's
 * class attribute, so the spread's class replaces the authored one, as in
 * plain JSX, and the scope classes stay. A bag without a class comes back as
 * itself, leaving the class attribute to apply. Otherwise the copy reads the
 * bag through getters, so a JSX runtime that reads a spread lazily (Solid's)
 * still tracks each prop, and the bag is never written to. The copy's class
 * prop comes after the bag's other props.
 *
 * @param {object | SpreadFalsy} props
 * @param {unknown} scope_class the element's scope hashes and applied classes,
 *   or `null` for a spread written before the class attribute: the copy then
 *   leaves out the bag's class so that the attribute applies
 * @param {string} key the class prop the copy carries
 * @param {string} [alias] another prop the target reads a class from, such as
 *   `className` beside Preact's `class`; its class moves to `key` so the
 *   element keeps one class prop
 * @param {ClassValueKind} [kind='text'] how the target renders a class value;
 *   see `join_scope_class`
 * @returns {object | SpreadFalsy}
 */
export function merge_spread_class(props, scope_class, key, alias, kind = 'text') {
	if (props === null || (typeof props !== 'object' && typeof props !== 'function')) {
		return props;
	}

	const source = /** @type {SpreadProps} */ (props);
	const keys = Reflect.ownKeys(source);
	/** @type {PropertyKey[]} */
	const class_keys = [];
	for (let i = 0; i < keys.length; i++) {
		const name = keys[i];
		if ((name === key || name === alias) && property_is_enumerable.call(source, name)) {
			class_keys.push(name);
		}
	}
	if (class_keys.length === 0) {
		return props;
	}

	/** @type {SpreadProps} */
	const next = {};
	for (let i = 0; i < keys.length; i++) {
		const name = keys[i];
		if (name === key || name === alias || !property_is_enumerable.call(source, name)) {
			continue;
		}
		define_property(next, name, {
			enumerable: true,
			configurable: true,
			get: () => source[name],
		});
	}
	if (scope_class !== null) {
		define_property(next, key, {
			enumerable: true,
			configurable: true,
			get: () => join_class(read_class(source, class_keys), scope_class, kind),
		});
	}
	return next;
}

/**
 * Join an element's authored class with the scope classes TSRX adds to it, the
 * way the runtime renders that class. A class the runtime would leave out
 * gives just the scope classes. `kind` names how the runtime renders it:
 *
 * - `'text'` (React, Hono DOM): `null`, `undefined`, `false`, `true` and an
 *   empty class are left out; any other value renders as text.
 * - `'text-true'` (Preact): as `'text'`, except that `true` renders as text.
 * - `'text-both'` (Hono's server): as `'text'`, except that `true` and
 *   `false` render as text.
 * - `'list'` (Solid, Vue): the class also takes an object or a list, which
 *   joins as `[class, scope_class]`; any other value that is not a string is
 *   left out.
 *
 * A thenable class (Hono's server `css`) applies unchanged.
 *
 * @param {unknown} value the authored class
 * @param {unknown} scope_class the element's scope hashes and applied classes
 * @param {ClassValueKind} [kind='text']
 * @returns {unknown}
 */
export function join_scope_class(value, scope_class, kind = 'text') {
	return join_class(value, scope_class, kind);
}

/**
 * Of a bag's class props, the last one with a value, as a runtime that reads
 * either renders it.
 *
 * @param {SpreadProps} source
 * @param {PropertyKey[]} class_keys
 * @returns {unknown}
 */
function read_class(source, class_keys) {
	for (let i = class_keys.length - 1; i >= 0; i--) {
		const value = source[class_keys[i]];
		if (value != null) {
			return value;
		}
	}
	return undefined;
}

/**
 * @param {unknown} value
 * @param {unknown} scope_class
 * @param {ClassValueKind} kind
 * @returns {unknown}
 */
function join_class(value, scope_class, kind) {
	if (value == null || value === '') {
		return scope_class;
	}
	if (typeof value === 'boolean') {
		return kind === 'text-both' || (value && kind === 'text-true')
			? `${value} ${scope_class}`
			: scope_class;
	}
	if (kind === 'list' && typeof value !== 'string') {
		return typeof value === 'object' ? [value, scope_class] : scope_class;
	}
	// A thenable class, such as the promise Hono's server `css` returns, applies
	// as the runtime resolves it. Any other value joins as text, as it would in
	// the class attribute.
	if (
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (/** @type {{ then?: unknown }} */ (value).then) === 'function'
	) {
		return value;
	}
	return `${value} ${scope_class}`;
}
