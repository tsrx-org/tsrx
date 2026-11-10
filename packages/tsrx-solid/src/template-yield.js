/** @import * as AST from 'estree' */
/** @import * as ESTreeJSX from 'estree-jsx' */

import { isFunctionNode } from '@tsrx/core';

const AST_METADATA_KEYS = new Set(['loc', 'start', 'end', 'metadata']);

/**
 * The `yield`s that babel-preset-solid moves out of their generator, read
 * from the output it compiles. Its JSX compiler (dom-expressions):
 *
 * - creates an element returned or assigned as a whole, and the elements
 *   nested in it, in the function itself, but any other element in an
 *   immediately called arrow;
 * - evaluates a dynamic value (one with a member access, a call, a spread or
 *   `in`) in an effect, an inserted arrow, or a prop getter, and a static one
 *   in place;
 * - evaluates `class` and `style` in an effect unless the value is an object
 *   literal, an array `ref` in an arrow, and event handlers and other refs in
 *   place;
 * - applies an assignable component `ref` in a callback, creates a component
 *   whose `ref` is a call in an immediately called arrow, and passes on or
 *   drops any other `ref`;
 * - reads TypeScript as written, so an element or value behind `as`,
 *   `satisfies` or `!` is just an expression to it;
 * - passes every attribute of a host element with a spread, but `ref`, as a
 *   prop of the spread: a dynamic one in a getter, any other in place;
 * - sets a `<select>`'s value in a microtask as well as in place;
 * - first folds a host attribute value, or a value in an object there, into a
 *   literal when it evaluates to a string, number or boolean, and a host
 *   child into text when it evaluates to a string or number, dropping any
 *   `yield` in a branch that never runs, as in `false && (yield x)`;
 * - passes component children in a getter when there are several, or one is
 *   an element or a dynamic value.
 *
 * A `yield` there no longer runs in its generator and fails to parse, so only
 * those are returned. One the compiler leaves in place is left alone.
 *
 * These rules follow @dom-expressions/babel-plugin-jsx 0.50.0-next.44, from
 * babel-preset-solid 2.0.0-rc.2 and vite-plugin-solid 3.0.0-next.5.
 * `packages/vite-plugin-solid/tests/template-yield-downstream.test.js` runs
 * probes through the installed compiler, so a release that compiles them
 * differently fails there.
 *
 * @param {AST.Program} program
 * @returns {AST.YieldExpression[]}
 */
