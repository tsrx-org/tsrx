/** @import * as AST from 'estree' */
/** @import * as ESTreeJSX from 'estree-jsx' */
/** @import { CssPruneDirection, Visitors, TopScopedClasses, StyleClasses } from '../../types/index' */

import { walk } from 'zimmerframe';
import { child_nodes, is_function_node, node_children } from '../utils/ast.js';
import { unescape_css } from '../parse/style.js';
import { regex_whitespaces_strict } from '../utils/patterns.js';

/** @type {CssPruneDirection} */
const FORWARD = 0;
/** @type {CssPruneDirection} */
const BACKWARD = 1;

// this will be set for every prune_css call
// since the code is synchronous, this is safe
/** @type {string} */
let css_hash;
/** @type {string} */
let css_region_hash;
/** @type {StyleClasses} */
let style_identifier_classes;
/** @type {TopScopedClasses} */
let top_scoped_classes;

/**
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.TSRXJSXElement}
 */
function is_native_jsx_element(node) {
	return node?.type === 'JSXElement' && node.metadata?.native_tsrx === true;
}

/**
 * @param {AST.TSRXElementNode} node
 * @returns {ESTreeJSX.TSRXJSXOpeningElement['name']}
 */
function get_element_name(node) {
	return node.openingElement.name;
}

/**
 * @param {AST.TSRXElementNode} node
 * @returns {ESTreeJSX.JSXAttributeNode[]}
 */
function get_element_attributes(node) {
	return node.openingElement.attributes;
}

/**
 * @param {ESTreeJSX.JSXAttribute} attribute
 * @returns {string | null}
 */
function get_attribute_name(attribute) {
	const name = attribute.name;
	return name.type === 'JSXIdentifier' ? name.name : null;
}

/**
 * @param {ESTreeJSX.JSXAttribute} attribute
 * @returns {AST.Expression | ESTreeJSX.JSXEmptyExpression | null}
 */
function get_attribute_value(attribute) {
	const value = attribute.value;
	return value?.type === 'JSXExpressionContainer' ? value.expression : value;
}

/**
 * @param {AST.TSRXElementNode} node
 * @returns {boolean}
 */
function is_dynamic_element(node) {
	// `metadata.dynamicElement` marks lowered dynamic tags; `isDynamic` is the
	// parser flag on a not-yet-lowered `<{expr}>` element. Both resolve their
	// tag at runtime, so they can match any type selector.
	return node.metadata?.dynamicElement === true || node.isDynamic === true;
}

/**
 * Returns true if node is a DOM element (not a component).
 * @param {AST.TSRXElementNode} node
 * @returns {boolean}
 */
function is_element_dom_element(node) {
	const id = get_element_name(node);
	if (id.type !== 'Identifier' && id.type !== 'JSXIdentifier') return false;
	if (id.name[0].toLowerCase() !== id.name[0] || id.name === 'children') return false;
	// Only a plain `Identifier` tag can carry the tracked (`@name`) marker.
	return id.type !== 'Identifier' || !id.tracked;
}

// CSS selector constants
/**
 * @param {number} start
 * @param {number} end
 * @returns {AST.CSS.Combinator}
 */
function create_descendant_combinator(start, end) {
	return { name: ' ', type: 'Combinator', start, end };
}

/**
 * @param {AST.CSS.RelativeSelector} relative_selector
 * @param {AST.CSS.ClassSelector} selector
 * @returns {boolean}
 */
function is_standalone_class_selector(relative_selector, selector) {
	return relative_selector.selectors.length === 1 && relative_selector.selectors[0] === selector;
}

/**`
 * @param {number} start
 * @param {number} end
 * @returns {AST.CSS.RelativeSelector}
 */
function create_nesting_selector(start, end) {
	return {
		type: 'RelativeSelector',
		selectors: [{ type: 'NestingSelector', name: '&', start, end }],
		combinator: null,
		metadata: { is_global: false, is_global_like: false, scoped: false },
		start,
		end,
	};
}

/**
 * @param {number} start
 * @param {number} end
 * @returns {AST.CSS.RelativeSelector}
 */
function create_any_selector(start, end) {
	return {
		type: 'RelativeSelector',
		selectors: [{ type: 'TypeSelector', name: '*', start, end }],
		combinator: null,
		metadata: { is_global: false, is_global_like: false, scoped: false },
		start,
		end,
	};
}

