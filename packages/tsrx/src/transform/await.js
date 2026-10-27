/** @import * as AST from 'estree' */

import { child_nodes, is_ast_node } from '../utils/ast.js';

/**
 * @param {AST.Node[]} body_nodes
 * @returns {AST.TSRXAwaitNode | null}
 */
export function find_first_top_level_await_in_tsrx_function_body(body_nodes) {
	for (const node of body_nodes) {
		const found = find_first_top_level_await(node, false);
		if (found) return found;
	}

	return null;
}

/**
 * @param {AST.Node | AST.Node[] | null | undefined} node
 * @param {boolean} inside_nested_function
 * @returns {AST.TSRXAwaitNode | null}
 */
export function find_first_top_level_await(node, inside_nested_function) {
	if (!node) {
		return null;
	}

	if (Array.isArray(node)) {
		for (const child of node) {
			const found = find_first_top_level_await(child, inside_nested_function);
			if (found) return found;
		}

		return null;
	}

	if (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	) {
		return inside_nested_function ? null : find_first_top_level_await(node.body, true);
	}

	if (inside_nested_function) {
		return null;
	}

	if (is_await_node(node)) {
		return node;
	}

	for (const child of child_nodes(node)) {
		const found = find_first_top_level_await(child, false);
		if (found) return found;
	}

	return null;
}

/**
 * Every `await` in `node` outside nested functions, including one inside
 * another, in the order the walk meets them.
 *
 * @param {AST.Node | AST.Node[] | null | undefined} node
 * @param {AST.TSRXAwaitNode[]} [awaits]
 * @returns {AST.TSRXAwaitNode[]}
 */
export function find_top_level_awaits(node, awaits = []) {
	if (!node) {
		return awaits;
	}

	if (Array.isArray(node)) {
		for (const child of node) find_top_level_awaits(child, awaits);
		return awaits;
	}

	if (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	) {
		return awaits;
	}

	if (is_await_node(node)) {
		awaits.push(node);
	}

	for (const child of child_nodes(node)) find_top_level_awaits(child, awaits);
	return awaits;
}

/**
 * An `await using` declaration awaits its resources' disposal, so it counts as
 * an `await` even though it holds no `AwaitExpression`.
 *
 * @param {AST.Node} node
 * @returns {node is AST.TSRXAwaitNode}
 */
function is_await_node(node) {
	return (
		node.type === 'AwaitExpression' ||
		(node.type === 'VariableDeclaration' && node.kind === 'await using') ||
		(node.type === 'ForOfStatement' && node.await === true) ||
		(node.type === 'JSXForExpression' &&
			node.statementType === 'ForOfStatement' &&
			node.await === true)
	);
}