export function find_deferred_template_yields(program) {
	/** @type {AST.YieldExpression[]} */
	const found = [];
	const namespaces = collect_namespace_imports(program);
	const folded = collect_folded_yields(program);

	/**
	 * @typedef {{ generator: boolean, deferred: boolean }} Context
	 */

	/**
	 * An expression, with the JSX in it.
	 *
	 * @param {AST.Node} node
	 * @param {Context} context
	 */
	const visit = (node, context) => {
		if (isFunctionNode(node)) {
			context = { generator: !!node.generator, deferred: false };
		} else if (node.type === 'YieldExpression') {
			if (context.generator && context.deferred && !folded.has(node)) found.push(node);
		} else if (node.type === 'ReturnStatement' || node.type === 'VariableDeclarator') {
			const value = node.type === 'ReturnStatement' ? node.argument : node.init;
			const element = strip(value, []);
			if (element?.type === 'JSXElement') {
				for_each_child(node, (child) =>
					child === value ? visit_element(element, context, true) : visit(child, context),
				);
				return;
			}
		} else if (node.type === 'JSXElement') {
			visit_element(node, context, false);
			return;
		} else if (node.type === 'JSXFragment') {
			visit_fragment(node, context);
			return;
		}
		for_each_child(node, (child) => visit(child, context));
	};

	/**
	 * @param {AST.Node | null | undefined} node
	 * @param {Context} context
	 * @param {boolean} deferred
	 */
	const visit_value = (node, context, deferred) => {
		if (node) visit(node, deferred ? { ...context, deferred } : context);
	};

	/**
	 * @param {ESTreeJSX.JSXElement | AST.TSRXJSXElement} element
	 * @param {Context} context
	 * @param {boolean} inline whether the compiler creates it in place
	 */
	const visit_element = (element, context, inline) => {
		const opening = element.openingElement;
		if (is_component_name(opening.name)) {
			visit_component(element, context);
			return;
		}
		// The compiler creates any other host element in an immediately called
		// arrow, with everything it keeps, but not what it drops.
		if (!inline) context = { ...context, deferred: true };

		const tag = host_tag_name(opening.name);
		const spread = opening.attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute');
		const names = dom_attribute_names(tag, opening.attributes);
		// It writes no children for a void element or a `noscript`, and a
		// textarea's literal value (named `''`) replaces them.
		const childless =
			VOID_ELEMENTS.has(tag) ||
			tag === 'noscript' ||
			opening.attributes.some((attribute) => names.get(attribute) === '');
		for (const [index, attribute] of opening.attributes.entries()) {
			if (attribute.type === 'JSXSpreadAttribute') {
				visit_value(attribute.argument, context, is_dynamic(attribute.argument, false, namespaces));
				continue;
			}
			// Without a spread, the compiler keeps only the last attribute of a
			// name, but every `ref`, after it renames stateful properties.
			const key = names.get(attribute);
			if (
				!spread &&
				key !== 'ref' &&
				opening.attributes.slice(index + 1).some((other) => names.get(other) === key)
			) {
				continue;
			}
			// Without a spread, a `children` attribute is dropped when the element
			// has children of its own, or writes none.
			if (!spread && key === 'children' && (element.children.length > 0 || childless)) {
				continue;
			}
			const value = attribute.value;
			if (value?.type !== 'JSXExpressionContainer') {
				if (value) visit_value(value, context, false);
				continue;
			}
			const expression = /** @type {AST.Expression} */ (value.expression);
			const name = attribute_name(attribute.name);
			const parts = spread
				? undefined
				: (split_class_or_style(name, expression, namespaces) ??
					split_event_handler(name, expression));
			if (parts) {
				for (const [part, deferred] of parts) {
					if (deferred !== 'dropped') visit_value(part, context, deferred);
				}
				continue;
			}
			visit_value(
				expression,
				context,
				// Beside a spread, every attribute but `ref` is a prop of the spread.
				spread && name !== 'ref'
					? is_folded_dynamic(expression, namespaces)
					: is_host_attribute_deferred(name, expression, namespaces, tag),
			);
		}

		for (const child of childless ? [] : element.children) {
			if (child.type === 'JSXElement') {
				// A child element is created from the same template, in place.
				visit_element(child, context, true);
			} else if (child.type === 'JSXExpressionContainer') {
				const expression = /** @type {AST.Expression} */ (child.expression);
				visit_value(expression, context, is_dynamic(expression, false, namespaces));
			} else if (child.type === 'JSXSpreadChild') {
				visit_value(child.expression, context, is_dynamic(child.expression, false, namespaces));
			} else if (child.type === 'JSXFragment') {
				visit_fragment(child, context);
			}
		}
	};

	/**
	 * @param {ESTreeJSX.JSXElement | AST.TSRXJSXElement} element
	 * @param {Context} context
	 */
	const visit_component = (element, context) => {
		// A ref call is evaluated first, in an immediately called arrow around
		// the whole component.
		if (
			element.openingElement.attributes.some(
				(attribute) =>
					attribute.type === 'JSXAttribute' &&
					attribute_name(attribute.name) === 'ref' &&
					attribute.value?.type === 'JSXExpressionContainer' &&
					strip(attribute.value.expression, COMPONENT_REF_WRAPPERS)?.type === 'CallExpression',
			)
		) {
			context = { ...context, deferred: true };
		}

		for (const attribute of element.openingElement.attributes) {
			if (attribute.type === 'JSXSpreadAttribute') {
				visit_value(attribute.argument, context, is_dynamic(attribute.argument, false, namespaces));
				continue;
			}
			const value = attribute.value;
			if (!value) continue;
			if (value.type !== 'JSXExpressionContainer') {
				visit_value(value, context, value.type === 'JSXElement' || value.type === 'JSXFragment');
				continue;
			}
			const expression = /** @type {AST.Expression} */ (value.expression);
			if (attribute_name(attribute.name) === 'ref') {
				// An assignable ref is applied in a callback, an array is passed on,
				// a call is evaluated as above, and any other value is dropped.
				const ref = strip(expression, COMPONENT_REF_WRAPPERS)?.type;
				if (ref === 'MemberExpression') visit_value(expression, context, true);
				else if (ref === 'ArrayExpression' || ref === 'CallExpression') {
					visit_value(expression, context, false);
				}
				continue;
			}
			visit_value(expression, context, is_dynamic(expression, true, namespaces));
		}

		const children = element.children.filter(
			(child) =>
				!(child.type === 'JSXText' && /^\s*$/.test(child.value) && /[\r\n]/.test(child.value)) &&
				!(
					child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression'
				),
		);
		// Several children, an element, or a dynamic value are passed in a getter.
		const getter =
			children.length > 1 ||
			children.some(
				(child) =>
					child.type === 'JSXElement' ||
					child.type === 'JSXFragment' ||
					((child.type === 'JSXExpressionContainer' || child.type === 'JSXSpreadChild') &&
						is_dynamic(/** @type {AST.Expression} */ (child.expression), true, namespaces)),
			);
		for (const child of children) visit_value(child, context, getter);
	};

	/**
	 * @param {ESTreeJSX.JSXFragment | AST.TSRXJSXFragment} fragment
	 * @param {Context} context
	 */
	const visit_fragment = (fragment, context) => {
		if (context.deferred) {
			visit_all(fragment, context);
			return;
		}
		for (const child of fragment.children) {
			if (child.type === 'JSXElement') {
				visit_element(child, context, false);
			} else if (child.type === 'JSXExpressionContainer' || child.type === 'JSXSpreadChild') {
				const expression = /** @type {AST.Expression} */ (child.expression);
				visit_value(expression, context, is_dynamic(expression, false, namespaces));
			} else if (child.type === 'JSXFragment') {
				visit_fragment(child, context);
			}
		}
	};

	/**
	 * @param {AST.Node} node
	 * @param {Context} context
	 */
	const visit_all = (node, context) => for_each_child(node, (child) => visit(child, context));

	visit(program, { generator: false, deferred: false });
	return found;
}