// Whitelist for attribute selectors on specific elements
const whitelist_attribute_selector = new Map([
	['details', ['open']],
	['dialog', ['open']],
	['form', ['novalidate']],
	['iframe', ['allow', 'allowfullscreen', 'allowpaymentrequest', 'loading', 'referrerpolicy']],
	['img', ['loading']],
	[
		'input',
		[
			'accept',
			'autocomplete',
			'capture',
			'checked',
			'disabled',
			'max',
			'maxlength',
			'min',
			'minlength',
			'multiple',
			'pattern',
			'placeholder',
			'readonly',
			'required',
			'size',
			'step',
		],
	],
	['object', ['typemustmatch']],
	['ol', ['reversed', 'start', 'type']],
	['optgroup', ['disabled']],
	['option', ['disabled', 'selected']],
	['script', ['async', 'defer', 'nomodule', 'type']],
	['select', ['disabled', 'multiple', 'required', 'size']],
	[
		'textarea',
		[
			'autocomplete',
			'disabled',
			'maxlength',
			'minlength',
			'placeholder',
			'readonly',
			'required',
			'rows',
			'wrap',
		],
	],
	['video', ['autoplay', 'controls', 'loop', 'muted', 'playsinline']],
]);

// Attributes whose values HTML attribute selectors match ASCII case-insensitively
// unless the selector has the `s` flag
// https://html.spec.whatwg.org/multipage/semantics-other.html#case-sensitivity-of-selectors
const case_insensitive_attributes = new Set([
	'accept',
	'accept-charset',
	'align',
	'alink',
	'axis',
	'bgcolor',
	'charset',
	'checked',
	'clear',
	'codetype',
	'color',
	'compact',
	'declare',
	'defer',
	'dir',
	'direction',
	'disabled',
	'enctype',
	'face',
	'frame',
	'hreflang',
	'http-equiv',
	'lang',
	'language',
	'link',
	'media',
	'method',
	'multiple',
	'nohref',
	'noresize',
	'noshade',
	'nowrap',
	'readonly',
	'rel',
	'rev',
	'rules',
	'scope',
	'scrolling',
	'selected',
	'shape',
	'target',
	'text',
	'type',
	'valign',
	'valuetype',
	'vlink',
]);

/**
 * @param {AST.CSS.ComplexSelector} node
 */
function get_relative_selectors(node) {
	const selectors = truncate(node);

	if (node.metadata.rule?.metadata.parent_rule && selectors.length > 0) {
		let has_explicit_nesting_selector = false;

		// nesting could be inside pseudo classes like :is, :has or :where
		for (let selector of selectors) {
			walk(
				selector,
				null,
				/** @type {Visitors<AST.CSS.Node, null>} */ ({
					NestingSelector() {
						has_explicit_nesting_selector = true;
					},
				}),
			);

			// if we found one we can break from the others
			if (has_explicit_nesting_selector) break;
		}

		if (!has_explicit_nesting_selector) {
			if (selectors[0].combinator === null) {
				selectors[0] = {
					...selectors[0],
					combinator: create_descendant_combinator(selectors[0].start, selectors[0].end),
				};
			}

			selectors.unshift(create_nesting_selector(selectors[0].start, selectors[0].end));
		}
	}

	return selectors;
}

/**
 *
 * @param {AST.CSS.ComplexSelector} node
 * @returns {AST.CSS.RelativeSelector[]}
 */
function truncate(node) {
	const i = node.children.findLastIndex(({ metadata, selectors }) => {
		const first = selectors[0];
		return (
			// not after a :global selector
			!metadata.is_global_like &&
			!(first.type === 'PseudoClassSelector' && first.name === 'global' && first.args === null) &&
			// not a :global(...) without a :has/is/where(...) modifier that is scoped
			!metadata.is_global
		);
	});

	return node.children.slice(0, i + 1).map((child) => {
		// In case of `:root.y:has(...)`, `y` is unscoped, but everything in `:has(...)` should be scoped (if not global).
		// To properly accomplish that, we gotta filter out all selector types except `:has`.
		const root = child.selectors.find((s) => s.type === 'PseudoClassSelector' && s.name === 'root');
		if (!root || child.metadata.is_global_like) return child;

		return {
			...child,
			selectors: child.selectors.filter(
				(s) => s.type === 'PseudoClassSelector' && s.name === 'has',
			),
		};
	});
}

/**
 * @param {AST.CSS.RelativeSelector[]} relative_selectors
 * @param {AST.CSS.Rule} rule
 * @param {AST.TSRXElementNode} element
 * @param {CssPruneDirection} direction
 * @returns {boolean}
 */
function apply_selector(relative_selectors, rule, element, direction) {
	const rest_selectors = relative_selectors.slice();
	const relative_selector = direction === FORWARD ? rest_selectors.shift() : rest_selectors.pop();

	const matched =
		!!relative_selector &&
		relative_selector_might_apply_to_node(relative_selector, rule, element, direction) &&
		apply_combinator(relative_selector, rest_selectors, rule, element, direction);

	if (matched) {
		if (!is_outer_global(relative_selector)) {
			relative_selector.metadata.scoped = true;

			// Store scoped class information on element for language server features
			if (!relative_selector.metadata.is_global && !relative_selector.metadata.is_global_like) {
				// Extract class selectors from the relative selector
				for (const selector of relative_selector.selectors) {
					if (selector.type === 'ClassSelector') {
						const name = unescape_css(selector.name);

						if (!element.metadata.css) {
							element.metadata.css = {
								scopedClasses: new Map(),
								hash: css_hash,
							};
						}

						// Store class name → CSS location in scopedClasses
						if (!element.metadata.css.scopedClasses.has(name)) {
							element.metadata.css.scopedClasses.set(name, {
								start: selector.start,
								end: selector.end,
								selector: selector,
								regionHash: css_region_hash,
							});
						}
					}
				}
			}
		}

		element.metadata.scoped = true;
	}

	return matched;
}

