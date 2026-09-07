/** @import * as AST from 'estree' */
/** @import { OptimizeOptions, OptimizeResult, ResolveStaticIdentifier, StaticValue } from '../../types/index' */

import { walk } from 'zimmerframe';
import * as b from '../utils/builders.js';
import { create_constant_resolver } from './constants.js';
import { evaluate_expression, evaluate_truthiness, unwrap_expression } from './evaluate.js';

/**
 * Marker that stands in for a directive the pass removed.
 * zimmerframe can replace a node but cannot delete one.
 * So a visitor swaps a dead directive for this marker.
 * The enclosing list then filters the markers out.
 */
const REMOVED = 'TSRXRemovedNode';

/** @type {AST.Node} */
const removed_node = /** @type {AST.Node} */ (/** @type {unknown} */ ({ type: REMOVED }));

/**
 * Reports whether a node is the removal marker.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function is_removed(node) {
	return /** @type {{ type?: string } | null | undefined} */ (node)?.type === REMOVED;
}

/**
 * Slots whose visitor filters removal markers back out.
 * A marker left anywhere else would stay in the tree and break it.
 */
const REMOVAL_CONTAINERS = new Set([
	'Program',
	'BlockStatement',
	'StaticBlock',
	'SwitchCase',
	'JSXCodeBlock',
	'JSXElement',
	'JSXFragment',
]);

/**
 * Reports whether the node at the end of `path` sits in a slot that can drop it.
 *
 * @param {AST.Node[]} path
 * @returns {boolean}
 */
function removal_is_handled(path) {
	const parent = path.at(-1);
	return !!parent && REMOVAL_CONTAINERS.has(parent.type);
}

/**
 * One collapse can expose the next, so the pass repeats until a round changes
 * nothing. This cap only stops a bug from looping forever.
 */
const MAX_ROUNDS = 5;

/**
 * Node kinds that can stand where a template renders a child.
 * A branch holding exactly one of these can replace its directive.
 * Any other branch keeps the directive and only loses its dead arm.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function is_render_child(node) {
	switch (node?.type) {
		case 'JSXElement':
		case 'JSXFragment':
		case 'JSXText':
		case 'JSXExpressionContainer':
		case 'JSXStyleElement':
		case 'JSXIfExpression':
		case 'JSXForExpression':
		case 'JSXSwitchExpression':
		case 'JSXTryExpression':
			return true;
		case 'IfStatement':
		case 'ForOfStatement':
		case 'ForInStatement':
		case 'ForStatement':
		case 'SwitchStatement':
		case 'TryStatement':
			return !!(/** @type {{ statementType?: string }} */ (node).statementType);
		default:
			return false;
	}
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function is_if_node(node) {
	return node?.type === 'IfStatement' || node?.type === 'JSXIfExpression';
}

/**
 * Reports whether a node is one of the TSRX keyword directives.
 * These are `@if`, `@for`, `@switch`, and `@try`, in both their expression and
 * retyped statement forms.
 * The pass rewrites nothing else.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function is_template_directive_node(node) {
	return (
		node?.type === 'JSXIfExpression' ||
		node?.type === 'JSXForExpression' ||
		node?.type === 'JSXSwitchExpression' ||
		node?.type === 'JSXTryExpression' ||
		!!(node && /** @type {{ statementType?: string }} */ (node).statementType)
	);
}

/**
 * Reports whether a branch declares something that outlives it.
 * `var` and function declarations hoist out of their block.
 * A branch holding one stays observable even when unreachable.
 * Such a branch is never removed.
 * Nested functions have their own hoisting scope, so they are skipped.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function contains_hoisted_declaration(node) {
	if (!node) return false;

	let found = false;

	walk(node, null, {
		FunctionDeclaration(_node, { stop }) {
			found = true;
			stop();
		},
		FunctionExpression() {},
		ArrowFunctionExpression() {},
		ClassDeclaration(_node, { stop }) {
			found = true;
			stop();
		},
		VariableDeclaration(declaration, { next, stop }) {
			if (declaration.kind === 'var') {
				found = true;
				stop();
				return;
			}
			next();
		},
	});

	return found;
}

/**
 * Drops removal markers from a list.
 *
 * @param {AST.Node[]} list
 * @returns {AST.Node[] | null} The new list, or `null` when nothing changed.
 */
function prune_removed(list) {
	if (!list.some(is_removed)) return null;
	return list.filter((node) => !is_removed(node));
}