/**
 * Whether dom-expressions evaluates a host element's attribute value outside
 * the element's own code, when the element has no spread.
 *
 * @param {string} name
 * @param {AST.Expression} value
 * @param {Set<string>} namespaces
 * @param {string} tag the element's tag, as written
 * @returns {boolean}
 */
function is_host_attribute_deferred(name, value, namespaces, tag) {
	if (name === 'ref') return strip(value, HOST_REF_WRAPPERS)?.type === 'ArrayExpression';
	const expression = strip(value, []);
	if (name.startsWith('on')) return false;
	// A `<select>`'s value, unless it's a literal, is assigned in a microtask
	// as well as in place.
	if (tag === 'select' && (name === 'value' || name === 'prop:value')) {
		return expression?.type !== 'Literal';
	}
	// A `class` or `style` value that isn't an object the compiler splits is
	// set in an effect unless it folds into a constant.
	if (name === 'class' || name === 'style')
		return is_folded_dynamic(value, namespaces) || !literal_value(value);
	return is_folded_dynamic(value, namespaces);
}

/**
 * How dom-expressions compiles a `[handler, data]` array on an event it
 * doesn't delegate, or `undefined` for any other value: it calls the handler
 * with the data inside a new listener and drops any later element.
 *
 * @param {string} name
 * @param {AST.Expression} value
 * @returns {SplitValue | undefined}
 */