/**
 * @param {AST.TSRXElementNode} node
 * @param {boolean} adjacent_only
 * @returns {AST.TSRXJSXElement[]}
 */
function get_ancestor_elements(node, adjacent_only) {
	/** @type {AST.TSRXJSXElement[]} */
	const ancestors = [];

	const path = node.metadata.path;
	let i = path.length;

	while (i--) {
		const parent = path[i];

		if (is_native_jsx_element(parent)) {
			ancestors.push(parent);
			if (adjacent_only) {
				break;
			}
		}
	}

	return ancestors;
}

/**
 * @param {AST.TSRXElementNode} node
 * @param {boolean} adjacent_only
 * @returns {AST.TSRXJSXElement[]}
 */
function get_descendant_elements(node, adjacent_only) {
	/** @type {AST.TSRXJSXElement[]} */
	const descendants = [];

	/**
	 * @param {AST.Node} current_node
	 * @param {number} depth
	 * @returns {void}
	 */
	function visit(current_node, depth = 0) {
		if (is_native_jsx_element(current_node) && current_node !== node) {
			descendants.push(current_node);
			if (adjacent_only) return; // Only direct children for '>' combinator
		}

		for (const child of node_children(current_node)) {
			visit(child, depth + 1);
		}

		if (current_node.type === 'JSXExpressionContainer') {
			visit(current_node.expression, depth + 1);
		}
	}

	// Start from node's children
	for (const child of node_children(node)) {
		visit(child);
	}

	return descendants;
}

/**
 * Whether an element is a component or a dynamic element, which may render
 * nothing, elements of its own, or the elements passed to it.
 * @param {AST.TSRXElementNode} element
 * @returns {boolean}
 */
function can_render_dynamic_content(element) {
	return is_dynamic_element(element) || !is_element_dom_element(element);
}

// React 19 hoists these into `<head>`, so they may not stay between siblings
const hoisted_element_names = new Set(['title', 'meta', 'link']);

/**
 * The elements a sibling search found, and whether it met something whose
 * place among the siblings it cannot know, so that any sibling may match.
 * @typedef {{ siblings: Set<AST.TSRXJSXElement>, uncertain: boolean }} SiblingSearch
 */

/**
 * The nodes a fragment, `@{ … }` block, control-flow body, or `@case` renders
 * in place, in order, among the siblings around it; `null` for other nodes.
 *
 * @param {AST.Node} node
 * @returns {AST.Node[] | null}
 */
function get_rendered_list(node) {
	switch (node.type) {
		case 'JSXFragment':
			return node_children(node);
		case 'JSXCodeBlock':
			return node.render ? [node.render] : [];
		case 'BlockStatement':
			return node.body;
		case 'SwitchCase':
			return node.consequent;
		default:
			return null;
	}
}

/**
 * The branches a control-flow directive may render, or `null` for other nodes.
 * An `@else if` is an `IfStatement` in the alternate of its `@if`.
 *
 * @param {AST.Node} node
 * @returns {Array<AST.Node | null | undefined> | null}
 */
function get_control_flow_branches(node) {
	switch (node.type) {
		case 'JSXIfExpression':
		case 'IfStatement':
			return [node.consequent, node.alternate];
		case 'JSXForExpression':
			return [node.body, node.empty];
		case 'JSXSwitchExpression':
			return node.cases;
		case 'JSXTryExpression':
			return [node.block, node.pending, node.handler?.body, node.finalizer];
		default:
			return null;
	}
}

/**
 * Add the elements of `list` from `index` on in `direction`, looking into the
 * fragments, `@{ … }` blocks, and control flow there. Text is skipped, since
 * it never separates element siblings.
 *
 * @param {AST.Node[]} list
 * @param {number} index
 * @param {CssPruneDirection} direction
 * @param {boolean} adjacent_only
 * @param {SiblingSearch} search
 * @returns {boolean} whether a `+` search found its sibling and can stop
 */
function add_list_siblings(list, index, direction, adjacent_only, search) {
	const step = direction === FORWARD ? 1 : -1;
	for (let i = index; i >= 0 && i < list.length; i += step) {
		if (add_edge_siblings(list[i], direction, adjacent_only, search) && adjacent_only) {
			return true;
		}
	}
	return false;
}

