/** @import * as AST from 'estree' */
/** @import { CompileError } from '../../types/index' */

import { walk } from 'zimmerframe';
import { error } from '../errors.js';
import { DIAGNOSTIC_CODES } from '../diagnostics.js';
import {
	TSRX_CSS_GLOBAL_MIDDLE_PLACEMENT_ERROR,
	TSRX_CSS_GLOBAL_NESTED_IN_PSEUDOCLASS_ERROR,
} from './validation.js';

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
 * @typedef {{
 *   filename?: string | null,
 *   errors?: CompileError[],
 *   comments?: AST.CommentWithLocation[],
 *   start?: number,
 * }} AnalyzeCssOptions
 */

/**
 * File-relative node for `error()`. CSS `start`/`end` are style-body offsets.
 *
 * @param {AST.CSS.Node} node
 * @param {number} source_start
 */
function css_diagnostic_node(node, source_start) {
	return {
		start: (node.start ?? 0) + source_start,
		end: (node.end ?? 0) + source_start,
		loc: node.loc,
	};
}

/**
 * Analyze CSS and set metadata for global selectors
 * @param {AST.CSS.Node} css - The CSS AST
 * @param {AnalyzeCssOptions} [options]
 */
export function analyze_css(css, options = {}) {
	const stylesheet = css.type === 'StyleSheet' ? /** @type {AST.CSS.StyleSheet} */ (css) : null;
	const filename = options.filename ?? stylesheet?.filename ?? null;
	const source_start = options.start ?? stylesheet?.sourceStart ?? 0;

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
						error(
							TSRX_CSS_GLOBAL_NESTED_IN_PSEUDOCLASS_ERROR,
							filename,
							/** @type {AST.Node} */ (
								/** @type {unknown} */ (css_diagnostic_node(global, source_start))
							),
							options.errors,
							options.comments,
							DIAGNOSTIC_CODES.CSS_GLOBAL_PLACEMENT,
						);
					}

					const idx = node.children.indexOf(global);
					const first = /** @type {AST.CSS.PseudoClassSelector} */ (global.selectors[0]);
					if (first.args !== null && idx !== 0 && idx !== node.children.length - 1) {
						// ensure `:global(...)` is not used in the middle of a selector (but multiple `global(...)` in sequence are ok)
						for (let i = idx + 1; i < node.children.length; i++) {
							if (!is_global(node.children[i])) {
								error(
									TSRX_CSS_GLOBAL_MIDDLE_PLACEMENT_ERROR,
									filename,
									/** @type {AST.Node} */ (
										/** @type {unknown} */ (css_diagnostic_node(global, source_start))
									),
									options.errors,
									options.comments,
									DIAGNOSTIC_CODES.CSS_GLOBAL_PLACEMENT,
								);
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