/**
 * The one node a template branch renders, when that node is all it holds.
 * A branch that also runs setup statements has no single-node form.
 * That case returns `null`.
 *
 * @param {AST.Node | null | undefined} branch
 * @returns {AST.Node | null}
 */
function branch_to_render_child(branch) {
	if (!branch) return null;
	if (is_render_child(branch)) return branch;
	if (branch.type !== 'BlockStatement' || branch.body.length !== 1) return null;

	const only = branch.body[0];
	return only && is_render_child(only) ? only : null;
}

/**
 * @param {AST.Node} node
 * @returns {AST.Node}
 */
function empty_fragment(node) {
	const fragment = b.jsx_fragment([]);
	// The fragment sits in template position.
	// The compiler tells authored TSRX output apart from plain JSX values there.
	fragment.metadata = { ...(fragment.metadata ?? { path: [] }), native_tsrx: true };
	return b.set_location(
		fragment,
		/** @type {AST.NodeWithLocation} */ (/** @type {unknown} */ (node)),
	);
}

/**
 * Decides a directive test that the pass can read without running it.
 * A test with side effects is refused.
 * Choosing a branch discards the test, and a directive has no expression slot
 * left to keep those effects in.
 *
 * @param {AST.Node} test
 * @param {ResolveStaticIdentifier} resolve
 * @returns {boolean | null}
 */
function decide_test(test, resolve) {
	const truthiness = evaluate_truthiness(test, resolve);
	if (!truthiness || !truthiness.pure) return null;
	return truthiness.truthy;
}

/**
 * Reports whether `node` is a link in an `@if` chain rather than its head.
 * Only the head carries the directive typing.
 * So the whole chain is collapsed from the head.
 * A link reached on its own is left alone.
 *
 * @param {AST.Node} node
 * @param {AST.Node[]} path
 * @returns {boolean}
 */
function is_template_if_chain_link(node, path) {
	let child = node;

	for (let i = path.length - 1; i >= 0; i -= 1) {
		const parent = path[i];
		if (!is_if_node(parent) || /** @type {AST.IfStatement} */ (parent).alternate !== child) {
			return false;
		}
		if (is_template_directive_node(parent)) return true;
		child = parent;
	}

	return false;
}

/**
 * Every link of an `@if` and `@else if` chain, head first.
 *
 * @param {AST.IfStatement} head
 * @returns {AST.IfStatement[]}
 */
function collect_if_chain(head) {
	const links = [head];

	while (true) {
		const alternate = links[links.length - 1].alternate;
		if (!alternate || !is_if_node(alternate)) return links;
		links.push(/** @type {AST.IfStatement} */ (alternate));
	}
}

/**
 * Collapses an `@if` chain against the tests it can decide.
 * A link whose test is provably false is dropped.
 * The first provably true test ends the chain, and its branch is the result.
 * A chain that reduces to one output node replaces the directive.
 * A chain that still has an undecided test is rebuilt from the links that stay.
 *
 * @param {AST.IfStatement} head
 * @param {ResolveStaticIdentifier} resolve
 * @returns {AST.Node | null} The replacement node, or `null` to keep the head.
 */
function collapse_template_if(head, resolve) {
	const links = collect_if_chain(head);

	/** @type {AST.IfStatement[]} */
	const kept = [];
	/** @type {AST.Node[]} */
	const dropped = [];
	/** @type {AST.Node | null | undefined} */
	let taken;

	for (const link of links) {
		const test = decide_test(link.test, resolve);

		if (test === null) {
			kept.push(link);
			continue;
		}

		if (test) {
			taken = link.consequent;
			break;
		}

		dropped.push(link.consequent);
	}

	// No test was decided, so nothing changes.
	if (kept.length === links.length && taken === undefined) return null;

	const trailing_else = links[links.length - 1].alternate;

	/** @type {AST.Node | null} */
	const alternate = taken !== undefined ? /** @type {AST.Node} */ (taken) : (trailing_else ?? null);

	// Everything past the link that is provably taken is unreachable.
	// So is the trailing `@else`, since some earlier branch already won.
	const unreachable = [...dropped];
	if (taken !== undefined) {
		const taken_index = links.findIndex((link) => link.consequent === taken);
		for (const link of links.slice(taken_index + 1)) unreachable.push(link.consequent);
		if (trailing_else && !is_if_node(trailing_else)) unreachable.push(trailing_else);
	}
	if (unreachable.some((node) => contains_hoisted_declaration(node))) return null;

	if (kept.length === 0) {
		if (!alternate) return removed_node;
		const child = branch_to_render_child(alternate);
		if (child) return child;
		// A branch with setup statements has no standalone form.
		// The directive survives with a constant test and one arm.
		return {
			...head,
			test: b.literal(true, 'true'),
			consequent: /** @type {AST.Statement} */ (alternate),
			alternate: null,
		};
	}

	/** @type {AST.Node | null} */
	let rebuilt = alternate;
	for (let i = kept.length - 1; i >= 0; i -= 1) {
		rebuilt = { ...kept[i], alternate: /** @type {AST.Statement | null} */ (rebuilt) };
	}

	// The head owns the directive typing.
	// A promoted link has to inherit it.
	return {
		.../** @type {AST.IfStatement} */ (rebuilt),
		type: head.type,
		statementType: /** @type {any} */ (head).statementType,
	};
}