/**
 * Add the elements `node` renders at its edge that faces back toward the
 * element whose siblings are wanted.
 *
 * @param {AST.Node | null | undefined} node
 * @param {CssPruneDirection} direction
 * @param {boolean} adjacent_only
 * @param {SiblingSearch} search
 * @returns {boolean} whether `node` always renders an element at that edge
 */
function add_edge_siblings(node, direction, adjacent_only, search) {
	if (!node) return false;

	if (is_native_jsx_element(node)) {
		search.siblings.add(node);
		if (can_render_dynamic_content(node)) {
			add_passed_elements(node, search);
			return false;
		}
		const name = get_element_name(node);
		return !(
			(name.type === 'JSXIdentifier' || name.type === 'Identifier') &&
			hoisted_element_names.has(name.name)
		);
	}

	if (node.type === 'JSXExpressionContainer') {
		add_expression_siblings(node.expression, direction, adjacent_only, search);
		return false;
	}

	const list = get_rendered_list(node);
	if (list) {
		const start = direction === FORWARD ? 0 : list.length - 1;
		return add_list_siblings(list, start, direction, adjacent_only, search);
	}

	// Any branch may render, and a directive may render none of them
	for (const branch of get_control_flow_branches(node) ?? []) {
		add_edge_siblings(branch, direction, adjacent_only, search);
	}
	return false;
}

/**
 * Add the template nodes an expression holds, which render in its place
 * when it returns them.
 *
 * @param {AST.Node} node
 * @param {CssPruneDirection} direction
 * @param {boolean} adjacent_only
 * @param {SiblingSearch} search
 * @returns {void}
 */
function add_expression_siblings(node, direction, adjacent_only, search) {
	if (is_function_node(node)) return;
	if (is_native_jsx_element(node) || get_rendered_list(node) || get_control_flow_branches(node)) {
		add_edge_siblings(node, direction, adjacent_only, search);
		return;
	}
	for (const child of child_nodes(node)) {
		add_expression_siblings(child, direction, adjacent_only, search);
	}
}

/**
 * Add the elements passed to a component, as children or in its attributes,
 * which it may render in its own place in any order.
 *
 * @param {AST.Node} node
 * @param {SiblingSearch} search
 * @returns {void}
 */
function add_passed_elements(node, search) {
	for (const child of child_nodes(node)) {
		if (is_function_node(child) || child.type === 'JSXStyleElement') continue;
		if (is_native_jsx_element(child)) {
			search.siblings.add(child);
			if (can_render_dynamic_content(child)) add_passed_elements(child, search);
		} else {
			add_passed_elements(child, search);
		}
	}
}

/**
 * The elements that may render as the siblings of `node` in `direction`, up to
 * its parent element. Fragments, `@{ … }` blocks, and control flow render their
 * contents in place, so siblings are looked for inside and around them. An
 * element inside a component's children, an expression, or an attribute may
 * render anywhere, which makes the search uncertain.
 *
 * @param {AST.TSRXElementNode} node
 * @param {CssPruneDirection} direction
 * @param {boolean} adjacent_only
 * @returns {SiblingSearch}
 */
function get_possible_element_siblings(node, direction, adjacent_only) {
	/** @type {SiblingSearch} */
	const search = { siblings: new Set(), uncertain: false };
	const path = node.metadata?.path ?? [];
	const step = direction === FORWARD ? 1 : -1;
	/** @type {AST.Node} */
	let current = node;

	for (let i = path.length - 1; i >= 0; i -= 1) {
		const parent = path[i];
		const is_element = is_native_jsx_element(parent);
		const list = is_element ? node_children(parent) : get_rendered_list(parent);

		if ((is_element && can_render_dynamic_content(parent)) || (list && !list.includes(current))) {
			search.uncertain = true;
			break;
		}

		if (list) {
			if (add_list_siblings(list, list.indexOf(current) + step, direction, adjacent_only, search)) {
				break;
			}
			if (is_element) break;
		} else if (parent.type === 'JSXForExpression' && current === parent.body) {
			// Another iteration renders the body again on either side
			add_edge_siblings(parent.body, direction, adjacent_only, search);
		} else if (!get_control_flow_branches(parent) && parent.type !== 'CatchClause') {
			search.uncertain = true;
			break;
		}

		current = parent;
	}

	return search;
}

/**
 * @param {AST.CSS.RelativeSelector} relative_selector
 * @param {AST.CSS.RelativeSelector[]} rest_selectors
 * @param {AST.CSS.Rule} rule
 * @param {AST.TSRXElementNode} node
 * @param {CssPruneDirection} direction
 * @returns {boolean}
 */
