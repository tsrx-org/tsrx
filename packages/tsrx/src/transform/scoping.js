/**
 * Framework-agnostic CSS scoping utilities shared between the `@tsrx/react`
 * and `@tsrx/solid` transforms. These walk the template AST and annotate
 * template nodes with a hash class so scope-qualified selectors (e.g.
 * `.foo.hash`) match after rendering.
 */

/** @import * as AST from 'estree' */
/** @import * as ESTreeJSX from 'estree-jsx' */
/** @import { ScopeClassParts, StyleRenderMode, Visitors } from '../../types/index' */

import { walk } from 'zimmerframe';
import * as b from '../utils/builders.js';
import { is_ast_node, is_style_element } from '../utils/ast.js';

export { is_style_element };

/**
 * Mark selectors inside the stylesheet as "used" so `renderStylesheets` does
 * not comment them out, and mark every non-global relative selector as
 * scoped. Both render modes (D4) keep every selector:
 *
 * - `scope`: a standalone `<style>` block. Every selector is marked; we
 *   skip selector-pruning because component boundaries can be dynamic — any
 *   selector authored inside a scope's `<style>` block is considered
 *   intentional.
 * - `theme`: an assigned block. Every selector is kept and hash-scoped:
 *   `$class` is an ordinary value that reaches elements through any
 *   JavaScript path (destructuring, props, return values), and `apply` stamps
 *   it on scopes in other modules, so no element set can prune against.
 *
 * `class-map` and the boolean form (`true` → assigned, `false` → `scope`) are
 * kept for consumers compiled against earlier releases. An assigned block is
 * never pruned, so both render as `theme`.
 *
 * @param {AST.CSS.StyleSheet} stylesheet
 * @param {StyleRenderMode | boolean} [mode]
 * @returns {AST.CSS.StyleSheet}
 */