function split_event_handler(name, value) {
	const expression = strip(value, []);
	if (
		!name.startsWith('on') ||
		DELEGATED_EVENTS.has(name.slice(2).toLowerCase()) ||
		expression?.type !== 'ArrayExpression' ||
		expression.elements.length < 2
	) {
		return undefined;
	}
	// The compiler throws on a hole or a spread handler, or a hole for data.
	const [handler, data] = expression.elements;
	if (!handler || handler.type === 'SpreadElement' || !data) return undefined;
	return expression.elements.flatMap((element, index) =>
		element
			? [/** @type {[AST.Node, boolean | 'dropped']} */ ([element, index < 2 || 'dropped'])]
			: [],
	);
}

/**
 * @typedef {Array<[AST.Node, boolean | 'dropped']>} SplitValue
 * The parts of a value, each moved out of the element's code, left in place,
 * or dropped.
 */

/**
 * How dom-expressions compiles a `class` or `style` object on a host element
 * without a spread, or `undefined` for any other value. It splits a `class`
 * object (and a fixed `['static', { … }]` array) into one attribute per key,
 * unless a key is computed or holds a space or colon, and drops a key whose
 * value it can evaluate; a method or accessor keeps the whole object as well,
 * set in an effect. It inlines a `style` key whose value is a string or number,
 * drops one that is `null` or `undefined`, and splits off the other plain keys. Each split value is set in an effect only if it is dynamic; what
 * stays in the object is set in an effect with it.
 *
 * @param {string} name
 * @param {AST.Expression} value
 * @param {Set<string>} namespaces
 * @returns {SplitValue | undefined}
 */
function split_class_or_style(name, value, namespaces) {
	const expression = strip(value, []);
	if (name === 'class') {
		/** @type {AST.ObjectExpression | undefined} */
		let object;
		/** @type {Set<string>} */
		let statics = new Set();
		if (expression?.type === 'ObjectExpression') {
			object = expression;
		} else if (expression?.type === 'ArrayExpression') {
			const elements = expression.elements;
			const last = elements.at(-1);
			const leading = elements.slice(0, -1);
			if (
				leading.length === 0 ||
				!leading.every(
					(element) => element?.type === 'Literal' && typeof element.value === 'string',
				) ||
				last?.type !== 'ObjectExpression'
			) {
				return undefined;
			}
			statics = new Set(
				leading.flatMap((element) =>
					String(/** @type {AST.Literal} */ (element).value)
						.trim()
						.split(/\s+/)
						.filter(Boolean),
				),
			);
			object = last;
		} else {
			return undefined;
		}
		const keys = object.properties.map((property) =>
			property.type === 'Property' && !property.computed ? property_key(property) : undefined,
		);
		const splits =
			keys.every((key) => key !== undefined && !/[ :]/.test(key)) &&
			!keys.some((key) => statics.has(/** @type {string} */ (key)));
		// A method or accessor stays in the object, which is then set whole
		// beside the split keys.
		const kept = object.properties.some(
			(property) => property.type === 'Property' && (property.method || property.kind !== 'init'),
		);
		if (!splits || kept) {
			// The whole value is set in an effect, unless the array isn't split.
			if (expression.type === 'ArrayExpression') return undefined;
			return [
				[expression, is_folded_dynamic(expression, namespaces) || !literal_value(expression)],
			];
		}
		return object.properties.map((property) => {
			const value = /** @type {AST.Property} */ (property).value;
			if (/** @type {AST.Property} */ (property).method || property.type !== 'Property') {
				return [value, false];
			}
			return [value, literal_value(value) ? 'dropped' : is_folded_dynamic(value, namespaces)];
		});
	}
	if (name === 'style' && expression?.type === 'ObjectExpression') {
		const spread = expression.properties.some((property) => property.type === 'SpreadElement');
		/** @type {SplitValue} */
		const parts = [];
		/** @type {AST.Node[]} */
		const remaining = [];
		for (const property of expression.properties) {
			if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
				remaining.push(property);
				continue;
			}
			const value = strip(property.value, []);
			const inlined = folds(property.value, FOLDED_TYPES.slice(0, 2));
			if (property.computed) {
				remaining.push(property.key);
				if (inlined) parts.push([property.value, 'dropped']);
				else remaining.push(property.value);
			} else if (
				inlined ||
				(value?.type === 'Literal' && value.value === null) ||
				(value?.type === 'Identifier' && value.name === 'undefined')
			) {
				parts.push([property.value, 'dropped']);
			} else if (spread) {
				remaining.push(property.value);
			} else {
				parts.push([property.value, is_folded_dynamic(property.value, namespaces)]);
			}
		}
		// What stays in the object is set with it, in an effect if it is
		// dynamic or the compiler can't evaluate it.
		const whole = remaining.some(
			(part) =>
				part.type === 'SpreadElement' ||
				part.type === 'Property' ||
				contains_dynamic(part, false) ||
				!literal_value(part),
		);
		for (const part of remaining) parts.push([part, whole]);
		return parts;
	}
	return undefined;
}