function apply_combinator(relative_selector, rest_selectors, rule, node, direction) {
	const combinator =
		direction == FORWARD ? rest_selectors[0]?.combinator : relative_selector.combinator;
	if (!combinator) return true;

	switch (combinator.name) {
		case ' ':
		case '>': {
			const is_adjacent = combinator.name === '>';
			const parents =
				direction === FORWARD
					? get_descendant_elements(node, is_adjacent)
					: get_ancestor_elements(node, is_adjacent);
			let parent_matched = false;

			for (const parent of parents) {
				if (apply_selector(rest_selectors, rule, parent, direction)) {
					parent_matched = true;
				}
			}

			return (
				parent_matched ||
				(direction === BACKWARD &&
					(!is_adjacent || parents.length === 0) &&
					rest_selectors.every((selector) => is_global(selector, rule)))
			);
		}

		case '+':
		case '~': {
			const adjacent_only = combinator.name === '+';
			const { siblings, uncertain } = get_possible_element_siblings(node, direction, adjacent_only);

			// Siblings the search cannot know may match the rest of the selector
			let sibling_matched = uncertain;
			if (uncertain) {
				for (const selector of rest_selectors) {
					if (!is_outer_global(selector)) selector.metadata.scoped = true;
				}
			}

			for (const possible_sibling of siblings) {
				if (!can_render_dynamic_content(possible_sibling)) {
					if (apply_selector(rest_selectors, rule, possible_sibling, direction)) {
						sibling_matched = true;
					}
					continue;
				}

				// A component's own elements carry no scope hash, so only a global
				// selector can match them
				if (rest_selectors.length === 0 || !is_global(rest_selectors[0], rule)) continue;
				const remaining = rest_selectors.slice(1);
				if (remaining.length === 0) {
					sibling_matched = true;
					continue;
				}
				// Check whether the elements after the component match the rest
				const after = get_possible_element_siblings(possible_sibling, FORWARD, adjacent_only);
				if (after.uncertain) sibling_matched = true;
				for (const subsequent of after.siblings) {
					if (apply_selector(remaining, rule, subsequent, direction)) {
						sibling_matched = true;
					}
				}
			}

			return (
				sibling_matched ||
				(direction === BACKWARD &&
					get_element_parent(node) === null &&
					rest_selectors.every((selector) => is_global(selector, rule)))
			);
		}

		default:
			// TODO other combinators
			return true;
	}
}

/**
 * @param {AST.TSRXElementNode} node
 * @returns {AST.TSRXJSXElement | null}
 */
function get_element_parent(node) {
	// Check if metadata and path exist
	if (!node.metadata || !node.metadata.path || !node.metadata.path.length) {
		return null;
	}

	let path = node.metadata.path;
	let i = path.length;

	while (i--) {
		const parent = path[i];

		if (is_native_jsx_element(parent)) {
			return parent;
		}
	}

	return null;
}

/**
 * `true` if is a pseudo class that cannot be or is not scoped
 * @param {AST.CSS.SimpleSelector} selector
 * @returns {boolean}
 */
function is_unscoped_pseudo_class(selector) {
	return (
		selector.type === 'PseudoClassSelector' &&
		// These make the selector scoped
		((selector.name !== 'has' &&
			selector.name !== 'is' &&
			selector.name !== 'where' &&
			// :not is special because we want to scope as specific as possible, but because :not
			// inverses the result, we want to leave the unscoped, too. The exception is more than
			// one selector in the :not (.e.g :not(.x .y)), then .x and .y should be scoped
			(selector.name !== 'not' ||
				selector.args === null ||
				selector.args.children.every((c) => c.children.length === 1))) ||
			// selectors with has/is/where/not can also be global if all their children are global
			selector.args === null ||
			selector.args.children.every((c) => c.children.every((r) => is_global_simple(r))))
	);
}

/**
 * True if is `:global(...)` or `:global` and no pseudo class that is scoped.
 * @param {AST.CSS.RelativeSelector} relative_selector
 */
function is_global_simple(relative_selector) {
	const first = relative_selector.selectors[0];

	return (
		first.type === 'PseudoClassSelector' &&
		first.name === 'global' &&
		(first.args === null ||
			// Only these two selector types keep the whole selector global, because e.g.
			// :global(button).x means that the selector is still scoped because of the .x
			relative_selector.selectors.every(
				(selector) =>
					is_unscoped_pseudo_class(selector) || selector.type === 'PseudoElementSelector',
			))
	);
}

/**
 * @param {AST.CSS.RelativeSelector} selector
 * @param {AST.CSS.Rule} rule
 * @return {boolean}
 */
