/** @import * as AST from 'estree' */
/** @import { CompileError } from '../../types/index' */
/** @import { Diagnostic } from '../diagnostics.js' */

import { walk } from 'zimmerframe';
import { error } from '../errors.js';
import { TSRX_ERRORS } from '../diagnostics.js';
import { css_node_source_position, unescape_css } from '../parse/style.js';

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
 * True if is `:global(...)` or `:global`
 * @param {AST.CSS.SimpleSelector} simple_selector
 * @returns {simple_selector is AST.CSS.PseudoClassSelector}
 */
function is_global_pseudo_class(simple_selector) {
	return simple_selector.type === 'PseudoClassSelector' && simple_selector.name === 'global';
}

/** The pseudo-elements CSS also reads with one colon, which parse as pseudo-classes. */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

/**
 * True if is a pseudo-element: `::before`, or one CSS also reads with one
 * colon, in any case and with escapes (`:before`, `:AFTER`)
 * @param {AST.CSS.SimpleSelector} simple_selector
 */
function is_pseudo_element(simple_selector) {
	return (
		simple_selector.type === 'PseudoElementSelector' ||
		(simple_selector.type === 'PseudoClassSelector' &&
			simple_selector.args === null &&
			LEGACY_PSEUDO_ELEMENTS.has(
				unescape_css(simple_selector.name).replace(/[A-Z]/g, (letter) => letter.toLowerCase()),
			))
	);
}

/**
 * True if is a pseudo-element, or a `:global(...)` whose argument ends in one
 * (`:global(.x i::before)`): after either, the rest of the compound applies to
 * the pseudo-element. A selector list in a `:global(...)` here is an error of
 * its own, and ends nothing.
 * @param {AST.CSS.SimpleSelector} simple_selector
 */
function ends_compound(simple_selector) {
	if (is_pseudo_element(simple_selector)) return true;
	if (!is_global_pseudo_class(simple_selector) || simple_selector.args?.children.length !== 1) {
		return false;
	}
	const { children } = simple_selector.args.children[0];
	return children[children.length - 1].selectors.some(is_pseudo_element);
}

/**
 * True if is `:global(...)` or `:global` and no pseudo class that is scoped.
 * @param {AST.CSS.RelativeSelector} relative_selector
 * @param {boolean} [scope_root] whether an `&` in it stands for a `@scope`'s
 *   root, and so counts as the `:scope` pseudo-class
 */