/**
 * Collapses a `@switch` whose discriminant and case tests are all known.
 *
 * @param {AST.SwitchStatement} node
 * @param {StaticValue} discriminant
 * @param {ResolveStaticIdentifier} resolve
 * @returns {AST.Node | null}
 */
function collapse_switch(node, discriminant, resolve) {
	/** @type {AST.SwitchCase | null} */
	let match = null;
	/** @type {AST.SwitchCase | null} */
	let fallback = null;

	for (const switch_case of node.cases) {
		if (!switch_case.test) {
			fallback = switch_case;
			continue;
		}

		const test = evaluate_expression(switch_case.test, resolve);
		// One case test the pass cannot read makes every later case unreadable.
		if (!test) return null;
		if (match === null && test.value === discriminant) match = switch_case;
	}

	const taken = match ?? fallback;
	if (!taken) return contains_hoisted_declaration(node) ? null : removed_node;

	// `@switch` cases do not fall through.
	// So the winning case is the whole result.
	// It only replaces the directive when it is a lone output node.
	const body = taken.consequent.filter((statement) => statement.type !== 'BreakStatement');
	if (body.length !== 1 || !is_render_child(body[0])) return null;
	if (contains_hoisted_declaration(node)) return null;

	return body[0];
}

/**
 * Reports whether an iterable literal provably yields nothing.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function is_empty_iterable(node) {
	if (!node) return false;
	const expression = unwrap_expression(node);

	if (expression.type === 'ArrayExpression') return expression.elements.length === 0;
	if (expression.type === 'Literal') return expression.value === '';

	return false;
}

/**
 * One optimization round over a module.
 *
 * @param {AST.Program} ast
 * @param {string | null} filename
 * @returns {{ ast: AST.Program, changed: boolean }}
 */