function is_global(selector, rule) {
	if (selector.metadata.is_global || selector.metadata.is_global_like) {
		return true;
	}

	let explicitly_global = false;

	for (const s of selector.selectors) {
		/** @type {AST.CSS.SelectorList | null} */
		let selector_list = null;
		let can_be_global = false;
		let owner = rule;

		if (s.type === 'PseudoClassSelector') {
			if ((s.name === 'is' || s.name === 'where') && s.args) {
				selector_list = s.args;
			} else {
				can_be_global = is_unscoped_pseudo_class(s);
			}
		}

		if (s.type === 'NestingSelector') {
			owner = /** @type {AST.CSS.Rule} */ (rule.metadata.parent_rule);
			selector_list = owner.prelude;
		}

		const has_global_selectors = !!selector_list?.children.some((complex_selector) => {
			return complex_selector.children.every((relative_selector) =>
				is_global(relative_selector, owner),
			);
		});
		explicitly_global ||= has_global_selectors;

		if (!has_global_selectors && !can_be_global) {
			return false;
		}
	}

	return explicitly_global || selector.selectors.length === 0;
}

/**
 * The attribute's value when it is a static string literal, otherwise `null`.
 *
 * @param {ESTreeJSX.JSXAttribute} attribute
 * @returns {string | null}
 */
function get_text_attribute_value(attribute) {
	const value = get_attribute_value(attribute);
	return value?.type === 'Literal' && typeof value.value === 'string' ? value.value : null;
}

/**
 * @param {string | null} operator
 * @param {string} expected_value
 * @param {boolean} case_insensitive
 * @param {string} value
 * @returns {boolean}
 */
function test_attribute(operator, expected_value, case_insensitive, value) {
	if (case_insensitive) {
		expected_value = expected_value.toLowerCase();
		value = value.toLowerCase();
	}
	switch (operator) {
		case '=':
			return value === expected_value;
		case '~=':
			// Split on ASCII whitespace only, as HTML does for class tokens, so a
			// no-break space stays inside its word
			return value.split(regex_whitespaces_strict).includes(expected_value);
		case '|=':
			return `${value}-`.startsWith(`${expected_value}-`);
		case '^=':
			return value.startsWith(expected_value);
		case '$=':
			return value.endsWith(expected_value);
		case '*=':
			return value.includes(expected_value);
		default:
			throw new Error("this shouldn't happen");
	}
}

/**
 * @param {AST.TSRXElementNode} node
 * @param {string} name
 * @param {string | null} expected_value
 * @param {string | null} operator
 * @param {boolean} case_insensitive
 * @returns {boolean}
 */
function attribute_matches(node, name, expected_value, operator, case_insensitive) {
	for (const attribute of get_element_attributes(node)) {
		if (attribute.type === 'JSXSpreadAttribute') return true;

		if (attribute.type !== 'JSXAttribute') continue;

		const lowerCaseName = name.toLowerCase();
		const accepted_names = [lowerCaseName, `$${lowerCaseName}`];
		if (lowerCaseName === 'class') {
			// React-style targets author the class attribute as `className`.
			accepted_names.push('classname');
		}
		const attributeName = get_attribute_name(attribute);
		if (!attributeName || !accepted_names.includes(attributeName.toLowerCase())) {
			continue;
		}

		if (expected_value === null) return true;

		const text_value = get_text_attribute_value(attribute);
		if (text_value !== null) {
			return test_attribute(operator, expected_value, case_insensitive, text_value);
		} else {
			return true;
		}
	}

	return false;
}

/**
 * @param {AST.CSS.RelativeSelector} relative_selector
 * @returns {boolean}
 */
function is_outer_global(relative_selector) {
	const first = relative_selector.selectors[0];

	return (
		first &&
		first.type === 'PseudoClassSelector' &&
		first.name === 'global' &&
		(first.args === null ||
			// Only these two selector types can keep the whole selector global, because e.g.
			// :global(button).x means that the selector is still scoped because of the .x
			relative_selector.selectors.every(
				(selector) =>
					selector.type === 'PseudoClassSelector' || selector.type === 'PseudoElementSelector',
			))
	);
}

/**
 * @param {AST.CSS.RelativeSelector} relative_selector
 * @param {AST.CSS.Rule} rule
 * @param {AST.TSRXElementNode} element
 * @param {CssPruneDirection} direction
 * @return {boolean}
 */
