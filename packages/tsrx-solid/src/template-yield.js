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
	/** @type {AST.YieldExpression[]} */
	const found = [];
	const namespaces = collect_namespace_imports(program);

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

		for (const attribute of opening.attributes) {
			if (attribute.type === 'JSXSpreadAttribute') {
				visit_value(attribute.argument, context, is_dynamic(attribute.argument, false, namespaces));
				continue;
			}
			const value = attribute.value;
			if (value?.type !== 'JSXExpressionContainer') {
				if (value) visit_value(value, context, false);
				continue;
			}
			const expression = /** @type {AST.Expression} */ (value.expression);
			visit_value(
				expression,
				context,
				is_host_attribute_deferred(attribute_name(attribute.name), expression, namespaces),
			);
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
