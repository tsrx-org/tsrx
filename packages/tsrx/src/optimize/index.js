/** @import * as AST from 'estree' */
/** @import { Binding, OptimizeOptions, OptimizeResult, ResolveStaticIdentifier, StaticValue } from '../../types/index' */

import { walk } from 'zimmerframe';
import * as b from '../utils/builders.js';
import { analyze_constants } from './constants.js';
import {
	evaluate_expression,
	is_already_folded,
	unwrap_expression,
	value_to_node,
} from './evaluate.js';

/**
 * Marker that stands in for a node the pass removed.
 * zimmerframe can replace a node but cannot delete one.
 * So a visitor swaps a dead node for this marker.
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
 * An unbraced `if` arm, a loop body, and a loop header are not such slots.
 *
 * @param {AST.Node[]} path
 * @returns {boolean}
 */
function removal_is_handled(path) {
	const parent = path.at(-1);
	return !!parent && REMOVAL_CONTAINERS.has(parent.type);
}

/**
 * One fold can expose the next.
 * Replacing `flag` with `false` is what makes the `@if` above it dead.
 * So the pass repeats until a round changes nothing.
 * This cap only stops a bug from looping forever.
 */
const MAX_ROUNDS = 5;

/**
 * Node kinds that can stand where a template renders a child.
 * A branch holding exactly one of these can replace its `@if`.
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
 * Identifier positions where a name is a value that can be substituted.
 * A shorthand property shares one node between its key and its value.
 * Folding it would rewrite the key too, so it is excluded.
 * The other excluded positions are names rather than reads.
 *
 * @param {AST.Identifier} node
 * @param {AST.Node[]} path
 * @returns {boolean}
 */
