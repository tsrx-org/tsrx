/**
 * Framework-agnostic CSS scoping utilities shared between the `@tsrx/react`
 * and `@tsrx/solid` transforms. These walk the template AST and annotate
 * template nodes with a hash class so scope-qualified selectors (e.g.
 * `.foo.hash`) match after rendering.
 */

/** @import * as AST from 'estree' */
/** @import * as ESTreeJSX from 'estree-jsx' */
/** @import { ScopeClassJoin, ScopeClassParts, SpreadClassOptions, StyleRenderMode, Visitors } from '../../types/index' */

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
 * Compile each intrinsic element's authored `className` attribute to `class`,
 * for a runtime that reads a class only from `class` (the platform's
 * `jsx.rewriteClassNameAttr`). A component, a member tag (`<ui.Button>`) and
 * a dynamic tag (`<{Tag}>`) may be a component, so they keep `className`.
 *
 * An element with one `class` and one `className` joins them into the first
 * one's place: as one string literal when both are string literals, otherwise
 * as `[class, className]` in written order. With a spread between them, the
 * runtime output renames `className` in place instead, so the runtime handles
 * two `class` attributes around the spread as written; the type-only print
 * joins them anyway, since TypeScript reports two `class` attributes even
 * across a spread. Any other `className` is renamed in place. Copy-on-write.
 *
 * @template {AST.Node} T
 * @param {T} node
 * @param {boolean} [type_only]
 * @param {Set<object>} [seen]
 * @returns {T}
 */
export function rewrite_class_name_attributes(node, type_only = false, seen = new Set()) {
	if (seen.has(node)) return node;
	seen.add(node);

	const source = /** @type {Record<string, any>} */ (node);
	/** @type {Record<string, any>} */
	let out = source;
	for (const key of Object.keys(source)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
		const value = source[key];
		/** @type {unknown} */
		let next = value;
		if (Array.isArray(value)) {
			const mapped = value.map((entry) =>
				is_ast_node(entry) ? rewrite_class_name_attributes(entry, type_only, seen) : entry,
			);
			if (mapped.some((entry, index) => entry !== value[index])) next = mapped;
		} else if (is_ast_node(value)) {
			next = rewrite_class_name_attributes(value, type_only, seen);
		}
		if (next !== value) {
			if (out === source) out = { ...source };
			out[key] = next;
		}
	}

	if (out.type === 'JSXElement' && is_intrinsic_jsx_element(out)) {
		const attributes = out.openingElement.attributes ?? [];
		const merged = merge_class_name_attribute(attributes, type_only);
		if (merged !== attributes) {
			out = { ...out, openingElement: { ...out.openingElement, attributes: merged } };
		}
	}
	return /** @type {T} */ (out);
}

/**
 * Whether a JSX element is surely an intrinsic one: its tag is a lowercase
 * name or a namespaced name, and not a dynamic `<{Tag}>`.
 *
 * @param {Record<string, any>} element
 * @returns {boolean}
 */
function is_intrinsic_jsx_element(element) {
	if (element.isDynamic === true || element.metadata?.dynamicElement === true) return false;
	const name = element.openingElement?.name;
	return (
		name?.type === 'JSXNamespacedName' ||
		(name?.type === 'JSXIdentifier' && /^[a-z]/.test(name.name))
	);
}

/**
 * @param {ESTreeJSX.JSXAttributeNode[]} attributes
 * @param {boolean} type_only
 * @returns {ESTreeJSX.JSXAttributeNode[]}
 */
function merge_class_name_attribute(attributes, type_only) {
	/** @type {number[]} */
	const class_indexes = [];
	/** @type {number[]} */
	const class_name_indexes = [];
	for (let i = 0; i < attributes.length; i++) {
		const attr = attributes[i];
		if (!is_class_attribute(attr)) continue;
		if (/** @type {ESTreeJSX.JSXIdentifier} */ (attr.name).name === 'className') {
			class_name_indexes.push(i);
		} else {
			class_indexes.push(i);
		}
	}
	if (class_name_indexes.length === 0) return attributes;

	const pair = class_indexes.length === 1 && class_name_indexes.length === 1;
	const low = Math.min(class_indexes[0], class_name_indexes[0]);
	const high = Math.max(class_indexes[0], class_name_indexes[0]);
	const spread_between =
		pair && attributes.slice(low + 1, high).some((attr) => attr.type === 'JSXSpreadAttribute');
	if (!pair || (spread_between && !type_only)) {
		return attributes.map((attr, i) =>
			class_name_indexes.includes(i)
				? /** @type {ESTreeJSX.JSXAttribute} */ ({
						...attr,
						name: class_name_to_class(
							/** @type {ESTreeJSX.JSXIdentifier} */ (
								/** @type {ESTreeJSX.JSXAttribute} */ (attr).name
							),
						),
					})
				: attr,
		);
	}

	const first = /** @type {ESTreeJSX.JSXAttribute} */ (attributes[low]);
	const second = /** @type {ESTreeJSX.JSXAttribute} */ (attributes[high]);
	const first_name = /** @type {ESTreeJSX.JSXIdentifier} */ (first.name);
	const renamed = first_name.name === 'className' ? class_name_to_class(first_name) : first_name;
	// The second attribute's name maps to the surviving `class` too, so the
	// editor keeps hover and navigation on it.
	const name = {
		...renamed,
		metadata: {
			...renamed.metadata,
			extra_source_mappings: [...(renamed.metadata?.extra_source_mappings ?? []), second.name],
		},
	};
	const values = [class_attribute_base(first), class_attribute_base(second)].filter(
		(value) => value !== null,
	);
	/** @type {ESTreeJSX.JSXAttribute['value']} */
	let value;
	if (values.every((value) => value.type === 'Literal' && typeof value.value === 'string')) {
		const text = values
			.map((value) => /** @type {string} */ (/** @type {AST.Literal} */ (value).value))
			.filter(Boolean)
			.join(' ');
		value = b.literal(text, JSON.stringify(text));
	} else {
		value = b.jsx_expression_container(b.array(values));
	}
	const merged = /** @type {ESTreeJSX.JSXAttribute} */ ({ ...first, name, value });
	return attributes.flatMap((attr, i) => (i === low ? [merged] : i === high ? [] : [attr]));
}