function relative_selector_might_apply_to_node(relative_selector, rule, element, direction) {
	// Sort :has(...) selectors in one bucket and everything else into another
	const has_selectors = [];
	const other_selectors = [];

	for (const selector of relative_selector.selectors) {
		if (selector.type === 'PseudoClassSelector' && selector.name === 'has' && selector.args) {
			has_selectors.push(selector);
		} else {
			other_selectors.push(selector);
		}
	}

	// If we're called recursively from a :has(...) selector, we're on the way of checking if the other selectors match.
	// In that case ignore this check (because we just came from this) to avoid an infinite loop.
	if (has_selectors.length > 0) {
		// If this is a :has inside a global selector, we gotta include the element itself, too,
		// because the global selector might be for an element that's outside the component,
		// e.g. :root:has(.scoped), :global(.foo):has(.scoped), or :root { &:has(.scoped) {} }
		const rules = get_parent_rules(rule);
		const include_self =
			rules.some((r) => r.prelude.children.some((c) => c.children.some((s) => is_global(s, r)))) ||
			rules[rules.length - 1].prelude.children.some((c) =>
				c.children.some((r) =>
					r.selectors.some(
						(s) =>
							s.type === 'PseudoClassSelector' &&
							(s.name === 'root' || (s.name === 'global' && s.args)),
					),
				),
			);

		// :has(...) is special in that it means "look downwards in the CSS tree". Since our matching algorithm goes
		// upwards and back-to-front, we need to first check the selectors inside :has(...), then check the rest of the
		// selector in a way that is similar to ancestor matching. In a sense, we're treating `.x:has(.y)` as `.x .y`.
		for (const has_selector of has_selectors) {
			const complex_selectors = /** @type {AST.CSS.SelectorList} */ (has_selector.args).children;
			let matched = false;

			for (const complex_selector of complex_selectors) {
				const [first, ...rest] = truncate(complex_selector);
				// if it was just a :global(...)
				if (!first) {
					complex_selector.metadata.used = true;
					matched = true;
					continue;
				}

				if (include_self) {
					const selector_including_self = [
						first.combinator ? { ...first, combinator: null } : first,
						...rest,
					];
					if (apply_selector(selector_including_self, rule, element, FORWARD)) {
						complex_selector.metadata.used = true;
						matched = true;
					}
				}

				const selector_excluding_self = [
					create_any_selector(first.start, first.end),
					first.combinator
						? first
						: { ...first, combinator: create_descendant_combinator(first.start, first.end) },
					...rest,
				];
				if (apply_selector(selector_excluding_self, rule, element, FORWARD)) {
					complex_selector.metadata.used = true;
					matched = true;
				}
			}

			if (!matched) {
				return false;
			}
		}
	}

	for (const selector of other_selectors) {
		if (selector.type === 'Percentage' || selector.type === 'Nth') continue;

		const name = unescape_css(selector.name);

		switch (selector.type) {
			case 'PseudoClassSelector': {
				if (name === 'host' || name === 'root') return false;

				if (
					name === 'global' &&
					selector.args !== null &&
					relative_selector.selectors.length === 1
				) {
					const args = selector.args;
					const complex_selector = args.children[0];
					return apply_selector(complex_selector.children, rule, element, BACKWARD);
				}

				// We came across a :global, everything beyond it is global and therefore a potential match
				if (name === 'global' && selector.args === null) return true;

				// :not(...) contents should stay unscoped. Scoping them would achieve the opposite of what we want,
				// because they are then _more_ likely to bleed out of the component. The exception is complex selectors
				// with descendants, in which case we scope them all.
				if (name === 'not' && selector.args) {
					for (const complex_selector of selector.args.children) {
						walk(complex_selector, null, {
							ComplexSelector(node, context) {
								node.metadata.used = true;
								context.next();
							},
						});
						const relative = truncate(complex_selector);

						if (complex_selector.children.length > 1) {
							// foo:not(bar foo) means that bar is an ancestor of foo (side note: ending with foo is the only way the selector make sense).
							// We can't fully check if that actually matches with our current algorithm, so we just assume it does.
							// The result may not match a real element, so the only drawback is the missing prune.
							for (const selector of relative) {
								selector.metadata.scoped = true;
							}

							/** @type {AST.TSRXElementNode | null} */
							let el = element;
							while (el) {
								el.metadata.scoped = true;
								el = get_element_parent(el);
							}
						}
					}

					break;
				}

				if ((name === 'is' || name === 'where') && selector.args) {
					let matched = false;

					for (const complex_selector of selector.args.children) {
						const relative = truncate(complex_selector);
						const is_global = relative.length === 0;

						if (is_global) {
							complex_selector.metadata.used = true;
							matched = true;
						} else if (apply_selector(relative, rule, element, BACKWARD)) {
							complex_selector.metadata.used = true;
							matched = true;
						} else if (complex_selector.children.length > 1 && (name == 'is' || name == 'where')) {
							// foo :is(bar baz) can also mean that bar is an ancestor of foo, and baz a descendant.
							// We can't fully check if that actually matches with our current algorithm, so we just assume it does.
							// The result may not match a real element, so the only drawback is the missing prune.
							complex_selector.metadata.used = true;
							matched = true;
							for (const selector of relative) {
								selector.metadata.scoped = true;
							}
						}
					}

					if (!matched) {
						return false;
					}
				}

				break;
			}

			case 'PseudoElementSelector': {
				break;
			}

			case 'AttributeSelector': {
				const element_name = get_element_name(element);
				const whitelisted =
					element_name?.type === 'Identifier' || element_name?.type === 'JSXIdentifier'
						? whitelist_attribute_selector.get(element_name.name.toLowerCase())
						: undefined;
				const flags = selector.flags?.toLowerCase() ?? '';
				const case_insensitive =
					flags.includes('i') ||
					(!flags.includes('s') && case_insensitive_attributes.has(name.toLowerCase()));
				if (
					!whitelisted?.includes(name.toLowerCase()) &&
					!attribute_matches(
						element,
						name,
						selector.value && unescape_css(selector.value),
						selector.matcher,
						case_insensitive,
					)
				) {
					return false;
				}
				break;
			}

			case 'ClassSelector': {
				if (
					!attribute_matches(element, 'class', name, '~=', false) &&
					(!style_identifier_classes.has(name) ||
						!is_standalone_class_selector(relative_selector, selector))
				) {
					return false;
				}

				break;
			}

			case 'IdSelector': {
				if (!attribute_matches(element, 'id', name, '=', false)) {
					return false;
				}

				break;
			}

			case 'TypeSelector': {
				if (is_dynamic_element(element)) {
					break;
				}

				const element_name = get_element_name(element);
				if (
					(element_name?.type === 'Identifier' || element_name?.type === 'JSXIdentifier') &&
					element_name.name.toLowerCase() !== name.toLowerCase() &&
					name !== '*'
				) {
					return false;
				}

				break;
			}

			case 'NestingSelector': {
				let matched = false;

				const parent = /** @type {AST.CSS.Rule} */ (rule.metadata.parent_rule);

				for (const complex_selector of parent.prelude.children) {
					if (
						apply_selector(get_relative_selectors(complex_selector), parent, element, direction) ||
						complex_selector.children.every((s) => is_global(s, parent))
					) {
						complex_selector.metadata.used = true;
						matched = true;
					}
				}

				if (!matched) {
					return false;
				}

				break;
			}
		}
	}

	// possible match
	return true;
}