function is_foldable_identifier_position(node, path) {
	const parent = path.at(-1);
	if (!parent) return false;

	switch (parent.type) {
		case 'Property':
			return !parent.shorthand && parent.key !== node;
		case 'MemberExpression':
			return parent.computed || parent.property !== node;
		case 'LabeledStatement':
		case 'BreakStatement':
		case 'ContinueStatement':
		case 'ImportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
		case 'ExportSpecifier':
		case 'MethodDefinition':
		case 'PropertyDefinition':
			return false;
		default:
			return true;
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
 * Statement kinds that can be dropped once control cannot reach them.
 * Declarations are excluded on purpose.
 * They are either hoisted, or removed later by the unused-binding rule.
 * That rule checks that nothing refers to them, which is what makes it safe.
 *
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_droppable_when_unreachable(node) {
	switch (node.type) {
		case 'ExpressionStatement':
		case 'IfStatement':
		case 'BlockStatement':
		case 'ReturnStatement':
		case 'ThrowStatement':
		case 'BreakStatement':
		case 'ContinueStatement':
		case 'DebuggerStatement':
		case 'EmptyStatement':
		case 'SwitchStatement':
		case 'TryStatement':
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'ForStatement':
		case 'ForInStatement':
		case 'ForOfStatement':
		case 'LabeledStatement':
		case 'WithStatement':
			// A template directive is output, not control flow.
			// Reachability alone is not a reason to drop one.
			return !is_template_directive_node(node);
		default:
			return false;
	}
}

/**
 * Reports whether dropping an initializer can be observed.
 * A statically evaluable expression is safe to drop.
 * So is a function literal, which touches nothing outside itself.
 * A class literal is not, because evaluating it runs `extends`, static fields,
 * static blocks, and computed static keys.
 *
 * @param {AST.Node} node
 * @param {ResolveStaticIdentifier} resolve
 * @returns {boolean}
 */
function is_pure_initializer(node, resolve) {
	switch (unwrap_expression(node).type) {
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			return true;
		default:
			return !!evaluate_expression(node, resolve);
	}
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_terminator(node) {
	return (
		node.type === 'ReturnStatement' ||
		node.type === 'ThrowStatement' ||
		node.type === 'BreakStatement' ||
		node.type === 'ContinueStatement'
	);
}

/**
 * Drops removal markers.
 * Then drops whatever follows an unconditional jump.
 *
 * @param {AST.Node[]} body
 * @returns {AST.Node[] | null} The new list, or `null` when nothing changed.
 */
function prune_statements(body) {
	/** @type {AST.Node[]} */
	const result = [];
	let terminated = false;
	let changed = false;

	for (const statement of body) {
		if (is_removed(statement)) {
			changed = true;
			continue;
		}

		if (terminated && is_droppable_when_unreachable(statement)) {
			changed = true;
			continue;
		}

		result.push(statement);
		if (!terminated && is_terminator(statement)) terminated = true;
	}

	return changed ? result : null;
}

/**
 * @param {AST.Node[]} children
 * @returns {AST.Node[] | null}
 */
function prune_children(children) {
	if (!children.some(is_removed)) return null;
	return children.filter((child) => !is_removed(child));
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
 * Every link of an `@if` / `@else if` chain, head first.
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
 * Collapses a template `@if` chain against the tests it can evaluate.
 * A link whose test is provably false is dropped.
 * The first provably true test ends the chain, and its branch is the result.
 * A chain that reduces to one output node replaces the directive.
 * A chain that still has an unknown test is rebuilt from the surviving links.
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
		const test = evaluate_expression(link.test, resolve);

		if (!test) {
			kept.push(link);
			continue;
		}

		if (test.value) {
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
 * Collapse a plain `if` statement whose test is statically known.
 *
 * @param {AST.IfStatement} node
 * @param {StaticValue} test
 * @returns {AST.Node | null}
 */
function collapse_if(node, test) {
	const taken = test ? node.consequent : node.alternate;
	const dropped = test ? node.alternate : node.consequent;

	if (contains_hoisted_declaration(dropped)) return null;
	// In statement position the branch is already a block.
	// Keeping the block preserves its own `let` and `const` scope.
	return taken ?? removed_node;
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
	const { values, declarations, unused, resolve } = analyze_constants(ast, filename);
	let changed = false;

	/**
	 * @param {AST.Node} node
	 * @returns {AST.Node | undefined}
	 */
	function fold_expression(node) {
		const evaluated = evaluate_expression(node, resolve);
		if (!evaluated || is_already_folded(node, evaluated.value)) return undefined;

		const folded = value_to_node(
			evaluated.value,
			/** @type {AST.NodeWithLocation} */ (/** @type {unknown} */ (node)),
		);
		if (!folded) return undefined;

		changed = true;
		return folded;
	}

	/**
	 * @param {AST.Node} node
	 * @param {{ next: () => AST.Node | undefined }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_list_container(node, { next }) {
		const visited = /** @type {any} */ (next() ?? node);
		const key = 'children' in visited ? 'children' : 'body';
		const list = visited[key];
		if (!Array.isArray(list)) return visited === node ? undefined : visited;

		const pruned = key === 'children' ? prune_children(list) : prune_statements(list);
		if (!pruned) return visited === node ? undefined : visited;

		changed = true;
		return { ...visited, [key]: pruned };
	}

	/**
	 * @param {AST.Identifier} node
	 * @param {{ path: AST.Node[] }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_identifier(node, { path }) {
		if (!values.has(node) || declarations.has(node)) return undefined;
		if (!is_foldable_identifier_position(node, path)) return undefined;
		return fold_expression(node);
	}

	const visitors = {
		Identifier: visit_identifier,

		UnaryExpression: fold_expression_visitor,
		BinaryExpression: fold_expression_visitor,
		LogicalExpression: fold_expression_visitor,
		ConditionalExpression: fold_expression_visitor,
		TemplateLiteral: fold_expression_visitor,

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

		VariableDeclaration: visit_variable_declaration,
	};

	/**
	 * @param {AST.Node} node
	 * @param {{ next: () => AST.Node | undefined }} context
	 * @returns {AST.Node | undefined}
	 */
	function fold_expression_visitor(node, { next }) {
		const visited = next() ?? node;
		return fold_expression(visited) ?? (visited === node ? undefined : visited);
	}

	/**
	 * @param {AST.SwitchCase} node
	 * @param {{ next: () => AST.Node | undefined }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_switch_case(node, { next }) {
		const visited = /** @type {AST.SwitchCase} */ (next() ?? node);
		const pruned = prune_statements(visited.consequent);
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
		const pruned = visited.body ? prune_statements(visited.body) : null;
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

		// A chain link is collapsed by its head, never on its own.
		if (chain_link) return unchanged;

		if (is_template_directive_node(visited)) {
			const replacement = collapse_template_if(visited, resolve);
			if (!replacement) return unchanged;
			// A directive whose slot cannot drop it stays as authored.
			if (is_removed(replacement) && !removal_is_handled(path)) return unchanged;
			changed = true;
			return replacement;
		}

		const test = evaluate_expression(visited.test, resolve);
		if (!test) return unchanged;

		const replacement = collapse_if(visited, test.value);
		if (!replacement) return unchanged;

		changed = true;
		// An unbraced arm, a loop body, and a label body all need a statement.
		// An empty one is the smallest valid stand-in for the removed `if`.
		if (is_removed(replacement) && !removal_is_handled(path)) {
			return { type: 'EmptyStatement', metadata: { path: [] } };
		}
		return replacement;
	}

	/**
	 * @param {AST.Node} node
	 * @param {{ next: () => AST.Node | undefined }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_switch(node, { next }) {
		const visited = /** @type {AST.SwitchStatement} */ (next() ?? node);
		if (!is_template_directive_node(visited)) return visited === node ? undefined : visited;

		const discriminant = evaluate_expression(visited.discriminant, resolve);
		if (!discriminant) return visited === node ? undefined : visited;

		const replacement = collapse_switch(visited, discriminant.value, resolve);
		if (!replacement) return visited === node ? undefined : visited;

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

	/**
	 * @param {AST.VariableDeclaration} node
	 * @param {{ next: () => AST.Node | undefined, path: AST.Node[] }} context
	 * @returns {AST.Node | undefined}
	 */
	function visit_variable_declaration(node, { next, path }) {
		const visited = /** @type {AST.VariableDeclaration} */ (next() ?? node);
		// `var` is hoisted, so removing it changes what other code sees.
		// An exported name is public no matter how this module uses it.
		// A loop header is not a statement list, so its declaration has to stay.
		if (
			visited.kind === 'var' ||
			path.at(-1)?.type.startsWith('Export') ||
			!removal_is_handled(path)
		) {
			return visited === node ? undefined : visited;
		}

		const kept = visited.declarations.filter((declarator) => {
			if (declarator.id.type !== 'Identifier') return true;
			const binding = declarations.get(declarator.id);
			if (!binding || binding.kind !== 'normal' || !unused.has(binding)) return true;
			// A name nothing reads is removable only if its initializer is pure.
			return !!declarator.init && !is_pure_initializer(declarator.init, resolve);
		});

		if (kept.length === visited.declarations.length) {
			return visited === node ? undefined : visited;
		}

		changed = true;
		return kept.length === 0 ? removed_node : { ...visited, declarations: kept };
	}

	const next_ast = /** @type {AST.Program} */ (
		walk(/** @type {AST.Node} */ (ast), null, /** @type {any} */ (visitors))
	);

	return { ast: next_ast, changed };
}

/**
 * Folds statically known expressions and removes the code they prove dead.
 * The pass is target-neutral.
 * It runs on the parsed TSRX AST before any target transform.
 * Every target therefore gets the same eliminations.
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