function is_global(relative_selector, scope_root = false) {
	const first = relative_selector.selectors[0];

	return (
		first?.type === 'PseudoClassSelector' &&
		first.name === 'global' &&
		(first.args === null ||
			// Only these two selector types keep the whole selector global, because e.g.
			// :global(button).x means that the selector is still scoped because of the .x
			relative_selector.selectors.every(
				(selector) =>
					selector.type === 'PseudoClassSelector' ||
					selector.type === 'PseudoElementSelector' ||
					(scope_root && selector.type === 'NestingSelector'),
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
 * @param {(diagnostic: Diagnostic, node: AST.CSS.Node) => boolean} report
 * @returns {boolean} whether it reported a lone `:global` beside other
 *   selectors (`CSS_GLOBAL_BLOCK_NOT_ALONE`)
 */
function check_global_block_list(rule, report) {
	const selectors = rule.prelude.children;
	if (selectors.length < 2) return false;
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
		return report(
			TSRX_ERRORS.CSS_GLOBAL_BLOCK_NOT_ALONE,
			/** @type {AST.CSS.Node} */ (leading[lone]),
		);
	}
	if (!leading.includes(null)) return false;
	for (let parent = rule.metadata.parent_rule; parent; parent = parent.metadata.parent_rule) {
		if (parent.metadata.is_global_block) return false;
	}
	if (
		(styles &&
			selectors.some(
				(selector, index) => !leading[index] && !is_unscoped(selector, ampersand_hashed(rule)),
			)) ||
		nests_scoped(rule.block)
	) {
		report(
			TSRX_ERRORS.CSS_GLOBAL_BLOCK_IN_MIXED_LIST,
			/** @type {AST.CSS.Node} */ (leading.find((first) => first)),
		);
	}
	return false;
}

/**
 * Whether `simple` is `:root` or `:host` (`:host(...)` too): a compound with
 * one matches the page's root element or the shadow host, never one of the
 * component's elements.
 *
 * @param {AST.CSS.SimpleSelector} simple
 * @returns {boolean}
 */
export function is_root_or_host(simple) {
	return (
		simple.type === 'PseudoClassSelector' && (simple.name === 'root' || simple.name === 'host')
	);
}

/**
 * Whether `relative_selector`, a compound of a selector of `rule`, matches the
 * page's root element or the shadow host, never one of the component's
 * elements: it has `:root` or `:host`, or an `&` for a rule each of whose
 * selectors ends in such a compound (`:root { &.dark {} }`).
 *
 * @param {AST.CSS.RelativeSelector} relative_selector
 * @param {AST.CSS.Rule | null} rule
 * @returns {boolean}
 */
export function is_root_compound(relative_selector, rule) {
	return (
		relative_selector.selectors.some(is_root_or_host) ||
		(!!rule &&
			relative_selector.selectors.some((simple) => simple.type === 'NestingSelector') &&
			ampersand_is_root(rule))
	);
}

/**
 * Whether an `&` in `rule` stands for the root element or the shadow host:
 * every selector of the rule around it ends in a compound that matches it.
 * In a `@scope` (with no rule between) it stands for the scope's root.
 *
 * @param {AST.CSS.Rule} rule
 * @returns {boolean}
 */
function ampersand_is_root(rule) {
	const parent = rule.metadata.parent_rule;
	if (!parent || scope_root_rules.has(rule)) return false;
	let root = ampersand_root_cache.get(parent);
	if (root === undefined) {
		root = parent.prelude.children.every((selector) =>
			is_root_compound(/** @type {AST.CSS.RelativeSelector} */ (selector.children.at(-1)), parent),
		);
		ampersand_root_cache.set(parent, root);
	}
	return root;
}

/**
 * Whether the selectors of a rule all end in a compound that matches the root
 * element or the shadow host.
 *
 * @type {WeakMap<AST.CSS.Rule, boolean>}
 */
const ampersand_root_cache = new WeakMap();

/** Pseudo-classes whose selector arguments the output scopes. */
const SELECTOR_ARGUMENTS = ['is', 'where', 'not', 'has'];

/**
 * Whether leaving the scope hashes out of `selector`, as a global block does,
 * can't make it match more than the output gives it on its own. Outside a
 * global block a compound gets no hash when it is `:global(...)` (with its
 * arguments kept as written), has `:root` or `:host`, has an `&` (other than
 * one for a `@scope`'s root), is a lone `:is()` or `:where()`, or follows a
 * bare `:global`; the arguments of its `:is()`, `:where()`, `:not()` and
 * `:has()` are scoped as selectors of their own, except that:
 *
 * - those of the `:is()`, `:where()` and `:not()` of a compound that matches
 *   the root or the host (`is_root_compound`) are kept as written, and
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
	return selector.children.every((relative_selector) => {
		const { selectors, metadata } = relative_selector;
		const root = is_root_compound(relative_selector, selector.metadata.rule);
		if (metadata.is_global) {
			if (is_global_block_selector(selectors[0])) after_bare_global = true;
			return true;
		}
		if (after_bare_global) {
			return selectors.every((simple) => arguments_unscoped(simple, false, root));
		}
		const [first] = selectors;
		// An `&` for a `@scope`'s root is the `:scope` it stands for: it gets the
		// hash as `:scope` does.
		const scope_root = is_scope_root_ampersand(selector.metadata.rule);
		const nesting = !scope_root && selectors.some((simple) => simple.type === 'NestingSelector');
		return (
			(selectors.some(is_root_or_host) ||
				nesting ||
				(selectors.length === 1 &&
					first.type === 'PseudoClassSelector' &&
					(first.name === 'is' || first.name === 'where'))) &&
			selectors.every((simple) => arguments_unscoped(simple, nesting && subject_hashed, root))
		);
	});
}

/**
 * @param {AST.CSS.SimpleSelector} simple
 * @param {boolean} [subject_hashed] whether the compound's element has the hash
 * @param {boolean} [root_or_host] whether the compound matches the root or
 *   the host (`is_root_compound`), so that its `:not()`, `:is()` and
 *   `:where()` arguments are kept as written
 * @returns {boolean}
 */
function arguments_unscoped(simple, subject_hashed = false, root_or_host = false) {
	if (
		simple.type !== 'PseudoClassSelector' ||
		!simple.args ||
		!SELECTOR_ARGUMENTS.includes(simple.name)
	) {
		return true;
	}
	if (root_or_host && simple.name !== 'has') {
		return kept_arguments_unscoped(simple.args, simple.name === 'not');
	}
	return simple.args.children.every((argument) => {
		if (simple.name === 'not') return negation_unscoped(argument);
		if (
			simple.name === 'where' &&
			subject_hashed &&
			argument.children.length === 1 &&
			argument.children[0].combinator === null
		) {
			const root = is_root_compound(argument.children[0], argument.metadata.rule);
			return argument.children[0].selectors.every((inner) =>
				arguments_unscoped(inner, false, root),
			);
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
		(relative_selector) =>
			relative_selector.metadata.is_global ||
			relative_selector.selectors.every(
				(simple) =>
					simple.type !== 'PseudoClassSelector' ||
					!simple.args ||
					!SELECTOR_ARGUMENTS.includes(simple.name) ||
					(simple.name !== 'has' && is_root_compound(relative_selector, selector.metadata.rule)
						? kept_arguments_unscoped(simple.args, simple.name !== 'not')
						: simple.args.children.every((argument) =>
								simple.name === 'not' ? is_unscoped(argument) : negation_unscoped(argument),
							)),
			),
	);
}

/**
 * Whether the arguments a `:root` or `:host` compound keeps as written (those
 * of its `:is()`, `:where()` and `:not()`) can't match more without hashes:
 * only a `:has()` in them still looks at the component's elements, and an
 * argument with an `&`, about the rule around it, is kept as on its own.
 *
 * @param {AST.CSS.SelectorList} list
 * @param {boolean} negated whether a match there makes the selector match less
 * @returns {boolean}
 */
function kept_arguments_unscoped(list, negated) {
	return list.children.every((argument) => {
		// One with an `&` is left as the pruner matched it, as on its own.
		if (
			argument.children.some(({ selectors }) =>
				selectors.some((simple) => simple.type === 'NestingSelector'),
			)
		) {
			return negated ? negation_unscoped(argument) : is_unscoped(argument);
		}
		return argument.children.every(({ selectors, metadata }) => {
			// A `:global(...)` compound keeps its arguments as written too.
			if (metadata.is_global) return true;
			return selectors.every((simple) => {
				if (
					simple.type !== 'PseudoClassSelector' ||
					!simple.args ||
					!SELECTOR_ARGUMENTS.includes(simple.name)
				) {
					return true;
				}
				if (simple.name === 'has') {
					return simple.args.children.every((inner) =>
						negated ? negation_unscoped(inner) : is_unscoped(inner),
					);
				}
				return kept_arguments_unscoped(simple.args, simple.name === 'not' ? !negated : negated);
			});
		});
	});
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
 * Rules directly in a `@scope`, with no rule between.
 *
 * @type {WeakSet<AST.CSS.Rule>}
 */
const scope_root_rules = new WeakSet();

/**
 * Whether the element an `&` in `rule` stands for has the hash: the element
 * of the rule around it, unless a `@scope` comes between (then the scope's
 * root).
 *
 * @param {AST.CSS.Rule} rule
 * @returns {boolean}
 */
function ampersand_hashed(rule) {
	return !scope_root_rules.has(rule) && subject_hashed(rule.metadata.parent_rule);
}

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
			return is_scope_root_ampersand(rule) || ampersand_hashed(rule);
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
	'function',
	'custom-media',
	'custom-selector',
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
	return drops_for_at_rules(rule);
}

/** @type {WeakMap<AST.CSS.Rule, boolean>} */
const drops_for_at_rules_cache = new WeakMap();

/**
 * Whether `rule` is a global block that styles nothing but holds an at-rule a
 * style rule can't hold, which the output lifts out of it. This asks only
 * about the rules in it, never about the rules around it, so a rule asking
 * about its parent and the parent asking about it can't go round in a loop.
 *
 * @param {AST.CSS.Rule} rule
 * @returns {boolean}
 */
function drops_for_at_rules(rule) {
	let drops = drops_for_at_rules_cache.get(rule);
	if (drops === undefined) {
		drops =
			rule.metadata.is_global_block &&
			!has_declaration(rule.block) &&
			holds_unnestable_at_rule(rule.block);
		drops_for_at_rules_cache.set(rule, drops);
	}
	return drops;
}

/**
 * @param {AST.CSS.Block | null} block
 * @returns {boolean}
 */
function holds_unnestable_at_rule(block) {
	return !!block?.children.some((child) =>
		child.type === 'Atrule'
			? is_unnestable_at_rule(child) || holds_unnestable_at_rule(child.block)
			: // A rule whose selector the output drops for them leaves its at-rules here.
				child.type === 'Rule' && drops_for_at_rules(child),
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
 * Whether an `&` in `rule`'s selectors stands for a `@scope`'s root: the rule
 * is directly in a `@scope`, with no rule around it. CSS reads that `&` as
 * `:where(:scope)`, so the output scopes it as it scopes `:scope`.
 *
 * @param {AST.CSS.Rule | null | undefined} rule
 * @returns {boolean}
 */
export function is_scope_root_ampersand(rule) {
	return !!rule && !rule.metadata.parent_rule && scope_root_rules.has(rule);
}

/**
 * Whether the output has something around `rule` for an `&` in its selectors
 * to stand for: a rule (the rules in a `:global { ... }` block the output
 * drops belong to the rule around it), or a `@scope`, whose root it is.
 * Outside both, an `&` would match the page's root element.
 *
 * Runs once the whole sheet has its metadata: whether a rule drops its
 * selector depends on the rules nested in it.
 *
 * @param {AST.CSS.Rule} rule
 * @returns {boolean}
 */
function has_ampersand_target(rule) {
	for (
		let current = /** @type {AST.CSS.Rule | null} */ (rule);
		current;
		current = current.metadata.parent_rule
	) {
		if (scope_root_rules.has(current)) return true;
		const parent = current.metadata.parent_rule;
		if (parent && !drops_selector(parent)) return true;
	}
	return false;
}

/**
 * The `&`s in `rule`'s selectors, in their `:is()`, `:where()`, `:not()` and
 * `:has()` arguments too, but not in a `:global(...)`, which keeps what it
 * holds as written.
 *
 * @param {AST.CSS.Rule} rule
 * @returns {AST.CSS.NestingSelector[]}
 */
function nesting_selectors(rule) {
	/** @type {AST.CSS.NestingSelector[]} */
	const found = [];
	walk(/** @type {AST.CSS.Node} */ (rule.prelude), null, {
		PseudoClassSelector(node, context) {
			if (node.name !== 'global') context.next();
		},
		NestingSelector(node) {
			found.push(node);
		},
	});
	return found;
}

/**
 * At-rules that hold rules, and declarations only in a style rule: a group
 * rule such as `@media`, or `@scope`, which a declaration outside every rule
 * still is in.
 */
const GROUP_AT_RULES = [
	'media',
	'supports',
	'container',
	'layer',
	'scope',
	'starting-style',
	'when',
	'else',
	'document',
];

/**
 * `at_rule`'s name as CSS reads it, with its escapes decoded (`@s\63ope` is
 * `@scope`), in lowercase and without a vendor prefix.
 *
 * @param {AST.CSS.Atrule} at_rule
 * @returns {string}
 */
function decoded_at_rule_name(at_rule) {
	return unescape_css(at_rule.name)
		.toLowerCase()
		.replace(/^-((webkit)|(moz)|(o)|(ms))-/, '');
}

/**
 * Rules in an at-rule other than a group rule (`@font-face`, or one this
 * doesn't know), whose declarations belong to that at-rule.
 *
 * @type {WeakSet<AST.CSS.Rule>}
 */
const declaration_at_rule_rules = new WeakSet();

/**
 * The first declaration in `block` that the output puts straight into what
 * is around it: one in the block itself, or in a group rule in it (`@media`),
 * not in a rule or another at-rule.
 *
 * @param {AST.CSS.Block | null} block
 * @returns {AST.CSS.Declaration | null}
 */
function first_bare_declaration(block) {
	for (const child of block?.children ?? []) {
		if (child.type === 'Declaration') return child;
		if (child.type === 'Atrule' && GROUP_AT_RULES.includes(decoded_at_rule_name(child))) {
			const declaration = first_bare_declaration(child.block);
			if (declaration) return declaration;
		}
	}
	return null;
}

/**
 * Report what would be left outside every rule in the output: an `&` with
 * no rule or `@scope` around it, which would match the page's root element,
 * and the declarations of a `:global { ... }` block the output drops with no
 * rule around it, which would be invalid CSS.
 *
 * @param {AST.CSS.Rule[]} rules every rule of the sheet, in source order
 * @param {(diagnostic: Diagnostic, node: AST.CSS.Node) => boolean} report
 * @param {Set<AST.CSS.Rule>} not_alone_rules rules whose lone `:global`
 *   beside other selectors was reported (`:global, .z { color: red }`): that
 *   error already says why their declarations would be left outside every rule
 */
function check_rules_without_parent(rules, report, not_alone_rules) {
	for (const rule of rules) {
		// A selector the output drops (`:global & { @font-face { ... } }`)
		// leaves no & behind.
		if (!drops_selector(rule) && !has_ampersand_target(rule)) {
			for (const nesting of nesting_selectors(rule)) {
				report(TSRX_ERRORS.CSS_NESTING_SELECTOR_WITHOUT_RULE, nesting);
			}
		}
		if (
			drops_selector(rule) &&
			!has_parent_rule_in_output(rule) &&
			!declaration_at_rule_rules.has(rule) &&
			!not_alone_rules.has(rule)
		) {
			const declaration = first_bare_declaration(rule.block);
			if (declaration) report(TSRX_ERRORS.CSS_GLOBAL_BLOCK_DECLARATION, declaration);
		}
	}
}

/**
 * Analyze CSS and set metadata for global selectors.
 *
 * `:global` placement problems are reported through `error()` with the
 * `CSS_GLOBAL_PLACEMENT` code, and an `&` with no rule around it with
 * `CSS_NESTING_SELECTOR_PLACEMENT`: pushed onto `errors` when given (and skipped
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
	 * @returns {boolean} whether it was recorded
	 */
	function report(diagnostic, node) {
		const count = options.errors?.length ?? 0;
		error(
			diagnostic,
			filename,
			css_node_source_position(sheet, node),
			options.errors,
			options.comments,
		);
		// Without `errors` it threw; with them, a suppressing comment skips it.
		return (options.errors?.length ?? 0) > count;
	}

	/** @type {Set<AST.CSS.Rule>} */
	const not_alone_rules = new Set();

	/** @type {AST.CSS.Rule[]} */
	const rules = [];

	walk(css, /** @type {{ rule: AST.CSS.Rule | null }} */ ({ rule: null }), {
		Rule(node, context) {
			node.metadata.parent_rule = context.state.rule;
			rules.push(node);
			// The nearest rule or `@scope` around it: in a `@scope`, `&` stands for
			// the scope's root.
			for (let i = context.path.length - 1; i >= 0; i--) {
				const ancestor = context.path[i];
				if (ancestor.type === 'Rule') break;
				if (ancestor.type === 'Atrule' && decoded_at_rule_name(ancestor) === 'scope') {
					scope_root_rules.add(node);
					break;
				}
			}
			if (
				context.path.some(
					(ancestor) =>
						ancestor.type === 'Atrule' && !GROUP_AT_RULES.includes(decoded_at_rule_name(ancestor)),
				)
			) {
				declaration_at_rule_rules.add(node);
			}

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
			if (node.metadata.is_global_block && check_global_block_list(node, report)) {
				not_alone_rules.add(node);
			}
		},

		ComplexSelector(node, context) {
			// Set the rule metadata before analyzing children
			node.metadata.rule = context.state.rule;

			context.next(); // analyze relevant selectors first

			{
				// A bare :global anywhere in a pseudo-class's argument, not only one
				// that starts a compound (`:is(.x:global)`, `:is(:global(.x) :global .y)`).
				if (context.path.at(-2)?.type === 'PseudoClassSelector') {
					const bare = node.children
						.flatMap((relative_selector) => relative_selector.selectors)
						.find(is_global_block_selector);
					if (bare) report(TSRX_ERRORS.CSS_GLOBAL_IN_PSEUDOCLASS, bare);
				}

				const scope_root = is_scope_root_ampersand(context.state.rule);
				const global = node.children.find((child) => is_global(child, scope_root));

				if (global) {
					const idx = node.children.indexOf(global);
					const first = /** @type {AST.CSS.PseudoClassSelector} */ (global.selectors[0]);
					if (first.args !== null && idx !== 0 && idx !== node.children.length - 1) {
						// ensure `:global(...)` is not used in the middle of a selector (but multiple `global(...)` in sequence are ok)
						for (let i = idx + 1; i < node.children.length; i++) {
							if (!is_global(node.children[i], scope_root)) {
								report(TSRX_ERRORS.CSS_GLOBAL_IN_MIDDLE, first);
								break;
							}
						}
					}
				}
			}

			// The output drops the parentheses of `:global(...)`, so a selector list
			// in it is only kept whole as the whole selector (`:global(.a, .b)`):
			// `:global(.a, .b) .c` would give `.a, .b .c`, a page-wide `.a`.
			for (const relative_selector of node.children) {
				for (const selector of relative_selector.selectors) {
					if (
						selector.type === 'PseudoClassSelector' &&
						selector.name === 'global' &&
						selector.args &&
						selector.args.children.length > 1 &&
						(node.children.length > 1 ||
							relative_selector.selectors.length > 1 ||
							relative_selector.combinator)
					) {
						report(TSRX_ERRORS.CSS_GLOBAL_SELECTOR_LIST, selector);
					}
				}
			}

			// So a `:global(...)` with a combinator between other selectors of a
			// compound (`.a:global(.b c).d`) gives `.a.b c.d`, `.a` and `.d` on two
			// elements, where a component's check for unused CSS matches both on
			// one. Other `:global(...)` join the global part, and a pseudo-element,
			// after the `:global(...)` or at the end of its argument, ends the
			// compound: what follows it applies to the pseudo-element either way.
			for (const { selectors } of node.children) {
				const end = selectors.findIndex(ends_compound);
				const compound = end === -1 ? selectors : selectors.slice(0, end);
				const first = compound.findIndex((selector) => !is_global_pseudo_class(selector));
				const last = compound.findLastIndex((selector) => !is_global_pseudo_class(selector));
				for (let i = first + 1; i < last; i++) {
					const selector = compound[i];
					if (
						is_global_pseudo_class(selector) &&
						selector.args?.children.length === 1 &&
						(selector.args.children[0].children.length > 1 ||
							selector.args.children[0].children[0].combinator)
					) {
						report(TSRX_ERRORS.CSS_GLOBAL_COMBINATOR_IN_COMPOUND, selector);
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
			// An `&` for a `@scope`'s root counts as the `:scope` it stands for.
			const scope_root = is_scope_root_ampersand(context.state.rule);
			node.metadata.is_global = node.selectors.length >= 1 && is_global(node, scope_root);

			// A compound with :root or :host matches the page's root element or the
			// shadow host, never one of the component's elements, whatever else it
			// has (`:root.dark`, `:host[open]`, `:root&` in a `@scope`): it stays as
			// written. So does one with an `&` for such a compound
			// (`:root { &.dark {} }`).
			node.metadata.is_global_like ||= is_root_compound(node, context.state.rule);

			context.next();
		},
	});

	check_rules_without_parent(rules, report, not_alone_rules);
}