/**
 * @param {AST.Property} property
 * @returns {string | undefined}
 */
function property_key(property) {
	const key = property.key;
	if (key.type === 'Identifier') return key.name;
	if (key.type === 'Literal') return String(key.value);
	return undefined;
}

/**
 * Stateful DOM properties: 1 for the live value, 2 for its default.
 *
 * @type {Record<string, Record<string, 1 | 2>>}
 */
const DOM_WITH_STATE = {
	INPUT: { value: 1, defaultValue: 2, checked: 1, defaultChecked: 2 },
	SELECT: { value: 1 },
	OPTION: { value: 1, selected: 1, defaultSelected: 2 },
	TEXTAREA: { value: 1, defaultValue: 2 },
	VIDEO: { muted: 1, defaultMuted: 2 },
	AUDIO: { muted: 1, defaultMuted: 2 },
};

/**
 * The names a host element's attributes have in the DOM output, which first
 * renames a stateful property set to something other than a literal to
 * `prop:…`, and a literal default to the property itself. A textarea's
 * literal value, which becomes its content, is named `''`.
 *
 * @param {string} tag
 * @param {Array<ESTreeJSX.JSXAttribute | ESTreeJSX.JSXSpreadAttribute>} attributes
 * @returns {Map<AST.Node, string>}
 */
function dom_attribute_names(tag, attributes) {
	/** @type {Map<AST.Node, string>} */
	const names = new Map();
	for (const attribute of attributes) {
		if (attribute.type === 'JSXAttribute') names.set(attribute, attribute_name(attribute.name));
	}
	// Looked up by the tag in upper case, as the compiler does.
	const upper = tag.toUpperCase();
	const stateful = DOM_WITH_STATE[upper];
	if (!stateful) return names;
	/** @param {string} name */
	const find = (name) =>
		attributes.find(
			(attribute) => attribute.type === 'JSXAttribute' && attribute_name(attribute.name) === name,
		);
	for (const property of Object.keys(stateful)) {
		const attribute = /** @type {ESTreeJSX.JSXAttribute | undefined} */ (find(property));
		if (!attribute) continue;
		const default_property = `default${property[0].toUpperCase()}${property.slice(1)}`;
		const is_default =
			property.includes('default') || !(default_property in stateful && find(default_property));
		const value =
			attribute.value?.type === 'JSXExpressionContainer'
				? attribute.value.expression
				: attribute.value;
		const literal =
			!value ||
			(value.type === 'Literal' &&
				!(/** @type {{ regex?: unknown, bigint?: unknown }} */ (value).regex) &&
				!(/** @type {{ regex?: unknown, bigint?: unknown }} */ (value).bigint));
		const name = property.replace('default', '').toLowerCase();
		const folded_into_children =
			is_default &&
			literal &&
			upper === 'TEXTAREA' &&
			name === 'value' &&
			!(value?.type === 'Literal' && value.value === null);
		names.set(
			attribute,
			// A textarea's literal value becomes its content, so the attribute is gone.
			folded_into_children ? '' : is_default && literal ? name : `prop:${property}`,
		);
	}
	return names;
}

/** The events dom-expressions delegates by default. */
const DELEGATED_EVENTS = new Set([
	'beforeinput',
	'click',
	'dblclick',
	'contextmenu',
	'focusin',
	'focusout',
	'input',
	'keydown',
	'keyup',
	'mousedown',
	'mousemove',
	'mouseout',
	'mouseover',
	'mouseup',
	'pointerdown',
	'pointermove',
	'pointerout',
	'pointerover',
	'pointerup',
	'touchend',
	'touchmove',
	'touchstart',
]);

