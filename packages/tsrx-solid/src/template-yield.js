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
	return find_deferred(program, false);
}

/**
 * The same for a server build, which vite-plugin-solid compiles with
 * `{ generate: 'ssr', hydratable: true }`: the `yield`s either that output or
 * the client's DOM output moves out of their generator, since the app fails
 * to build when either does. The SSR output builds each template as one
 * string, in place, except that it:
 *
 * - evaluates a dynamic attribute value in an arrow, counting an element in
 *   it as dynamic;
 * - renders a host element with a spread through `ssrElement`, with its
 *   children in an arrow and, when it has other attributes or the spread is
 *   dynamic, its props merged in an arrow;
 * - groups neighbouring dynamic values, `textContent` included, in one arrow;
 * - leaves out refs, event handlers and `prop:` values.
 *
 * The client's `yield`s are found as `find_deferred_template_yields` finds
 * them, on their own, so a value the SSR check counts as maybe folded (see
 * `collect_folded_yields`) never hides one: a server build reports every
 * `yield` a client build does.
 *
 * @param {AST.Program} program
 * @returns {AST.YieldExpression[]}
 */
export function find_deferred_server_template_yields(program) {
	return [...find_deferred(program, false), ...find_deferred(program, true)];
}

/**
 * @param {AST.Program} program
 * @param {boolean} server whether to follow the SSR output as well
 * @returns {AST.YieldExpression[]}
 */