/**
 * @param {AST.CSS.Rule} rule
 * @returns {AST.CSS.Rule[]}
 */
function get_parent_rules(rule) {
	const rules = [rule];
	let current = rule;

	while (current.metadata.parent_rule) {
		current = current.metadata.parent_rule;
		rules.unshift(current);
	}

	return rules;
}

/**
 * Check if a CSS rule contains animation or animation-name properties
 * @param {AST.CSS.Rule} rule
 * @returns {boolean}
 */
function rule_has_animation(rule) {
	if (!rule.block) return false;

	for (const child of rule.block.children) {
		if (child.type === 'Declaration') {
			const prop = child.property?.toLowerCase();
			if (prop === 'animation' || prop === 'animation-name') {
				return true;
			}
		}
	}

	return false;
}

/**
 * @param {AST.CSS.StyleSheet} css
 * @param {AST.TSRXElementNode} element
 * @param {StyleClasses} styleClasses
 * @param {TopScopedClasses} topScopedClasses
 * @param {string} [regionHash]
 * @return {void}
 */
export function prune_css(css, element, styleClasses, topScopedClasses, regionHash = css.hash) {
	css_hash = css.hash;
	css_region_hash = regionHash;
	style_identifier_classes = styleClasses;
	top_scoped_classes = topScopedClasses;

	/** @type {Visitors<AST.CSS.Node, null>} */
	const visitors = {
		Rule(node, context) {
			if (node.metadata.is_global_block) {
				context.visit(node.prelude);
			} else {
				context.next();
			}
		},
		ComplexSelector(node, context) {
			const selectors = get_relative_selectors(node);

			const rule = /** @type {AST.CSS.Rule} */ (node.metadata.rule);

			if (apply_selector(selectors, rule, element, BACKWARD) || rule_has_animation(rule)) {
				node.metadata.used = true;
			}

			// Populate top_scoped_classes for truly standalone class selectors.
			// A class is standalone only when the entire effective selector chain (after resolving
			// nesting and stripping :global) is a single RelativeSelector with a single ClassSelector.
			// This prevents classes from compound selectors like `.wrapper .nested` or selectors
			// inside :global() from being exported through style expression maps.
			if (selectors.length === 1) {
				const sole_selector = selectors[0];
				if (
					!sole_selector.metadata.is_global &&
					!sole_selector.metadata.is_global_like &&
					sole_selector.selectors.length === 1 &&
					sole_selector.selectors[0].type === 'ClassSelector'
				) {
					const class_selector = sole_selector.selectors[0];
					const name = unescape_css(class_selector.name);
					if (!top_scoped_classes.has(name)) {
						top_scoped_classes.set(name, {
							start: class_selector.start,
							end: class_selector.end,
							selector: class_selector,
							regionHash: css_region_hash,
						});
					}
				}
			}

			context.next();
		},
		PseudoClassSelector(node, context) {
			// Visit nested selectors inside :has(), :is(), :where(), and :not()
			if (
				(node.name === 'has' ||
					node.name === 'is' ||
					node.name === 'where' ||
					node.name === 'not') &&
				node.args
			) {
				context.next();
			}
		},
	};

	walk(css, null, visitors);
}