/**
 * A `className` attribute name renamed to `class`, which the editor maps back
 * to the authored `className`.
 *
 * @param {ESTreeJSX.JSXIdentifier} name
 * @returns {ESTreeJSX.JSXIdentifier}
 */
function class_name_to_class(name) {
	return {
		...name,
		name: 'class',
		metadata: { ...name.metadata, source_name: 'className', source_length: 9 },
	};
}

/**
 * Internal name of the `join_scope_class` runtime helper.
 */
export const JOIN_SCOPE_CLASS_INTERNAL_NAME = '__join_scope_class';

/**
 * Whether a class expression always evaluates to a string, so it can join the
 * scope classes as text. A `$class` read is a style block's class string.
 *
 * @param {AST.Expression} node
 * @returns {boolean}
 */
function is_string_class(node) {
	switch (node.type) {
		case 'Literal':
			return typeof node.value === 'string';
		case 'TemplateLiteral':
			return true;
		case 'ConditionalExpression':
			return is_string_class(node.consequent) && is_string_class(node.alternate);
		case 'BinaryExpression':
			return (
				node.operator === '+' &&
				((node.left.type !== 'PrivateIdentifier' && is_string_class(node.left)) ||
					is_string_class(node.right))
			);
		case 'MemberExpression':
			return (
				!node.computed && node.property.type === 'Identifier' && node.property.name === '$class'
			);
		default:
			return false;
	}
}

/**
 * Build one attribute value from the accumulated parts — `authored hashes…
 * applied…` — as a single string literal when everything is static,
 * otherwise as one template literal (never a template literal nested in
 * another across repeated stamping).
 *
 * With `join`, an authored class that may not be a string joins the scope
 * classes through `join_scope_class`, which renders it as a runtime of that
 * kind would: it leaves out a class the runtime would not render, and keeps
 * an object or a list class for a runtime whose class takes one.
 *
 * @param {ScopeClassParts} parts
 * @param {ScopeClassJoin} [join=null]
 * @returns {AST.Expression}
 */
