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
 * @param {AST.Program} program
 * @returns {AST.YieldExpression[]}
 */
export function find_deferred_server_template_yields(program) {
	return find_deferred(program, true);
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
			if (context.generator && context.deferred) found.push(node);
		} else if (node.type === 'ReturnStatement' || node.type === 'VariableDeclarator') {
			const value = node.type === 'ReturnStatement' ? node.argument : node.init;
			const element = strip(value, []);
			if (element?.type === 'JSXElement') {
				if (server) collect_grouped_text_content(element, grouped, namespaces);
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
		if (context.deferred || !inline) {
			visit_all(element, { ...context, deferred: true });
			return;
		}

		const ssr = server ? ssr_host_element(element, namespaces) : undefined;
		for (const attribute of opening.attributes) {
			if (attribute.type === 'JSXSpreadAttribute') {
				visit_value(
					attribute.argument,
					context,
					is_dynamic(attribute.argument, false, namespaces) || !!ssr?.merged,
				);
				continue;
			}
			const value = attribute.value;
			const ssr_deferred = !!ssr && is_ssr_attribute_deferred(attribute, ssr, grouped, namespaces);
			if (value?.type !== 'JSXExpressionContainer') {
				if (value) visit_value(value, context, ssr_deferred);
				continue;
			}
			const expression = /** @type {AST.Expression} */ (value.expression);
			visit_value(
				expression,
				context,
				is_host_attribute_deferred(attribute_name(attribute.name), expression, namespaces) ||
					ssr_deferred,
			);
		}

		if (ssr?.spread && !ssr.replaced_children) {
			// `ssrElement` takes the children in an arrow.
			for (const child of element.children) visit_value(child, context, true);
			return;
		}

		for (const child of element.children) {
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
 * Stateful DOM properties: 1 for the live value, 2 for its default. The SSR
 * output renders the default as the attribute, so a live value beside its
 * default is left out, and a textarea's value is rendered as its content.
 *
 * @type {Record<string, Record<string, 1 | 2>>}
 */
const DOM_WITH_STATE = {
	input: { value: 1, defaultValue: 2, checked: 1, defaultChecked: 2 },
	select: { value: 1 },
	option: { value: 1, selected: 1, defaultSelected: 2 },
	textarea: { value: 1, defaultValue: 2 },
	video: { muted: 1, defaultMuted: 2 },
	audio: { muted: 1, defaultMuted: 2 },
};

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

	// Stateful properties are renamed before anything else, and a textarea's
	// value becomes its only child.
	let has_children = element.children.length > 0;
	let replaced_children = false;
	const stateful = DOM_WITH_STATE[tag.toLowerCase()];
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
		if (is_default && tag.toLowerCase() === 'textarea' && name === 'value' && !is_null) {
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
			(value?.type === 'JSXExpressionContainer' && value.expression.type === 'JSXEmptyExpression')
		) {
			roles.set(attribute, 'dropped');
		} else if (spread) {
			roles.set(attribute, name === 'children' && has_children ? 'dropped' : 'kept');
		} else if (CHILD_PROPERTIES.has(name)) {
			roles.set(
				attribute,
				has_children || VOID_ELEMENTS.has(tag.toLowerCase()) ? 'dropped' : 'content',
			);
		} else {
			// The template drops all but the last attribute of a name.
			const later = attributes
				.slice(index + 1)
				.some((other) => roles.get(other) !== 'folded' && names.get(other) === name);
			roles.set(attribute, later ? 'dropped' : 'kept');
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
 * @returns {boolean}
 */
function is_ssr_attribute_deferred(attribute, ssr, grouped, namespaces) {
	const role = ssr.roles.get(attribute);
	if (ssr.spread) return role === 'folded' || (role === 'kept' && ssr.merged);
	const value = attribute.value;
	if (value?.type !== 'JSXExpressionContainer') return false;
	if (role === 'content') return grouped.has(value.expression);
	// A dynamic value, counting an element in it, is rendered in an arrow.
	return role === 'kept' && is_dynamic(value.expression, true, namespaces);
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
 */
function collect_grouped_text_content(root, grouped, namespaces) {
	if (is_component_name(root.openingElement.name)) return;

	/**
	 * The template's values in order: `true` for a dynamic one, a
	 * `textContent` value, or `false` for any other.
	 *
	 * @type {Array<AST.Node | boolean>}
	 */
	const values = [false]; // the hydration key

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
			if (is_literal(expression)) continue;
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
				is_dynamic(expression, true, namespaces) &&
					(name === 'class' ||
						name === 'style' ||
						DOM_WITH_STATE[ssr.tag.toLowerCase()]?.[name] !== 1),
			);
		}
		if (VOID_ELEMENTS.has(ssr.tag.toLowerCase())) return;

		const text_content = !!content && ssr.names.get(content) === 'textContent';
		const children = content ? [content.value] : element.children;
		for (const child of children) {
			if (!child || child.type === 'JSXText' || child.type === 'Literal') continue;
			if (child.type === 'JSXExpressionContainer') {
				const expression = child.expression;
				// A string or number is written into the template as text.
				if (
					expression.type === 'JSXEmptyExpression' ||
					(expression.type === 'Literal' &&
						(typeof expression.value === 'string' || typeof expression.value === 'number'))
				) {
					continue;
				}
				values.push(text_content ? expression : false);
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
 * A string, number or boolean literal, which the SSR output writes into the
 * template as an attribute.
 *
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_literal(node) {
	return (
		node.type === 'Literal' &&
		(typeof node.value === 'string' ||
			typeof node.value === 'number' ||
			typeof node.value === 'boolean')
	);
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
 * Whether dom-expressions evaluates a host element's attribute value outside
 * the element's own code.
 *
 * @param {string} name
 * @param {AST.Expression} value
 * @param {Set<string>} namespaces
 * @returns {boolean}
 */
function is_host_attribute_deferred(name, value, namespaces) {
	if (name === 'ref') return strip(value, HOST_REF_WRAPPERS)?.type === 'ArrayExpression';
	const expression = strip(value, []);
	if (name.startsWith('on')) return false;
	if (name === 'class' || name === 'className' || name === 'style') {
		return expression?.type !== 'ObjectExpression' || is_dynamic(value, false, namespaces);
	}
	return is_dynamic(value, false, namespaces);
}

/**
 * dom-expressions' test for a value it re-evaluates: one with a call, a
 * member access (other than on a namespace import), a spread or `in`, or with
 * `tags`, an element. Function bodies don't count.
 *
 * @param {AST.Node | null | undefined} node
 * @param {boolean} tags
 * @param {Set<string>} namespaces
 * @returns {boolean}
 */
function is_dynamic(node, tags, namespaces) {
	const expression = strip(node, []);
	if (!expression || isFunctionNode(expression)) return false;
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
		case 'TaggedTemplateExpression':
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