/** Elements dom-expressions writes without children, by the tag as written. */
const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

/** The types a host attribute value folds to. A host child folds to the first two. */
const FOLDED_TYPES = ['string', 'number', 'boolean'];

/**
 * dom-expressions' test for a host attribute value it re-evaluates, after it
 * folds the value, or an object's values one by one, into literals. An
 * object's values are checked as one expression, with no namespace exception.
 *
 * @param {AST.Node | null | undefined} node
 * @param {Set<string>} namespaces
 * @returns {boolean}
 */
function is_folded_dynamic(node, namespaces) {
	const expression = strip(node, []);
	if (!expression) return false;
	// A value that folds into a literal keeps no `yield` (see
	// `collect_folded_yields`), so only an object's values need folding here.
	if (expression.type === 'ObjectExpression') return object_is_dynamic(expression);
	return is_dynamic(expression, false, namespaces);
}

/**
 * @param {AST.ObjectExpression} object
 * @returns {boolean}
 */
function object_is_dynamic(object) {
	return object.properties.some((property) => {
		if (property.type !== 'Property') return true;
		if (property.computed && contains_dynamic(property.key, false)) return true;
		if (property.kind !== 'init' || property.method) return false;
		const value = strip(property.value, []);
		if (!value) return false;
		if (value.type === 'ObjectExpression') return object_is_dynamic(value);
		return !folds(value, FOLDED_TYPES) && contains_dynamic(value, false);
	});
}

/**
 * The `yield`s dom-expressions drops when it folds a host attribute value, a
 * value in an object there, or a host child into a literal.
 *
 * @param {AST.Program} program
 * @returns {Set<AST.Node>}
 */
function collect_folded_yields(program) {
	/** @type {Set<AST.Node>} */
	const folded = new Set();
	/**
	 * @param {AST.Node} node
	 * @param {string[]} types
	 */
	const fold = (node, types) => {
		if (folds(node, types)) for (const inner of find_yields(node)) folded.add(inner);
	};
	/** @param {AST.Node} node */
	const fold_attribute = (node) => {
		const value = strip(node, []);
		if (value?.type === 'ObjectExpression') {
			for (const property of value.properties) {
				if (property.type === 'Property' && property.kind === 'init' && !property.method) {
					fold_attribute(property.value);
				}
			}
		} else if (value) {
			fold(value, FOLDED_TYPES);
		}
	};
	/** @param {AST.Node} node */
	const visit = (node) => {
		if (node.type === 'JSXElement' && !is_component_name(node.openingElement.name)) {
			for (const attribute of node.openingElement.attributes) {
				if (
					attribute.type === 'JSXAttribute' &&
					attribute.value?.type === 'JSXExpressionContainer'
				) {
					fold_attribute(attribute.value.expression);
				}
			}
			for (const child of node.children) {
				const expression = child.type === 'JSXExpressionContainer' && strip(child.expression, []);
				if (expression && expression.type !== 'SequenceExpression') {
					fold(expression, FOLDED_TYPES.slice(0, 2));
				}
			}
		}
		for_each_child(node, visit);
	};
	visit(program);
	return folded;
}

/**
 * @param {AST.Node} node
 * @param {AST.Node[]} [found]
 * @returns {AST.Node[]}
 */
function find_yields(node, found = []) {
	if (node.type === 'YieldExpression') found.push(node);
	for_each_child(node, (child) => find_yields(child, found));
	return found;
}

/**
 * Whether babel's `evaluate` surely folds `node` into a value of one of
 * `types`.
 *
 * @param {AST.Node} node
 * @param {string[]} types
 * @returns {boolean}
 */
function folds(node, types) {
	const constant = literal_value(node);
	return !!constant && types.includes(typeof constant.value);
}