function build_scope_class_value(parts, join = null) {
	const { base, hashes, applied } = parts;
	if (base && join && !is_string_class(base)) {
		const scope_class = build_scope_class_value({ ...parts, base: null });
		return join === 'text'
			? b.call(JOIN_SCOPE_CLASS_INTERNAL_NAME, base, scope_class)
			: b.call(
					JOIN_SCOPE_CLASS_INTERNAL_NAME,
					base,
					scope_class,
					b.literal(join, JSON.stringify(join)),
				);
	}
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
 * With `spread_class`, a spread written after the class attribute keeps its
 * own class: the stamped attribute goes ahead of the spreads, and each spread
 * after it joins its class with the scope classes at runtime. Where the
 * runtime reads both class props, a spread written before the attribute drops
 * its class, which the attribute replaces.
 *
 * @template {AST.TSRXJSXElement} T
 * @param {T} element
 * @param {string[]} hashes scope hashes to add
 * @param {Array<string | AST.Expression>} applied theme classes: literals or `theme.$class` reads
 * @param {'class' | 'className'} [class_attr_name='class']
 * @param {SpreadClassOptions | null} [spread_class]
 * @param {ScopeClassJoin} [class_join=null] how the runtime renders an authored
 *   class that may not be a string; `'list'` applies to a `class` attribute
 *   only
 * @returns {T}
 */
export function add_scope_classes(
	element,
	hashes,
	applied,
	class_attr_name = 'class',
	spread_class = null,
	class_join = null,
) {
	if (hashes.length === 0 && applied.length === 0) return element;
	const attrs = element.openingElement.attributes ?? [];
	// Of several class attributes, a runtime that reads a spread's class
	// itself (`spread_class`) applies the last one written, so that one gets
	// the scope classes. Vue's `mergeProps` joins them all, so the first does.
	let index = -1;
	for (let i = 0; i < attrs.length; i++) {
		if (is_class_attribute(attrs[i]) && (index === -1 || spread_class)) index = i;
	}
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

	const name = existing
		? /** @type {ESTreeJSX.JSXIdentifier} */ (existing.name).name
		: class_attr_name;
	const value = build_scope_class_value(
		parts,
		class_join === 'list' && name !== 'class' ? null : class_join,
	);
	const attr_value =
		value.type === 'Literal' && typeof value.value === 'string'
			? value
			: b.jsx_expression_container(value);
	const next_attrs = attrs.slice();
	let class_index = index;
	if (existing) {
		next_attrs[index] = { ...existing, value: attr_value };
	} else {
		// Ahead of the spreads, the attribute is what a spread's class replaces.
		const first_spread = spread_class ? attrs.findIndex(is_spread_attribute) : -1;
		class_index = first_spread === -1 ? attrs.length : first_spread;
		next_attrs.splice(class_index, 0, b.jsx_attribute(b.jsx_id(class_attr_name), attr_value));
	}
	if (spread_class) {
		merge_spread_classes(next_attrs, class_index, parts, name, spread_class);
	}
	return {
		...element,
		openingElement: { ...element.openingElement, attributes: next_attrs },
	};
}

/**
 * Internal name of the `merge_spread_class` runtime helper.
 */
export const MERGE_SPREAD_CLASS_INTERNAL_NAME = '__merge_spread_class';

/**
 * Wrap each spread after the class attribute in `merge_spread_class`, which
 * joins a class the spread passes with the scope classes, so the spread
 * replaces only the authored class, as in plain JSX.
 *
 * @param {ESTreeJSX.JSXAttributeNode[]} attrs the element's copied attributes
 * @param {number} class_index
 * @param {ScopeClassParts} parts
 * @param {string} class_attr_name the class attribute's name
 * @param {SpreadClassOptions} spread_class
 */
function merge_spread_classes(attrs, class_index, parts, class_attr_name, spread_class) {
	const { props, kind } = spread_class;
	const scope_class = build_scope_class_value({ ...parts, base: null });
	// A runtime that reads either prop gets the spread's class under the
	// attribute's name, so the element keeps one class prop.
	const key = props.length === 1 ? props[0] : class_attr_name;
	const alias = props.find((prop) => prop !== key);
	for (let i = 0; i < attrs.length; i++) {
		const attr = attrs[i];
		if (attr.type !== 'JSXSpreadAttribute') continue;
		// The attribute replaces a class an earlier spread passes under its
		// name, but not under the alias, which the spread then drops.
		const before = i < class_index;
		if (before && !alias) continue;
		// A nested scope stamps the element again: wrap the authored argument.
		const argument = is_merge_spread_class_call(attr.argument)
			? /** @type {AST.Expression} */ (attr.argument.arguments[0])
			: attr.argument;
		attrs[i] = {
			...attr,
			argument: b.call(
				MERGE_SPREAD_CLASS_INTERNAL_NAME,
				argument,
				before ? b.literal(null, 'null') : scope_class,
				b.literal(key, JSON.stringify(key)),
				alias && b.literal(alias, JSON.stringify(alias)),
				!before && kind !== null && kind !== 'text' && b.literal(kind, JSON.stringify(kind)),
			),
		};
	}
}

/**
 * Whether stamping joined the element's class through `join_scope_class`.
 *
 * @param {AST.TSRXJSXElement} element
 * @returns {boolean}
 */
export function has_scope_class_join(element) {
	return (element.openingElement.attributes ?? []).some(
		(attr) =>
			is_class_attribute(attr) &&
			attr.value?.type === 'JSXExpressionContainer' &&
			attr.value.expression.type === 'CallExpression' &&
			attr.value.expression.callee.type === 'Identifier' &&
			attr.value.expression.callee.name === JOIN_SCOPE_CLASS_INTERNAL_NAME,
	);
}

/**
 * Whether stamping wrapped one of the element's spreads in `merge_spread_class`.
 *
 * @param {AST.TSRXJSXElement} element
 * @returns {boolean}
 */
export function has_spread_class_merge(element) {
	return (element.openingElement.attributes ?? []).some(
		(attr) => attr.type === 'JSXSpreadAttribute' && is_merge_spread_class_call(attr.argument),
	);
}

/**
 * @param {AST.Expression} node
 * @returns {node is AST.SimpleCallExpression}
 */
function is_merge_spread_class_call(node) {
	return (
		node.type === 'CallExpression' &&
		node.callee.type === 'Identifier' &&
		node.callee.name === MERGE_SPREAD_CLASS_INTERNAL_NAME
	);
}

/**
 * @param {ESTreeJSX.JSXAttributeNode} attr
 * @returns {attr is ESTreeJSX.JSXSpreadAttribute}
 */
function is_spread_attribute(attr) {
	return attr.type === 'JSXSpreadAttribute';
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