export function prepare_stylesheet_for_render(stylesheet, mode = 'scope') {
	walk(
		/** @type {AST.CSS.Node} */ (stylesheet),
		null,
		/** @type {Visitors<AST.CSS.Node, null>} */ ({
			_(node, { next }) {
				if (node.type === 'ComplexSelector') {
					node.metadata.used = true;
				} else if (node.type === 'RelativeSelector' && !node.metadata.is_global) {
					node.metadata.scoped = true;
				}
				return next();
			},
		}),
	);
	return stylesheet;
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
export function is_composite_jsx_element(node) {
	if (node?.type !== 'JSXElement') {
		return false;
	}

	const name = node.openingElement?.name;
	if (!name) {
		return false;
	}

	if (name.type === 'JSXIdentifier') {
		return /^[A-Z]/.test(name.name);
	}

	return name.type === 'JSXMemberExpression';
}

/**
 * Recursively walk native JSX nodes within a TSRX fragment and add the hash
 * class name so scope-qualified selectors (e.g. `.foo.hash`) match.
 *
 * @param {AST.Node} node
 * @param {string} hash
 * @param {'class' | 'className'} [jsx_class_attr_name='class']
 * @param {boolean} [preserve_style_elements=false]
 * @returns {AST.Node | null}
 */
export function annotate_with_hash(
	node,
	hash,
	jsx_class_attr_name = 'class',
	preserve_style_elements = false,
) {
	if (!node || typeof node !== 'object') return node;
	if (
		(node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression') &&
		// Generated dynamic-tag wrappers are render-block closures, not user
		// component boundaries — the element inside still belongs to this
		// component's scoped CSS.
		node.metadata?.tsrx_dynamic_wrapper !== true
	) {
		return node;
	}

	if (node.type === 'JSXElement') {
		const element = /** @type {AST.TSRXJSXElement} */ (node);
		if (!is_composite_jsx_element(element) || element.metadata?.dynamicElement) {
			add_hash_class(element, hash, jsx_class_attr_name);
		}
		element.children = element.children
			.map((child) => annotate_with_hash(child, hash, jsx_class_attr_name, preserve_style_elements))
			.filter((child) => child !== null);
		return element;
	}

	if (is_style_element(node)) {
		if (preserve_style_elements) {
			node.children = [];
			return node;
		}
		return null;
	}

	const entries = /** @type {Record<string, unknown>} */ (node);
	for (const key of Object.keys(entries)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata' || key === 'css') {
			continue;
		}

		const value = entries[key];
		if (Array.isArray(value)) {
			entries[key] = value.map((child) =>
				is_ast_node(child)
					? annotate_with_hash(child, hash, jsx_class_attr_name, preserve_style_elements)
					: child,
			);
		} else if (is_ast_node(value)) {
			entries[key] = annotate_with_hash(value, hash, jsx_class_attr_name, preserve_style_elements);
		}
	}

	return node;
}

/**
 * @param {{ body: AST.Node[] }} component a node whose `body` holds the
 *   component's template children
 * @param {string} hash
 * @param {'class' | 'className'} [jsx_class_attr_name='class']
 * @param {boolean} [preserve_style_elements=false]
 * @returns {void}
 */
export function annotate_component_with_hash(
	component,
	hash,
	jsx_class_attr_name = 'class',
	preserve_style_elements = false,
) {
	component.body = component.body
		.filter((child) => preserve_style_elements || !is_style_element(child))
		.map((child) => annotate_with_hash(child, hash, jsx_class_attr_name, preserve_style_elements))
		.filter((child) => child !== null);
}

/**
 * The element's `class`/`className` attribute, if it has a static-named one.
 *
 * @param {ESTreeJSX.JSXAttributeNode} attr
 * @returns {attr is ESTreeJSX.JSXAttribute}
 */
function is_class_attribute(attr) {
	return (
		attr.type === 'JSXAttribute' &&
		attr.name.type === 'JSXIdentifier' &&
		(attr.name.name === 'class' || attr.name.name === 'className')
	);
}

/**
 * The authored class value of an attribute as an expression, or `null` when
 * the attribute has no usable value (`<div class>`, `class={}`).
 *
 * @param {ESTreeJSX.JSXAttribute | undefined} attr
 * @returns {AST.Expression | null}
 */
function class_attribute_base(attr) {
	const value = attr?.value;
	if (!value) return null;
	const expression = value.type === 'JSXExpressionContainer' ? value.expression : value;
	if (expression.type === 'JSXEmptyExpression') return null;
	return /** @type {AST.Expression} */ (expression);
}

/**
 * Build one attribute value from the accumulated parts — `authored hashes…
 * applied…` — as a single string literal when everything is static,
 * otherwise as one template literal (never a template literal nested in
 * another across repeated stamping).
 *
 * @param {ScopeClassParts} parts
 * @returns {AST.Expression}
 */
function build_scope_class_value(parts) {
	const { base, hashes, applied } = parts;
	const base_literal = base?.type === 'Literal' && typeof base.value === 'string' ? base : null;
	/** @type {Array<string | AST.Expression>} */
	const sequence = [];
	if (base_literal) sequence.push(/** @type {string} */ (base_literal.value));
	else if (base) sequence.push(base);
	sequence.push(...hashes, ...applied);

	/** @type {AST.TemplateElement[]} */
	const quasis = [];
	/** @type {AST.Expression[]} */
	const expressions = [];
	/** @type {string} */
	let text = '';
	for (const part of sequence) {
		if (typeof part === 'string') {
			if (part) text = text ? `${text} ${part}` : part;
			continue;
		}
		const between = expressions.length > 0;
		quasis.push(b.quasi(text ? (between ? ` ${text} ` : `${text} `) : between ? ' ' : '', false));
		expressions.push(part);
		text = '';
	}

	if (expressions.length === 0) {
		// Keep the authored literal's position so editor mappings survive.
		return base_literal
			? { ...base_literal, value: text, raw: JSON.stringify(text) }
			: b.literal(text, JSON.stringify(text));
	}
	quasis.push(b.quasi(text ? ` ${text}` : '', true));
	return b.template(quasis, expressions);
}

/**
 * Stamp a scope's classes on an element, copy-on-write. The parts live on the
 * element's (shared) metadata so an enclosing scope's stamp and a nested
 * scope's stamp accumulate into one value: `authored hashes… applied…`, with
 * every applied theme after every scope hash regardless of which scope
 * applied it.
 *
 * @template {AST.TSRXJSXElement} T
 * @param {T} element
 * @param {string[]} hashes scope hashes to add
 * @param {Array<string | AST.Expression>} applied theme classes: literals or `theme.$class` reads
 * @param {'class' | 'className'} [class_attr_name='class']
 * @returns {T}
 */
export function add_scope_classes(element, hashes, applied, class_attr_name = 'class') {
	if (hashes.length === 0 && applied.length === 0) return element;
	const attrs = element.openingElement.attributes ?? [];
	const index = attrs.findIndex(is_class_attribute);
	const existing = index === -1 ? undefined : /** @type {ESTreeJSX.JSXAttribute} */ (attrs[index]);
	const metadata = element.metadata || (element.metadata = { path: [] });
	const parts =
		metadata.tsrx_scope_class ||
		(metadata.tsrx_scope_class = {
			base: class_attribute_base(existing),
			hashes: [],
			applied: [],
		});
	for (const hash of hashes) {
		if (!parts.hashes.includes(hash)) parts.hashes.push(hash);
	}
	for (const part of applied) {
		if (typeof part !== 'string' || !parts.applied.includes(part)) parts.applied.push(part);
	}

	const value = build_scope_class_value(parts);
	const attr_value =
		value.type === 'Literal' && typeof value.value === 'string'
			? value
			: b.jsx_expression_container(value);
	const next_attrs = attrs.slice();
	if (existing) {
		next_attrs[index] = { ...existing, value: attr_value };
	} else {
		next_attrs.push(b.jsx_attribute(b.jsx_id(class_attr_name), attr_value));
	}
	return {
		...element,
		openingElement: { ...element.openingElement, attributes: next_attrs },
	};
}

/**
 * Ensure the element carries a class attribute containing the scoping hash,
 * in place. Kept for consumers that stamp one hash at a time; the scope
 * pre-pass uses {@link add_scope_classes}.
 *
 * @param {AST.TSRXJSXElement} element
 * @param {string} hash
 * @param {'class' | 'className'} [class_attr_name='class']
 * @returns {void}
 */
export function add_hash_class(element, hash, class_attr_name = 'class') {
	const stamped = add_scope_classes(element, [hash], [], class_attr_name);
	element.openingElement = stamped.openingElement;
}