/**
 * The value babel's `evaluate` surely gives `node`, reading only literals: a
 * string, number, boolean or null literal, a template of them, a member of a
 * string or number literal (`'x'.length`), `!`, `-`, `+`, `~`, `typeof` and
 * `void` of them (and `typeof` of a function or class), a short circuit or
 * conditional on them, which skips the
 * branch that never runs, the last of a sequence, and arrays and objects of
 * them. It folds more (bindings, arithmetic, a few calls);
 * those count as not constant here.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {{ value: unknown } | undefined}
 */
function literal_value(node) {
	const expression = strip(node, []);
	if (!expression) return undefined;
	switch (expression.type) {
		case 'Literal': {
			const literal = /** @type {{ regex?: unknown, bigint?: unknown }} */ (expression);
			return literal.regex || literal.bigint ? undefined : { value: expression.value };
		}
		case 'TemplateLiteral': {
			let text = '';
			for (const [index, quasi] of expression.quasis.entries()) {
				text += quasi.value.cooked;
				const inner = expression.expressions[index];
				if (!inner) continue;
				const constant = literal_value(inner);
				if (!constant) return undefined;
				text += String(constant.value);
			}
			return { value: text };
		}
		case 'MemberExpression': {
			const object = expression.object;
			if (
				object.type !== 'Literal' ||
				(typeof object.value !== 'string' && typeof object.value !== 'number')
			) {
				return undefined;
			}
			const key = expression.computed
				? literal_value(expression.property)?.value
				: expression.property.type === 'Identifier'
					? expression.property.name
					: undefined;
			return typeof key === 'string' || typeof key === 'number'
				? { value: /** @type {any} */ (object.value)[key] }
				: undefined;
		}
		case 'UnaryExpression': {
			if (expression.operator === 'void') return { value: undefined };
			if (
				expression.operator === 'typeof' &&
				(isFunctionNode(expression.argument) || expression.argument.type === 'ClassExpression')
			) {
				return { value: 'function' };
			}
			const constant = literal_value(expression.argument);
			if (!constant) return undefined;
			const value = /** @type {any} */ (constant.value);
			switch (expression.operator) {
				case '!':
					return { value: !value };
				case '-':
					return { value: -value };
				case '+':
					return { value: +value };
				case '~':
					return { value: ~value };
				case 'typeof':
					return { value: typeof value };
			}
			return undefined;
		}
		case 'LogicalExpression': {
			const left = literal_value(expression.left);
			if (!left) return undefined;
			const skips =
				expression.operator === '||'
					? !!left.value
					: expression.operator === '&&'
						? !left.value
						: left.value != null;
			return skips ? left : literal_value(expression.right);
		}
		case 'ConditionalExpression': {
			const test = literal_value(expression.test);
			return test && literal_value(test.value ? expression.consequent : expression.alternate);
		}
		case 'SequenceExpression':
			return literal_value(expression.expressions.at(-1));
		case 'ArrayExpression': {
			/** @type {unknown[]} */
			const array = [];
			for (const element of expression.elements) {
				const constant = element?.type === 'SpreadElement' ? undefined : literal_value(element);
				if (!constant) return undefined;
				array.push(constant.value);
			}
			return { value: array };
		}
		case 'ObjectExpression': {
			/** @type {Record<string, unknown>} */
			const object = {};
			for (const property of expression.properties) {
				if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
					return undefined;
				}
				const key = property.computed
					? literal_value(property.key)
					: {
							value:
								property.key.type === 'Identifier'
									? property.key.name
									: /** @type {AST.Literal} */ (property.key).value,
						};
				const value = key && literal_value(property.value);
				if (!value) return undefined;
				object[String(key.value)] = value.value;
			}
			return { value: object };
		}
		default:
			return undefined;
	}
}

/**
 * @param {AST.Node} name
 * @returns {string}
 */
function host_tag_name(name) {
	if (name.type === 'JSXIdentifier' || name.type === 'Identifier') return name.name;
	if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
	return '';
}