function find_deferred(program, server) {
	/** @type {AST.YieldExpression[]} */
	const found = [];
	const namespaces = collect_namespace_imports(program);
	/**
	 * `textContent` values the SSR output groups with a neighbouring dynamic
	 * value, in an arrow.
	 *
	 * @type {Set<AST.Node>}
	 */
	const grouped = new Set();
	const folder = server ? create_folder(program) : undefined;
	const folded = collect_folded_yields(program, folder);

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
				if (folder) collect_grouped_text_content(element, grouped, namespaces, folder);
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
		// arrow, with everything it keeps, but not what it drops. The SSR
		// output doesn't, and a server build checks the DOM output on its own
		// as well (`find_deferred_server_template_yields`).
		if (!inline && !server) context = { ...context, deferred: true };

		const ssr = server ? ssr_host_element(element, namespaces) : undefined;
		const tag = host_tag_name(opening.name);
		const spread = opening.attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute');
		const names = dom_attribute_names(tag, opening.attributes);
		// The DOM output removes an element's first `$key`.
		const first_key = opening.attributes.find((attribute) => names.get(attribute) === '$key');
		// It writes no children for a void element or a `noscript`, and a
		// textarea's literal value (named `''`) replaces them. A server build
		// follows the SSR output, which writes a `noscript`'s children and
		// replaces a textarea's with any default value.
		const childless = ssr
			? VOID_ELEMENTS.has(tag) || ssr.replaced_children
			: VOID_ELEMENTS.has(tag) ||
				tag === 'noscript' ||
				opening.attributes.some((attribute) => names.get(attribute) === '');
		for (const [index, attribute] of opening.attributes.entries()) {
			if (attribute.type === 'JSXSpreadAttribute') {
				visit_value(
					attribute.argument,
					context,
					is_dynamic(attribute.argument, false, namespaces) || !!ssr?.merged,
				);
				continue;
			}
			const value = attribute.value;
			// A server build follows the SSR output alone, its names and what it
			// leaves out (a ref is left out of the markup but evaluated where the
			// element is); the DOM output's are checked on their own.
			if (ssr) {
				if (ssr.roles.get(attribute) === 'dropped' && attribute_name(attribute.name) !== 'ref') {
					continue;
				}
				visit_value(
					value?.type === 'JSXExpressionContainer' ? value.expression : value,
					context,
					is_ssr_attribute_deferred(
						attribute,
						ssr,
						grouped,
						namespaces,
						/** @type {Folder} */ (folder),
					),
				);
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
			if (attribute === first_key) continue;
			// Without a spread, a `children` attribute is dropped when the
			// element has children of its own, or writes none.
			if (!spread && key === 'children' && (element.children.length > 0 || childless)) {
				continue;
			}
			if (value?.type !== 'JSXExpressionContainer') {
				if (value) visit_value(value, context, false);
				continue;
			}
			const expression = /** @type {AST.Expression} */ (value.expression);
			const name = attribute_name(attribute.name);
			// The DOM output splits a class or style object and an event array.
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

		if (ssr?.spread && !ssr.replaced_children) {
			// `ssrElement` takes the children in an arrow.
			for (const child of element.children) visit_value(child, context, true);
			return;
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
			// A `children` prop is dropped when the component has children.
			if (attribute_name(attribute.name) === 'children' && element.children.length > 0) continue;
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
 * @typedef {'kept' | 'dropped' | 'content' | 'folded'} SsrRole
 * How the SSR output renders an attribute: as an attribute or prop, not at
 * all, as the element's content (`textContent` and the like), or as a
 * textarea's content (its value).
 */

/**
 * @typedef {{
 * 	tag: string,
 * 	spread: boolean,
 * 	merged: boolean,
 * 	replaced_children: boolean,
 * 	roles: Map<AST.Node, SsrRole>,
 * 	names: Map<AST.Node, string>,
 * }} SsrHostElement
 */

/** Properties dom-expressions renders as an element's content. */
const CHILD_PROPERTIES = new Set(['innerHTML', 'textContent', 'innerText', 'children']);

/**
 * How babel-preset-solid's SSR output (`hydratable: true`) renders a host
 * element's attributes.
 *
 * @param {ESTreeJSX.JSXElement | AST.TSRXJSXElement} element
 * @param {Set<string>} namespaces
 * @returns {SsrHostElement}
 */
function ssr_host_element(element, namespaces) {
	const opening = element.openingElement;
	const tag = host_tag_name(opening.name);
	const attributes = opening.attributes;
	const spread = attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute');
	/** @type {Map<AST.Node, SsrRole>} */
	const roles = new Map();
	/** @type {Map<AST.Node, string>} */
	const names = new Map();
	for (const attribute of attributes) {
		if (attribute.type === 'JSXAttribute') names.set(attribute, attribute_name(attribute.name));
	}
	/** @param {string} name */
	const find = (name) => attributes.find((attribute) => names.get(attribute) === name);

	// The first `$key` is rendered as `_key`.
	const key = find('$key');
	if (key) names.set(key, '_key');

	// Stateful properties are renamed before anything else, and a textarea's
	// value becomes its only child.
	let has_children = element.children.length > 0;
	let replaced_children = false;
	const stateful = DOM_WITH_STATE[tag.toUpperCase()];
	for (const property of Object.keys(stateful ?? {})) {
		const attribute = find(property);
		if (!attribute || attribute.type !== 'JSXAttribute') continue;
		const default_property = `default${property[0].toUpperCase()}${property.slice(1)}`;
		const is_default =
			property.includes('default') || !(default_property in stateful && find(default_property));
		const name = property.replace('default', '').toLowerCase();
		const value =
			attribute.value?.type === 'JSXExpressionContainer'
				? attribute.value.expression
				: attribute.value;
		const is_null = value?.type === 'Literal' && value.value === null;
		if (is_default && tag.toUpperCase() === 'TEXTAREA' && name === 'value' && !is_null) {
			roles.set(attribute, 'folded');
			has_children = true;
			replaced_children = true;
		} else {
			names.set(attribute, is_default ? name : `prop:${property}`);
		}
	}

	for (const [index, attribute] of attributes.entries()) {
		if (attribute.type !== 'JSXAttribute' || roles.has(attribute)) continue;
		const name = /** @type {string} */ (names.get(attribute));
		const value = attribute.value;
		if (
			name === 'ref' ||
			name.startsWith('on') ||
			name.startsWith('prop:') ||
			(value?.type === 'JSXExpressionContainer' &&
				value.expression.type === 'JSXEmptyExpression') ||
			// A content property with no value is ignored.
			(!value && CHILD_PROPERTIES.has(name))
		) {
			roles.set(attribute, 'dropped');
		} else if (spread) {
			roles.set(attribute, name === 'children' && has_children ? 'dropped' : 'kept');
		} else {
			// The template drops all but the last attribute of a name, and all but
			// the last content property with a value: they fill one slot.
			const content = CHILD_PROPERTIES.has(name);
			const later = attributes.slice(index + 1).some((other) => {
				const other_name = names.get(other) ?? '';
				if (roles.get(other) === 'folded' || other.type !== 'JSXAttribute') return false;
				if (other_name === name) return true;
				return (
					content &&
					CHILD_PROPERTIES.has(other_name) &&
					!!other.value &&
					!(
						other.value.type === 'JSXExpressionContainer' &&
						other.value.expression.type === 'JSXEmptyExpression'
					)
				);
			});
			if (later) roles.set(attribute, 'dropped');
			else if (!content) roles.set(attribute, 'kept');
			else roles.set(attribute, has_children || VOID_ELEMENTS.has(tag) ? 'dropped' : 'content');
		}
	}

	// `ssrElement` merges the props in an arrow when there are several or a
	// spread is dynamic. It passes a lone spread as is, but the DOM output
	// moves a dynamic one anyway.
	let merged = false;
	if (spread) {
		let props = 0;
		let running = false;
		for (const attribute of attributes) {
			if (attribute.type === 'JSXSpreadAttribute') {
				if (running) props++;
				running = false;
				props++;
				merged ||= is_dynamic(attribute.argument, false, namespaces);
			} else if (roles.get(attribute) === 'kept') {
				running = true;
			}
		}
		if (running) props++;
		merged ||= props > 1;
	}

	return { tag, spread, merged, replaced_children, roles, names };
}

/**
 * Whether babel-preset-solid's SSR output moves a host element's attribute
 * value into an arrow. One it leaves out is never evaluated, so it isn't.
 *
 * @param {ESTreeJSX.JSXAttribute} attribute
 * @param {SsrHostElement} ssr
 * @param {Set<AST.Node>} grouped
 * @param {Set<string>} namespaces
 * @param {Folder} folder
 * @returns {boolean}
 */
function is_ssr_attribute_deferred(attribute, ssr, grouped, namespaces, folder) {
	const role = ssr.roles.get(attribute);
	if (ssr.spread) return role === 'folded' || (role === 'kept' && ssr.merged);
	const value = attribute.value;
	if (value?.type !== 'JSXExpressionContainer') return false;
	if (role === 'content' || role === 'folded') {
		// Content, and a textarea's value, is rendered like a child: in an arrow
		// when it's dynamic, not counting an element in it, or grouped.
		return (
			grouped.has(value.expression) ||
			is_surely_dynamic(value.expression, namespaces, folder, false, false)
		);
	}
	// A dynamic value, counting an element in it, is rendered in an arrow. A
	// value that may fold counts as static, so a `yield` there goes unreported
	// rather than reported though it stays in place.
	return role === 'kept' && is_surely_dynamic(value.expression, namespaces, folder);
}

/**
 * The SSR output renders a template as one string, with the values it can't
 * know in a list. It groups each run of two or more dynamic values in that
 * list, `textContent` included, in one arrow. This adds the `textContent`
 * values of `root`'s template in such a run to `grouped`; a dynamic one is in
 * an arrow either way.
 *
 * @param {ESTreeJSX.JSXElement | AST.TSRXJSXElement} root
 * @param {Set<AST.Node>} grouped
 * @param {Set<string>} namespaces
 * @param {Folder} folder
 */
function collect_grouped_text_content(root, grouped, namespaces, folder) {
	if (is_component_name(root.openingElement.name)) return;

	/**
	 * The template's values in order: `true` for a dynamic one, a
	 * `textContent` value, or `false` for any other.
	 *
	 * @type {Array<AST.Node | boolean>}
	 */
	const values = [false]; // the hydration key

	/**
	 * @param {AST.Node} node
	 * @param {string[]} types
	 */
	const folds = (node, types) => {
		const constant = folder.evaluate(node);
		return !!constant && types.includes(typeof constant.value);
	};

	/** @param {ESTreeJSX.JSXElement | AST.TSRXJSXElement} element */
	const add = (element) => {
		const ssr = ssr_host_element(element, namespaces);
		/** @type {ESTreeJSX.JSXAttribute | undefined} */
		let content;
		for (const attribute of element.openingElement.attributes) {
			if (attribute.type !== 'JSXAttribute') continue;
			const role = ssr.roles.get(attribute);
			if (role === 'content' || role === 'folded') {
				content = attribute;
				continue;
			}
			const value = attribute.value;
			if (role !== 'kept' || value?.type !== 'JSXExpressionContainer') continue;
			const expression = value.expression;
			// A value the compiler folds into a literal is written into the template.
			if (folds(expression, FOLDED_TYPES)) continue;
			const name = /** @type {string} */ (ssr.names.get(attribute));
			if (
				name === 'style' &&
				expression.type === 'ObjectExpression' &&
				expression.properties.length === 0
			) {
				continue;
			}
			// A live stateful property is set after the template, outside the run.
			values.push(
				is_surely_dynamic(expression, namespaces, folder) &&
					(name === 'class' ||
						name === 'style' ||
						DOM_WITH_STATE[ssr.tag.toUpperCase()]?.[name] !== 1),
			);
		}
		if (VOID_ELEMENTS.has(ssr.tag)) return;

		const text_content = !!content && ssr.names.get(content) === 'textContent';
		const children = content ? [content.value] : element.children;
		for (const child of children) {
			if (!child || child.type === 'JSXText' || child.type === 'Literal') continue;
			if (child.type === 'JSXExpressionContainer') {
				const expression = child.expression;
				// A child the compiler folds into a string or number is text.
				if (
					expression.type === 'JSXEmptyExpression' ||
					(expression.type !== 'SequenceExpression' && folds(expression, FOLDED_TYPES.slice(0, 2)))
				) {
					continue;
				}
				// A `textContent` value that may fold is written into the template.
				values.push(text_content && !folder.may_fold(expression) ? expression : false);
			} else if (
				child.type === 'JSXElement' &&
				!is_component_name(child.openingElement.name) &&
				!child.openingElement.attributes.some(
					(attribute) => attribute.type === 'JSXSpreadAttribute',
				)
			) {
				add(child);
			} else {
				values.push(false);
			}
		}
	};

	if (root.openingElement.attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute')) {
		return;
	}
	add(root);

	/** @type {Array<AST.Node | boolean>} */
	let run = [];
	for (const value of [...values, false]) {
		if (value) {
			run.push(value);
			continue;
		}
		if (run.length > 1) {
			for (const entry of run) if (entry !== true) grouped.add(/** @type {AST.Node} */ (entry));
		}
		run = [];
	}
}

/**
 * Whether babel-preset-solid surely treats a host attribute's value as
 * dynamic. It first folds a value it can evaluate into a string, number or
 * boolean literal (`'a'.length`, `String(1)`, `true || x`), and an object's
 * values one by one, so a value that may fold counts as static here. Calling
 * a static value dynamic would group a `textContent` beside it that the
 * output leaves in place.
 *
 * @param {AST.Node} node
 * @param {Set<string>} namespaces
 * @param {Folder} folder
 * @param {boolean} [nested] whether it is a value in an object
 * @param {boolean} [elements] whether an element in it counts as dynamic
 * @returns {boolean}
 */
function is_surely_dynamic(node, namespaces, folder, nested = false, elements = true) {
	const expression = strip(node, []);
	if (!expression) return false;
	if (expression.type === 'ObjectExpression') {
		// Its values are checked as one expression, with no namespace exception.
		return expression.properties.some(
			(property) =>
				property.type !== 'Property' ||
				(property.computed && contains_dynamic(property.key, true)) ||
				(property.kind === 'init' &&
					!property.method &&
					is_surely_dynamic(property.value, namespaces, folder, true)),
		);
	}
	// Inside an object, a value is part of the whole, so only what's inside it
	// counts (a tagged template there isn't dynamic).
	const dynamic = nested
		? contains_dynamic(expression, true)
		: is_dynamic(expression, elements, namespaces);
	const constant = folder.evaluate(expression);
	if (constant) return !FOLDED_TYPES.includes(typeof constant.value) && dynamic;
	return dynamic && !folder.may_fold(expression);
}

/**
 * @typedef {{
 * 	evaluate: (node: AST.Node | null | undefined) => { value: unknown } | undefined,
 * 	may_fold: (node: AST.Node | null | undefined) => boolean,
 * }} Folder
 * How babel's `evaluate`, which babel-preset-solid runs to fold a value,
 * treats the module's values. `evaluate` reads only literals
 * (`literal_value`), so it gives a value only where babel surely does;
 * `may_fold` errs towards yes.
 */

/** Globals babel's `evaluate` calls. */
const FOLDED_FUNCTIONS = [
	'isFinite',
	'isNaN',
	'parseFloat',
	'parseInt',
	'decodeURI',
	'decodeURIComponent',
	'encodeURI',
	'encodeURIComponent',
];

/** Globals whose functions babel's `evaluate` calls, also called themselves. */
const FOLDED_OBJECTS = ['Number', 'String', 'Math'];

/** Globals babel's `evaluate` reads. */
const FOLDED_GLOBALS = ['undefined', 'NaN', 'Infinity'];

/**
 * @param {AST.Program} program
 * @returns {Folder}
 */
function create_folder(program) {
	const bindings = collect_bindings(program);
	/** @type {Set<AST.Node>} */
	const resolving = new Set();

	/**
	 * Whether babel might evaluate `node` to a constant. It reads literals,
	 * `const`-like bindings and a few global functions, and skips the part of
	 * a short circuit that doesn't run. A parameter, an import, a function, a
	 * class, an assigned binding, or a global call a binding shadows never
	 * folds; anything else unsure counts as foldable.
	 *
	 * @param {AST.Node | null | undefined} node
	 * @returns {boolean}
	 */
	const may_fold = (node) => {
		const expression = strip(node, COMPONENT_REF_WRAPPERS);
		if (!expression) return true;
		switch (expression.type) {
			case 'Literal':
				return true;
			case 'Identifier': {
				const binding = bindings.resolve(expression);
				if (binding === undefined) return FOLDED_GLOBALS.includes(expression.name);
				if (binding === null) return true;
				if (binding.kind !== 'variable' || binding.assigned) return false;
				if (!binding.init) return binding.pattern;
				if (resolving.has(binding.init)) return false;
				resolving.add(binding.init);
				const folds = may_fold(binding.init);
				resolving.delete(binding.init);
				return folds;
			}
			case 'TemplateLiteral':
				return expression.expressions.every(may_fold);
			case 'TaggedTemplateExpression': {
				const tag = expression.tag;
				return (
					tag.type === 'MemberExpression' &&
					tag.object.type === 'Identifier' &&
					tag.object.name === 'String' &&
					!is_bound(tag.object) &&
					tag.property.type === 'Identifier' &&
					tag.property.name === 'raw' &&
					expression.quasi.expressions.every(may_fold)
				);
			}
			case 'MemberExpression':
				return (
					expression.object.type === 'Literal' &&
					(typeof expression.object.value === 'string' ||
						typeof expression.object.value === 'number') &&
					(!expression.computed || may_fold(expression.property))
				);
			case 'CallExpression': {
				const callee = expression.callee;
				const folds =
					(callee.type === 'Identifier' &&
						!is_bound(callee) &&
						(FOLDED_FUNCTIONS.includes(callee.name) || FOLDED_OBJECTS.includes(callee.name))) ||
					(callee.type === 'MemberExpression' &&
						callee.property.type === 'Identifier' &&
						((callee.object.type === 'Literal' &&
							(typeof callee.object.value === 'string' ||
								typeof callee.object.value === 'number')) ||
							(callee.object.type === 'Identifier' &&
								FOLDED_OBJECTS.includes(callee.object.name) &&
								callee.property.name !== 'random')));
				return folds && expression.arguments.every(may_fold);
			}
			case 'ConditionalExpression': {
				// A literal test decides the branch.
				const test = literal_value(expression.test);
				if (test) return may_fold(test.value ? expression.consequent : expression.alternate);
				return (
					may_fold(expression.test) &&
					(may_fold(expression.consequent) || may_fold(expression.alternate))
				);
			}
			case 'LogicalExpression': {
				// A literal left side decides whether the right one runs.
				const left = literal_value(expression.left);
				if (!left) return may_fold(expression.left);
				const skips =
					expression.operator === '||'
						? !!left.value
						: expression.operator === '&&'
							? !left.value
							: left.value != null;
				return skips || may_fold(expression.right);
			}
			case 'BinaryExpression':
				return may_fold(expression.left) && may_fold(expression.right);
			case 'UnaryExpression':
				return (
					expression.operator === 'void' ||
					(expression.operator === 'typeof' &&
						(isFunctionNode(expression.argument) ||
							expression.argument.type === 'ClassExpression')) ||
					may_fold(expression.argument)
				);
			case 'SequenceExpression':
				return may_fold(expression.expressions.at(-1));
			case 'ArrayExpression':
				return expression.elements.every(
					(element) => element?.type !== 'SpreadElement' && may_fold(element),
				);
			case 'ObjectExpression':
				return expression.properties.every(
					(property) =>
						property.type === 'Property' &&
						property.kind === 'init' &&
						!property.method &&
						(!property.computed || may_fold(property.key)) &&
						may_fold(property.value),
				);
			default:
				return false;
		}
	};

	/**
	 * Whether a binding surely shadows a global at `identifier`.
	 *
	 * @param {AST.Identifier} identifier
	 */
	const is_bound = (identifier) => !!bindings.resolve(identifier);

	return { evaluate: literal_value, may_fold };
}

/**
 * @typedef {{
 * 	kind: 'variable' | 'other',
 * 	init: AST.Node | null,
 * 	pattern: boolean,
 * 	assigned: boolean,
 * 	start: number,
 * 	end: number,
 * }} Binding
 * A declaration: a variable (`const`, `let` or `var`, with its initial
 * value), or a parameter, import, function, class or catch binding. `start`
 * and `end` bound its scope.
 */

/**
 * The module's declarations by scope, to resolve a name where it's read.
 * `resolve` gives the declaration that binds the name there, `undefined` for
 * a global, or `null` when it can't tell.
 *
 * @param {AST.Program} program
 * @returns {{ resolve: (identifier: AST.Identifier) => Binding | null | undefined }}
 */
function collect_bindings(program) {
	/** @type {Map<string, Binding[]>} */
	const declared = new Map();
	/** @type {AST.Identifier[]} */
	const assignments = [];

	/**
	 * @param {string} name
	 * @param {AST.Node} scope
	 * @param {'variable' | 'other'} kind
	 * @param {AST.Node | null} init
	 * @param {boolean} pattern
	 */
	const declare = (name, scope, kind, init, pattern) => {
		const list = declared.get(name) ?? [];
		list.push({
			kind,
			init,
			pattern,
			assigned: false,
			start: typeof scope.start === 'number' ? scope.start : -1,
			end: typeof scope.end === 'number' ? scope.end : -1,
		});
		declared.set(name, list);
	};
	/**
	 * The identifiers a pattern binds or assigns.
	 *
	 * @param {AST.Node | null | undefined} pattern
	 * @param {(identifier: AST.Identifier) => void} each
	 */
	const identifiers = (pattern, each) => {
		if (!pattern) return;
		switch (pattern.type) {
			case 'Identifier':
				each(pattern);
				break;
			case 'ObjectPattern':
				for (const property of pattern.properties) {
					identifiers(property.type === 'RestElement' ? property.argument : property.value, each);
				}
				break;
			case 'ArrayPattern':
				for (const element of pattern.elements) identifiers(element, each);
				break;
			case 'RestElement':
				identifiers(pattern.argument, each);
				break;
			case 'AssignmentPattern':
				identifiers(pattern.left, each);
				break;
			// Babel's scope doesn't bind a parameter property
			// (`constructor(public x)`).
		}
	};
	/**
	 * @param {AST.Node} node
	 * @param {AST.Node} block the nearest block scope
	 * @param {AST.Node} fn the nearest function scope
	 */
	const visit = (node, block, fn) => {
		switch (node.type) {
			case 'VariableDeclaration':
				for (const declarator of node.declarations) {
					const scope = node.kind === 'var' ? fn : block;
					const pattern = declarator.id.type !== 'Identifier';
					identifiers(declarator.id, (id) =>
						declare(
							id.name,
							scope,
							'variable',
							pattern ? null : (declarator.init ?? null),
							pattern,
						),
					);
				}
				break;
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				if (node.type === 'FunctionDeclaration' && node.id) {
					declare(node.id.name, block, 'other', null, false);
				} else if (node.type === 'FunctionExpression' && node.id) {
					declare(node.id.name, node, 'other', null, false);
				}
				for (const param of node.params) {
					identifiers(param, (id) => declare(id.name, node, 'other', null, false));
				}
				// The body's own bindings aren't visible to the parameters.
				block = fn = node.body.type === 'BlockStatement' ? node.body : node;
				break;
			case 'ClassDeclaration':
				// Babel's scope doesn't bind a `declare class`.
				if (node.id && !(/** @type {{ declare?: boolean }} */ (node).declare)) {
					declare(node.id.name, block, 'other', null, false);
				}
				break;
			case 'ClassExpression':
				if (node.id) declare(node.id.name, node, 'other', null, false);
				break;
			case 'ImportDeclaration':
				for (const specifier of node.specifiers) {
					declare(specifier.local.name, program, 'other', null, false);
				}
				break;
			case 'CatchClause':
				identifiers(node.param, (id) => declare(id.name, node, 'other', null, false));
				break;
			case 'AssignmentExpression':
				identifiers(node.left, (id) => assignments.push(id));
				break;
			case 'UpdateExpression':
				identifiers(node.argument, (id) => assignments.push(id));
				break;
			case 'ForInStatement':
			case 'ForOfStatement':
				if (node.left.type !== 'VariableDeclaration') {
					identifiers(node.left, (id) => assignments.push(id));
				}
				block = node;
				break;
			case 'StaticBlock':
				block = fn = node;
				break;
			case 'BlockStatement':
			case 'ForStatement':
			case 'SwitchStatement':
				block = node;
				break;
			default: {
				// Of TypeScript's value declarations, babel's scope binds only
				// `import x = …`, not an enum, a namespace or a `declare function`.
				// A namespace's body is its own scope.
				const declaration = /** @type {{ type: string, id?: AST.Node | null }} */ (node);
				if (
					declaration.type === 'TSImportEqualsDeclaration' &&
					declaration.id?.type === 'Identifier'
				) {
					declare(declaration.id.name, block, 'other', null, false);
				}
				if (declaration.type === 'TSModuleBlock') block = fn = node;
			}
		}
		for_each_child(node, (child) => visit(child, block, fn));
	};
	visit(program, program, program);

	/** @param {AST.Identifier} identifier */
	const resolve = (identifier) => {
		const list = declared.get(identifier.name);
		if (!list) return undefined;
		const at = identifier.start;
		if (typeof at !== 'number' || list.some((binding) => binding.start < 0)) return null;
		/** @type {Binding | undefined} */
		let innermost;
		for (const binding of list) {
			if (binding.start <= at && at < binding.end) {
				if (!innermost || binding.start >= innermost.start) innermost = binding;
			}
		}
		return innermost;
	};
	for (const identifier of assignments) {
		const binding = resolve(identifier);
		if (binding) binding.assigned = true;
	}
	return { resolve };
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
 * How dom-expressions compiles an array on an event, or `undefined` for any
 * other value: it keeps the handler and the data, the first two elements,
 * and drops the rest. On an event it doesn't delegate, it calls the handler
 * with the data inside a new listener; otherwise both stay in place.
 *
 * @param {string} name
 * @param {AST.Expression} value
 * @returns {SplitValue | undefined}
 */
function split_event_handler(name, value) {
	const expression = strip(value, []);
	if (!name.startsWith('on') || expression?.type !== 'ArrayExpression') return undefined;
	const [handler, data] = expression.elements;
	const paired = expression.elements.length > 1;
	// The compiler throws on a hole or a spread handler, a hole for data, or,
	// on a delegated event, a spread for data.
	if (!handler || handler.type === 'SpreadElement' || (paired && !data)) return undefined;
	const moved = paired && !DELEGATED_EVENTS.has(name.slice(2).toLowerCase());
	return expression.elements.flatMap((element, index) =>
		element
			? [/** @type {[AST.Node, boolean | 'dropped']} */ ([element, index > 1 ? 'dropped' : moved])]
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
 * value in an object there, or a host child into a literal. For the SSR
 * check, a value that may fold, but whose literals don't decide it, counts
 * too, so a `yield` only that check finds there goes unreported rather than
 * reported though dropped.
 *
 * @param {AST.Program} program
 * @param {Folder} [folder]
 * @returns {Set<AST.Node>}
 */
function collect_folded_yields(program, folder) {
	/** @type {Set<AST.Node>} */
	const folded = new Set();
	/**
	 * @param {AST.Node} node
	 * @param {string[]} types
	 */
	const fold = (node, types) => {
		// In a server build, a value the literals can't decide but that may
		// fold counts as folded too.
		if (folds(node, types) || (folder && !literal_value(node) && folder.may_fold(node))) {
			for (const inner of find_yields(node)) folded.add(inner);
		}
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
