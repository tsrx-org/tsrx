/** @import * as AST from 'estree' */
/** @import { CompileError } from '../../types/index' */
/** @import { Diagnostic } from '../diagnostics.js' */

import { walk } from 'zimmerframe';
import { error } from '../errors.js';
import { TSRX_ERRORS } from '../diagnostics.js';
import { css_node_source_position } from '../parse/style.js';

/**
 * True if is `:global` without arguments
 * @param {AST.CSS.SimpleSelector} simple_selector
 */
function is_global_block_selector(simple_selector) {
	return (
		simple_selector.type === 'PseudoClassSelector' &&
		simple_selector.name === 'global' &&
		simple_selector.args === null
	);
}

/**
 * True if is `:global(...)` or `:global` and no pseudo class that is scoped.
 * @param {AST.CSS.RelativeSelector} relative_selector
 */
function is_global(relative_selector) {
	const first = relative_selector.selectors[0];

	return (
		first?.type === 'PseudoClassSelector' &&
		first.name === 'global' &&
		(first.args === null ||
			// Only these two selector types keep the whole selector global, because e.g.
			// :global(button).x means that the selector is still scoped because of the .x
			relative_selector.selectors.every(
				(selector) =>
					selector.type === 'PseudoClassSelector' || selector.type === 'PseudoElementSelector',
			))
	);
}

/**
 * A selector that starts with a bare `:global` makes its rule a global block:
 * the output scopes nothing in it, its selectors and the rules nested in it
 * alike. So report, as Svelte does:
 *
 * - a lone `:global` (the `:global { ... }` block) in a list of several, whose
 *   selector can't be dropped on its own (`:global, .a { ... }`), and
 * - outside another global block, a selector that doesn't start with a bare
 *   `:global` beside one that does, when it or a rule nested in the rule would
 *   be scoped on its own (`.a, :global .b`). `:global.a, :global(.b)` and
 *   `.p { :global .a, &.b { ... } }` compile.
 *
 * Runs once the rule's selectors and nested rules have their metadata.
 *
 * @param {AST.CSS.Rule} rule
 * @param {(diagnostic: Diagnostic, node: AST.CSS.Node) => void} report
 */
function check_global_block_list(rule, report) {
	const selectors = rule.prelude.children;
	if (selectors.length < 2) return;
	const leading = selectors.map((selector) => {
		const first = selector.children[0]?.selectors[0];
		return first && is_global_block_selector(first) ? first : null;
	});
	const lone = selectors.findIndex(
		(selector, index) =>
			leading[index] &&
			selector.children.length === 1 &&
			selector.children[0].selectors.length === 1,
	);
	if (lone !== -1) {
		report(TSRX_ERRORS.CSS_GLOBAL_BLOCK_NOT_ALONE, /** @type {AST.CSS.Node} */ (leading[lone]));
		return;
	}
	if (!leading.includes(null)) return;
	for (let parent = rule.metadata.parent_rule; parent; parent = parent.metadata.parent_rule) {
		if (parent.metadata.is_global_block) return;
	}
	if (
		(has_declaration(rule.block) &&
			selectors.some((selector, index) => !leading[index] && !is_unscoped(selector))) ||
		nests_scoped(rule.block)
	) {
		report(
			TSRX_ERRORS.CSS_GLOBAL_BLOCK_IN_MIXED_LIST,
			/** @type {AST.CSS.Node} */ (leading.find((first) => first)),
		);
	}
}

/** Pseudo-classes whose selector arguments the output scopes. */
const SELECTOR_ARGUMENTS = ['is', 'where', 'not', 'has'];

/**
 * Whether the output gives no part of `selector` a scope hash outside a global
 * block. A compound gets none when it is `:global(...)` (with its arguments
 * kept as written), `:root` or `:host` with only pseudo-classes, has an `&`,
 * or is a lone `:is()` or `:where()`; the arguments of its `:is()`, `:where()`,
 * `:not()` and `:has()` are scoped as selectors of their own.
 *
 * @param {AST.CSS.ComplexSelector} selector
 * @returns {boolean}
 */
function is_unscoped(selector) {
	return selector.children.every(({ selectors, metadata }) => {
		if (metadata.is_global) return true;
		const [first] = selectors;
		const pseudo = (/** @type {AST.CSS.SimpleSelector} */ simple) =>
			simple.type === 'PseudoClassSelector' || simple.type === 'PseudoElementSelector';
		return (
			((first.type === 'PseudoClassSelector' &&
				(first.name === 'root' || first.name === 'host') &&
				selectors.every(pseudo)) ||
				selectors.some((simple) => simple.type === 'NestingSelector') ||
				(selectors.length === 1 &&
					first.type === 'PseudoClassSelector' &&
					(first.name === 'is' || first.name === 'where'))) &&
			selectors.every(
				(simple) =>
					simple.type !== 'PseudoClassSelector' ||
					!simple.args ||
					!SELECTOR_ARGUMENTS.includes(simple.name) ||
					simple.args.children.every(is_unscoped),
			)
		);
	});
}

/**
 * Whether a rule in `block`, or in an at-rule in it, at any depth, would be
 * scoped outside a global block, or a `@keyframes` name would. A rule with no
 * declarations in it puts no style in the output either way.
 *
 * @param {AST.CSS.Block | null} block
 * @returns {boolean}
 */
