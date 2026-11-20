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
 * alike. Report a list where that loses something, as Svelte reports such a
 * list, but only where the output would differ from writing each selector in
 * a rule of its own:
 *
 * - a lone `:global` in a list of several with no rule around it for an `&`
 *   to stand for (`:global, .a { color: red; }`), where the output had to drop
 *   the selector or leave an empty one, and
 * - outside another global block, a selector that doesn't start with a bare
 *   `:global` beside one that does, when it or a rule nested in the rule would
 *   be scoped on its own (`.a, :global .b`). `:global.a, :global(.b)` and
 *   `.p { :global .a, &.b { ... } }` compile.
 *
 * A rule with no declarations in it, other than in an at-rule that can't be
 * nested (`@keyframes`, `@font-face`), styles nothing either way.
 *
 * Runs once the rule's selectors and nested rules have their metadata.
 *
 * @param {AST.CSS.Rule} rule
 * @param {boolean} in_scope whether the rule is in a `@scope`, where `&` stands
 *   for the scope's root rather than the rule around it
 * @param {(diagnostic: Diagnostic, node: AST.CSS.Node) => void} report
 */
function check_global_block_list(rule, in_scope, report) {
	const selectors = rule.prelude.children;
	if (selectors.length < 2) return;
	const leading = selectors.map((selector) => {
		const first = selector.children[0]?.selectors[0];
		return first && is_global_block_selector(first) ? first : null;
	});
	const styles = has_declaration(rule.block);
	const lone = selectors.findIndex(
		(selector, index) =>
			leading[index] &&
			selector.children.length === 1 &&
			selector.children[0].selectors.length === 1,
	);
	if (lone !== -1 && styles && !has_parent_rule_in_output(rule)) {
		report(TSRX_ERRORS.CSS_GLOBAL_BLOCK_NOT_ALONE, /** @type {AST.CSS.Node} */ (leading[lone]));
		return;
	}
	if (!leading.includes(null)) return;
	for (let parent = rule.metadata.parent_rule; parent; parent = parent.metadata.parent_rule) {
		if (parent.metadata.is_global_block) return;
	}
	if (
		(styles &&
			selectors.some(
				(selector, index) =>
					!leading[index] &&
					!is_unscoped(selector, !in_scope && subject_hashed(rule.metadata.parent_rule)),
			)) ||
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
 * Whether leaving the scope hashes out of `selector`, as a global block does,
 * can't make it match more than the output gives it on its own. Outside a
 * global block a compound gets no hash when it is `:global(...)` (with its
 * arguments kept as written), `:root` or `:host` with only pseudo-classes, has
 * an `&`, is a lone `:is()` or `:where()`, or follows a bare `:global`; the
 * arguments of its `:is()`, `:where()`, `:not()` and `:has()` are scoped as
 * selectors of their own, except that:
 *
 * - a `:not()` argument without its hashes only makes the `:not()` match
 *   fewer elements (a `:not()` within it is checked again), and
 * - with `subject_hashed`, the `&` of a compound stands for an element that
 *   has the hash already, so a single compound in its `:where()` (which adds
 *   no specificity) needs no hash of its own.
 *
 * @param {AST.CSS.ComplexSelector} selector
 * @param {boolean} [subject_hashed] whether an `&` here stands for an element
 *   that the output gives the hash
 * @returns {boolean}
 */
function is_unscoped(selector, subject_hashed = false) {
	let after_bare_global = false;
	return selector.children.every(({ selectors, metadata }) => {
		if (metadata.is_global) {
			if (is_global_block_selector(selectors[0])) after_bare_global = true;
			return true;
		}
		if (after_bare_global) return selectors.every((simple) => arguments_unscoped(simple));
		const [first] = selectors;
		const pseudo = (/** @type {AST.CSS.SimpleSelector} */ simple) =>
			simple.type === 'PseudoClassSelector' || simple.type === 'PseudoElementSelector';
		const nesting = selectors.some((simple) => simple.type === 'NestingSelector');
		return (
			((first.type === 'PseudoClassSelector' &&
				(first.name === 'root' || first.name === 'host') &&
				selectors.every(pseudo)) ||
				nesting ||
				(selectors.length === 1 &&
					first.type === 'PseudoClassSelector' &&
					(first.name === 'is' || first.name === 'where'))) &&
			selectors.every((simple) => arguments_unscoped(simple, nesting && subject_hashed))
		);
	});
}

/**
 * @param {AST.CSS.SimpleSelector} simple
 * @param {boolean} [subject_hashed] whether the compound's element has the hash
 * @returns {boolean}
 */
function arguments_unscoped(simple, subject_hashed = false) {
	if (
		simple.type !== 'PseudoClassSelector' ||
		!simple.args ||
		!SELECTOR_ARGUMENTS.includes(simple.name)
	) {
		return true;
	}
	return simple.args.children.every((argument) => {
		if (simple.name === 'not') return negation_unscoped(argument);
		if (simple.name === 'where' && subject_hashed && argument.children.length === 1) {
			return argument.children[0].selectors.every((inner) => arguments_unscoped(inner));
		}
		return is_unscoped(argument);
	});
}

/**
 * Whether leaving the hashes out of `selector`, a `:not()` argument, can't
 * make the `:not()` match more: hashes left out there only make it match
 * less, except in a `:not()` within it.
 *
 * @param {AST.CSS.ComplexSelector} selector
 * @returns {boolean}
 */
function negation_unscoped(selector) {
	return selector.children.every(
		({ selectors, metadata }) =>
			metadata.is_global ||
			selectors.every(
				(simple) =>
					simple.type !== 'PseudoClassSelector' ||
					!simple.args ||
					!SELECTOR_ARGUMENTS.includes(simple.name) ||
					simple.args.children.every((argument) =>
						simple.name === 'not' ? is_unscoped(argument) : negation_unscoped(argument),
					),
			),
	);
}

/**
 * Whether the output gives the hash to each element `rule`'s selectors match,
 * which an `&` in a rule nested in it stands for.
 *
 * @param {AST.CSS.Rule | null} rule
 * @returns {boolean}
 */
function subject_hashed(rule) {
	if (!rule) return false;
	let hashed = subject_hashed_cache.get(rule);
	if (hashed === undefined) {
		hashed = compute_subject_hashed(rule);
		subject_hashed_cache.set(rule, hashed);
	}
	return hashed;
}

/** @type {WeakMap<AST.CSS.Rule, boolean>} */
const subject_hashed_cache = new WeakMap();

/**
 * @param {AST.CSS.Rule} rule
 * @returns {boolean}
 */
function compute_subject_hashed(rule) {
	for (
		let parent = /** @type {AST.CSS.Rule | null} */ (rule);
		parent;
		parent = parent.metadata.parent_rule
	) {
		if (parent.metadata.is_global_block) return false;
	}
	return rule.prelude.children.every((selector) => {
		if (selector.children.some((child) => is_global_block_selector(child.selectors[0]))) {
			return false;
		}
		const { selectors, metadata } = /** @type {AST.CSS.RelativeSelector} */ (
			selector.children.at(-1)
		);
		const [first] = selectors;
		if (metadata.is_global || metadata.is_global_like) return false;
		if (selectors.some((simple) => simple.type === 'NestingSelector')) {
			return subject_hashed(rule.metadata.parent_rule);
		}
		return !(
			selectors.length === 1 &&
			first.type === 'PseudoClassSelector' &&
			(first.name === 'is' || first.name === 'where')
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
				((has_declaration(child.block) &&
					!child.prelude.children.every((selector) => is_unscoped(selector))) ||
					nests_scoped(child.block))
			);
		}
		if (child.type !== 'Atrule') return false;
		if (at_rule_name(child) === 'keyframes') {
			// The name, as the stylesheet transform reads it: after any comments.
			const name = child.prelude.replace(/^(\s|\/\*[^]*?\*\/)*/, '');
			return !/^['"]?-global-/.test(name);
		}
		return nests_scoped(child.block);
	});
}

/**
 * Whether `block` puts a declaration in a style rule: directly, in a nested
 * rule, or in an at-rule that can be nested (`@media`). The declarations of a
 * `@keyframes` or `@font-face` style no element through the rule.
 *
 * @param {AST.CSS.Block | null} block
 * @returns {boolean}
 */
function has_declaration(block) {
	return !!block?.children.some(
		(child) =>
			child.type === 'Declaration' ||
			(!(child.type === 'Atrule' && is_unnestable_at_rule(child)) && has_declaration(child.block)),
	);
}

/** At-rules a style rule can't hold: the ones that hold descriptors. */
const UNNESTABLE_AT_RULES = [
	'keyframes',
	'font-face',
	'property',
	'counter-style',
	'page',
	'font-feature-values',
	'font-palette-values',
	'view-transition',
	'position-try',
	'color-profile',
	'namespace',
	'import',
	'charset',
];

/**
 * @param {AST.CSS.Atrule} at_rule
 * @returns {string}
 */
function at_rule_name(at_rule) {
	return at_rule.name.toLowerCase().replace(/^-((webkit)|(moz)|(o)|(ms))-/, '');
}

/**
 * Whether `at_rule` can't sit in a style rule, as `@keyframes`, `@font-face`
 * and `@property` can't.
 *
 * @param {AST.CSS.Atrule} at_rule
 * @returns {boolean}
 */
export function is_unnestable_at_rule(at_rule) {
	return UNNESTABLE_AT_RULES.includes(at_rule_name(at_rule));
}

/** @type {WeakMap<AST.CSS.Rule, boolean>} */
const drops_selector_cache = new WeakMap();

/**
 * Whether the output drops `rule`'s selector, leaving it behind as a comment,
 * and keeps what's in the rule: a lone `:global { ... }` block; a global block
 * with a lone `:global` in its list and no rule around it for an `&` to stand
 * for, which styles nothing (or is TSRX3011); and a global block that styles
 * nothing but holds an at-rule a style rule can't hold (`@keyframes`,
 * `@font-face`), directly or in a `@media`, which is valid only outside it.
 *
 * @param {AST.CSS.Rule} rule
 * @returns {boolean}
 */
export function drops_selector(rule) {
	let drops = drops_selector_cache.get(rule);
	if (drops === undefined) {
		drops = rule.metadata.is_global_block && compute_drops_selector(rule);
		drops_selector_cache.set(rule, drops);
	}
	return drops;
}

/**
 * @param {AST.CSS.Rule} rule
 * @returns {boolean}
 */
function compute_drops_selector(rule) {
	const selectors = rule.prelude.children;
	const lone = selectors.some(
		(selector) =>
			selector.children.length === 1 &&
			selector.children[0].selectors.length === 1 &&
			is_global_block_selector(selector.children[0].selectors[0]),
	);
	if (lone && (selectors.length === 1 || !has_parent_rule_in_output(rule))) return true;
	return !has_declaration(rule.block) && holds_unnestable_at_rule(rule.block);
}

/**
 * @param {AST.CSS.Block | null} block
 * @returns {boolean}
 */
function holds_unnestable_at_rule(block) {
	return !!block?.children.some((child) =>
		child.type === 'Atrule'
			? is_unnestable_at_rule(child) || holds_unnestable_at_rule(child.block)
			: // A rule whose selector the output drops leaves its at-rules here.
				child.type === 'Rule' && drops_selector(child) && holds_unnestable_at_rule(child.block),
	);
}

/**
 * Whether the output keeps a rule around `rule` for an `&` to refer to. The
 * rules in a rule whose selector the output drops (`:global { ... }`) belong
 * to the rule around it, if there is one.
 *
 * @param {AST.CSS.Rule | null} rule
 * @returns {boolean}
 */
export function has_parent_rule_in_output(rule) {
	let parent = rule?.metadata.parent_rule;
	while (parent && drops_selector(parent)) parent = parent.metadata.parent_rule;
	return !!parent;
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
			if (node.metadata.is_global_block) {
				const in_scope = context.path.some(
					(ancestor) => ancestor.type === 'Atrule' && at_rule_name(ancestor) === 'scope',
				);
				check_global_block_list(node, in_scope, report);
			}
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