/**
 * dom-expressions' test for a value it re-evaluates: one with a call, a
 * member access (other than on a namespace import), a spread or `in`, or with
 * `tags`, an element. A tagged template counts only as the whole value, and
 * function bodies don't count.
 *
 * @param {AST.Node | null | undefined} node
 * @param {boolean} tags
 * @param {Set<string>} namespaces
 * @returns {boolean}
 */
function is_dynamic(node, tags, namespaces) {
	const expression = strip(node, []);
	if (!expression || isFunctionNode(expression)) return false;
	// A tagged template is dynamic itself, but not inside a value.
	if (expression.type === 'TaggedTemplateExpression') return true;
	if (
		expression.type === 'MemberExpression' &&
		expression.object.type === 'Identifier' &&
		namespaces.has(expression.object.name) &&
		(!expression.computed || !is_dynamic(expression.property, tags, namespaces))
	) {
		return false;
	}
	return contains_dynamic(expression, tags);
}

/**
 * @param {AST.Node} node
 * @param {boolean} tags
 * @returns {boolean}
 */
function contains_dynamic(node, tags) {
	switch (node.type) {
		case 'CallExpression':
		case 'ImportExpression':
		case 'MemberExpression':
		case 'SpreadElement':
			return true;
		case 'BinaryExpression':
			if (node.operator === 'in') return true;
			break;
		case 'JSXElement':
			return tags;
		case 'JSXFragment':
			return tags && node.children.length > 0;
		default:
			if (isFunctionNode(node)) return false;
	}
	let dynamic = false;
	for_each_child(node, (child) => {
		dynamic ||= contains_dynamic(child, tags);
	});
	return dynamic;
}

/**
 * @param {AST.Program} program
 * @returns {Set<string>}
 */
function collect_namespace_imports(program) {
	/** @type {Set<string>} */
	const names = new Set();
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === 'ImportNamespaceSpecifier') names.add(specifier.local.name);
		}
	}
	return names;
}

/**
 * dom-expressions compiles a capitalized or dotted tag as a component.
 *
 * @param {AST.Node} name
 * @returns {boolean}
 */
function is_component_name(name) {
	if (name.type === 'JSXNamespacedName') return false;
	if (name.type !== 'JSXIdentifier' && name.type !== 'Identifier') return true;
	const first = name.name[0];
	return first !== first.toLowerCase();
}

/**
 * @param {ESTreeJSX.JSXAttribute['name']} name
 * @returns {string}
 */
function attribute_name(name) {
	return name.type === 'JSXNamespacedName' ? `${name.namespace.name}:${name.name.name}` : name.name;
}

/**
 * vite-plugin-solid hands babel the TypeScript as written, so a TypeScript
 * wrapper hides the expression inside from dom-expressions, except where it
 * strips one itself: `as` and `!` on a host ref, and `satisfies` too on a
 * component ref.
 */
const HOST_REF_WRAPPERS = ['TSAsExpression', 'TSNonNullExpression'];
const COMPONENT_REF_WRAPPERS = [...HOST_REF_WRAPPERS, 'TSSatisfiesExpression'];

/**
 * The expression inside parentheses, which babel doesn't keep as a node, and
 * inside the given TypeScript wrappers.
 *
 * @param {AST.Node | null | undefined} node
 * @param {string[]} wrappers
 * @returns {AST.Node | null | undefined}
 */
function strip(node, wrappers) {
	let current = node;
	while (
		current &&
		(current.type === 'ParenthesizedExpression' || wrappers.includes(current.type))
	) {
		current = /** @type {{ expression: AST.Node }} */ (/** @type {unknown} */ (current)).expression;
	}
	return current;
}

/**
 * @param {AST.Node} node
 * @param {(child: AST.Node) => void} visit
 */
function for_each_child(node, visit) {
	for (const key of Object.keys(node)) {
		if (AST_METADATA_KEYS.has(key)) continue;
		const value = /** @type {unknown} */ (/** @type {Record<string, unknown>} */ (node)[key]);
		for (const child of Array.isArray(value) ? value : [value]) {
			if (child && typeof child === 'object' && 'type' in child) {
				visit(/** @type {AST.Node} */ (child));
			}
		}
	}
}