function nests_scoped(block) {
	return !!block?.children.some((child) => {
		if (child.type === 'Rule') {
			return (
				!child.metadata.is_global_block &&
				((has_declaration(child.block) && !child.prelude.children.every(is_unscoped)) ||
					nests_scoped(child.block))
			);
		}
		if (child.type !== 'Atrule') return false;
		if (child.name.replace(/^-((webkit)|(moz)|(o)|(ms))-/, '') === 'keyframes') {
			// The name, as the stylesheet transform reads it: after any comments.
			const name = child.prelude.replace(/^(\s|\/\*[^]*?\*\/)*/, '');
			return !/^['"]?-global-/.test(name);
		}
		return nests_scoped(child.block);
	});
}

/**
 * @param {AST.CSS.Block | null} block
 * @returns {boolean}
 */
function has_declaration(block) {
	return !!block?.children.some(
		(child) => child.type === 'Declaration' || has_declaration(child.block),
	);
}

/**
 * Analyze CSS and set metadata for global selectors.
 *
 * `:global` placement problems are reported through `error()` with the
 * `CSS_GLOBAL_PLACEMENT` code: pushed onto `errors` when given (and skipped
 * over a suppressing comment when `comments` is given too), thrown otherwise.
 * When `css` is a sheet parsed with a `body` origin (every sheet `parseModule`
 * produces), the diagnostic carries file-relative `pos` / `end` / `loc`; the
 * `fileName` defaults to the sheet's.
 *
 * @param {AST.CSS.Node} css - The CSS AST
 * @param {{
 *   filename?: string | null,
 *   errors?: CompileError[],
 *   comments?: AST.CommentWithLocation[],
 * }} [options]
 */
export function analyze_css(css, options = {}) {
	const sheet = css.type === 'StyleSheet' ? css : null;
	const filename = options.filename ?? sheet?.filename ?? null;

	/**
	 * @param {Diagnostic} diagnostic
	 * @param {AST.CSS.Node} node
	 */
	function report(diagnostic, node) {
		error(
			diagnostic,
			filename,
			css_node_source_position(sheet, node),
			options.errors,
			options.comments,
		);
	}

	walk(css, /** @type {{ rule: AST.CSS.Rule | null }} */ ({ rule: null }), {
		Rule(node, context) {
			node.metadata.parent_rule = context.state.rule;

			// Check for :global blocks
			// A global block is when the selector starts with :global and has no local selectors before it
			for (const complex_selector of node.prelude.children) {
				let is_global_block = false;

				for (
					let selector_idx = 0;
					selector_idx < complex_selector.children.length;
					selector_idx++
				) {
					const child = complex_selector.children[selector_idx];
					const idx = child.selectors.findIndex(is_global_block_selector);

					if (is_global_block) {
						// All selectors after :global are unscoped
						child.metadata.is_global_like = true;
					}

					// Only set is_global_block if this is the FIRST RelativeSelector and it starts with :global
					if (selector_idx === 0 && idx === 0) {
						// `child` starts with `:global` and is the first selector in the chain
						is_global_block = true;
						node.metadata.is_global_block = is_global_block;
					} else if (idx === 0) {
						// :global appears later in the selector chain (e.g., `div :global p`)
						// Set is_global_block for marking subsequent selectors as global-like
						is_global_block = true;
					} else if (idx !== -1) {
						// `:global` is not at the start - this is invalid but we'll let it through for now
						// The transform phase will handle removal
					}
				}
			}

			// Pass the current rule as state to nested nodes
			const state = { rule: node };
			context.visit(node.prelude, state);
			context.visit(node.block, state);
			if (node.metadata.is_global_block) check_global_block_list(node, report);
		},

		ComplexSelector(node, context) {
			// Set the rule metadata before analyzing children
			node.metadata.rule = context.state.rule;

			context.next(); // analyze relevant selectors first

			{
				const global = node.children.find(is_global);

				if (global) {
					const is_nested = context.path.at(-2)?.type === 'PseudoClassSelector';
					if (
						is_nested &&
						!(/** @type {AST.CSS.PseudoClassSelector} */ (global.selectors[0]).args)
					) {
						report(TSRX_ERRORS.CSS_GLOBAL_IN_PSEUDOCLASS, global.selectors[0]);
					}

					const idx = node.children.indexOf(global);
					const first = /** @type {AST.CSS.PseudoClassSelector} */ (global.selectors[0]);
					if (first.args !== null && idx !== 0 && idx !== node.children.length - 1) {
						// ensure `:global(...)` is not used in the middle of a selector (but multiple `global(...)` in sequence are ok)
						for (let i = idx + 1; i < node.children.length; i++) {
							if (!is_global(node.children[i])) {
								report(TSRX_ERRORS.CSS_GLOBAL_IN_MIDDLE, first);
								break;
							}
						}
					}
				}
			}

			// Set is_global metadata
			node.metadata.is_global = node.children.every(
				({ metadata }) => metadata.is_global || metadata.is_global_like,
			);

			node.metadata.used ||= node.metadata.is_global;
		},

		PseudoClassSelector(node, context) {
			// Walk into :is(), :where(), :has(), and :not() to initialize metadata for nested selectors
			if (
				(node.name === 'is' ||
					node.name === 'where' ||
					node.name === 'has' ||
					node.name === 'not') &&
				node.args
			) {
				context.next();
			}
		},
		RelativeSelector(node, context) {
			// Check if this selector is a :global selector
			node.metadata.is_global = node.selectors.length >= 1 && is_global(node);

			// Check for :root and other global-like selectors
			if (
				node.selectors.length >= 1 &&
				node.selectors.every(
					(selector) =>
						selector.type === 'PseudoClassSelector' || selector.type === 'PseudoElementSelector',
				)
			) {
				const first = node.selectors[0];
				node.metadata.is_global_like ||=
					(first.type === 'PseudoClassSelector' && first.name === 'host') ||
					(first.type === 'PseudoClassSelector' && first.name === 'root');
			}

			context.next();
		},
	});
}