function run_round(ast, filename) {
	const resolve = create_constant_resolver(ast, filename);
	let changed = false;

	/**
	 * Removes the markers a collapsed directive left behind.
	 *
	 * @param {AST.Node} node
	 * @param {{ next: () => AST.Node | undefined }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_list_container(node, { next }) {
		const visited = /** @type {any} */ (next() ?? node);
		const key = 'children' in visited ? 'children' : 'body';
		const list = visited[key];
		if (!Array.isArray(list)) return visited === node ? undefined : visited;

		const pruned = prune_removed(list);
		if (!pruned) return visited === node ? undefined : visited;

		changed = true;
		return { ...visited, [key]: pruned };
	}

	/**
	 * @param {AST.SwitchCase} node
	 * @param {{ next: () => AST.Node | undefined }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_switch_case(node, { next }) {
		const visited = /** @type {AST.SwitchCase} */ (next() ?? node);
		const pruned = prune_removed(visited.consequent);
		if (!pruned) return visited === node ? undefined : visited;

		changed = true;
		return { ...visited, consequent: /** @type {AST.Statement[]} */ (pruned) };
	}

	/**
	 * @param {AST.JSXCodeBlock} node
	 * @param {{ next: () => AST.Node | undefined }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_code_block(node, { next }) {
		const visited = /** @type {AST.JSXCodeBlock} */ (next() ?? node);
		const pruned = visited.body ? prune_removed(visited.body) : null;
		// A code block still has to render something.
		// So an eliminated output becomes an empty fragment instead of nothing.
		const render = is_removed(visited.render)
			? empty_fragment(/** @type {AST.Node} */ (visited.render))
			: visited.render;

		if (!pruned && render === visited.render) return visited === node ? undefined : visited;

		changed = true;
		return {
			...visited,
			body: /** @type {AST.Statement[]} */ (pruned ?? visited.body),
			render: /** @type {any} */ (render),
		};
	}

	/**
	 * @param {AST.Node} node
	 * @param {{ next: () => AST.Node | undefined, path: AST.Node[] }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_if(node, { next, path }) {
		const chain_link = is_template_if_chain_link(node, path);
		const visited = /** @type {AST.IfStatement} */ (next() ?? node);
		const unchanged = visited === node ? undefined : visited;

		// A plain `if` is ordinary JavaScript, not a TSRX directive.
		if (!is_template_directive_node(visited)) return unchanged;
		// A chain link is collapsed by its head, never on its own.
		if (chain_link) return unchanged;

		const replacement = collapse_template_if(visited, resolve);
		if (!replacement) return unchanged;
		// A directive whose slot cannot drop it stays as authored.
		if (is_removed(replacement) && !removal_is_handled(path)) return unchanged;

		changed = true;
		return replacement;
	}

	/**
	 * @param {AST.Node} node
	 * @param {{ next: () => AST.Node | undefined, path: AST.Node[] }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_switch(node, { next, path }) {
		const visited = /** @type {AST.SwitchStatement} */ (next() ?? node);
		const unchanged = visited === node ? undefined : visited;

		if (!is_template_directive_node(visited)) return unchanged;

		const discriminant = evaluate_expression(visited.discriminant, resolve);
		if (!discriminant) return unchanged;

		const replacement = collapse_switch(visited, discriminant.value, resolve);
		if (!replacement) return unchanged;
		if (is_removed(replacement) && !removal_is_handled(path)) return unchanged;

		changed = true;
		return replacement;
	}

	/**
	 * @param {AST.Node} node
	 * @param {{ next: () => AST.Node | undefined, path: AST.Node[] }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_for(node, { next, path }) {
		const visited = /** @type {AST.ForOfStatement} */ (next() ?? node);
		const unchanged = visited === node ? undefined : visited;

		if (!is_template_directive_node(visited)) return unchanged;
		if (!is_empty_iterable(visited.right)) return unchanged;
		if (contains_hoisted_declaration(visited.body)) return unchanged;

		// `@empty { … }` is the authored fallback for a loop that yields nothing.
		// An empty iterable renders that clause, so the loop becomes its body.
		const fallback = /** @type {{ empty?: AST.Node | null }} */ (visited).empty;
		if (fallback) {
			const child = branch_to_render_child(fallback);
			if (!child) return unchanged;
			changed = true;
			return child;
		}

		if (!removal_is_handled(path)) return unchanged;

		changed = true;
		return removed_node;
	}

	const visitors = {
		Program: visit_list_container,
		BlockStatement: visit_list_container,
		StaticBlock: visit_list_container,
		SwitchCase: visit_switch_case,
		JSXElement: visit_list_container,
		JSXFragment: visit_list_container,
		JSXCodeBlock: visit_code_block,

		IfStatement: visit_if,
		JSXIfExpression: visit_if,
		SwitchStatement: visit_switch,
		JSXSwitchExpression: visit_switch,
		ForOfStatement: visit_for,
		JSXForExpression: visit_for,
	};

	const next_ast = /** @type {AST.Program} */ (
		walk(/** @type {AST.Node} */ (ast), null, /** @type {any} */ (visitors))
	);

	return { ast: next_ast, changed };
}

/**
 * Removes the TSRX directives that a module's own constants prove dead.
 * The pass only rewrites `@if`, `@else if`, `@switch`, and `@for`.
 * It reads constants and decides a directive test to choose a branch.
 * It never rewrites the code those values came from.
 * Plain JavaScript, setup statements, and expressions stay as authored.
 * It is opt-in through the `optimize` compile option.
 * It must not run on the editor and Volar path.
 * Those mappings have to match the authored source one for one.
 *
 * @param {AST.Program} ast
 * @param {string | null | undefined} filename
 * @param {OptimizeOptions} [options]
 * @returns {OptimizeResult}
 */
export function optimize_tsrx(ast, filename, options = {}) {
	const rounds = options.maxRounds ?? MAX_ROUNDS;
	let current = ast;

	for (let round = 0; round < rounds; round += 1) {
		const result = run_round(current, filename ?? null);
		current = result.ast;
		if (!result.changed) break;
	}

	return { ast: current };
}
