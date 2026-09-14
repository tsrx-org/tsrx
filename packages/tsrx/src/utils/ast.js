/** @import * as AST from 'estree' */

import * as b from './builders.js';

/**
 * @param {unknown} value
 * @returns {value is AST.Node}
 */
export function is_ast_node(value) {
	return !!value && typeof value === 'object' && 'type' in value;
}

/**
 * The child nodes reachable from `node`'s own properties, flattening node
 * arrays. Positional and metadata keys are skipped: they never hold children,
 * and `metadata` in particular can hold memoized lowerings of nodes that are
 * already reachable elsewhere in the tree.
 *
 * @param {AST.Node} node
 * @param {string} [skip_key] an extra own key to skip
 * @returns {AST.Node[]}
 */
export function child_nodes(node, skip_key) {
	/** @type {AST.Node[]} */
	const children = [];
	const entries = /** @type {AST.TraversableAstNode} */ (node);
	for (const key of Object.keys(entries)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
		if (key === skip_key) continue;
		const value = entries[key];
		if (Array.isArray(value)) {
			for (const item of value) {
				if (is_ast_node(item)) children.push(item);
			}
		} else if (is_ast_node(value)) {
			children.push(value);
		}
	}
	return children;
}

/**
 * The children a node carries, as nodes. Node types differ in whether they
 * have a `children` slot at all (`JSXCodeBlock` does not) and in what it may
 * hold, so this reads it uniformly instead of forcing every caller to narrow.
 *
 * @param {AST.Node} node
 * @returns {AST.Node[]}
 */
export function node_children(node) {
	const children = /** @type {AST.TraversableAstNode} */ (node).children;
	return Array.isArray(children) ? children.filter(is_ast_node) : [];
}

/**
 * @template {object} T
 * @param {T | null | undefined} node
 * @returns {node is T & AST.NodeWithLocation}
 */
export function has_location(node) {
	if (node == null) return false;
	const location = /** @type {Partial<AST.NodeWithLocation>} */ (node);
	return location.loc != null && location.start !== undefined && location.end !== undefined;
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.JSXStyleElement}
 */
export function is_style_element(node) {
	return !!node && node.type === 'JSXStyleElement';
}

/**
 * @param {AST.Node} node
 * @returns {node is AST.Function}
 */
export function is_function_node(node) {
	return (
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.Function | AST.ClassDeclaration | AST.ClassExpression}
 */
export function is_function_or_class_node(node) {
	return !!node && (is_function_node(node) || is_class_node(node));
}

/**
 * @param {AST.Node} node
 * @returns {node is AST.Function}
 */
export function is_function_or_component_node(node) {
	return is_function_node(node);
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
export function is_class_node(node) {
	return node.type === 'ClassExpression' || node.type === 'ClassDeclaration';
}

/**
 * A parsed `@if`/`@for`/`@switch`/`@try` control-flow directive.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.JSXTemplateDirective}
 */
export function is_template_directive(node) {
	return (
		node?.type === 'JSXIfExpression' ||
		node?.type === 'JSXForExpression' ||
		node?.type === 'JSXSwitchExpression' ||
		node?.type === 'JSXTryExpression'
	);
}

/**
 * Any source AST node that can be the rendered output of a TSRX template or
 * statement container.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.TSRXRenderOutput}
 */
export function is_tsrx_render_output_node(node) {
	return !!(
		node &&
		(node.type === 'JSXElement' ||
			node.type === 'JSXFragment' ||
			node.type === 'JSXStyleElement' ||
			node.type === 'JSXCodeBlock' ||
			is_template_directive(node))
	);
}

/**
 * @param {AST.Node | null | undefined} node
 * @param {AST.Node | null | undefined} parent
 * @returns {node is AST.JSXCodeBlock}
 */
export function is_code_block_function_body(node, parent) {
	return !!(
		node &&
		node.type === 'JSXCodeBlock' &&
		parent &&
		is_function_node(parent) &&
		parent.body === node
	);
}

/**
 * Returns whether `child` directly occupies a statement slot of `parent`.
 * Parser-native TSRX output nodes can appear in these slots without an
 * `ExpressionStatement` wrapper, notably as braceless control-flow bodies.
 *
 * @param {AST.Node} parent
 * @param {AST.Node} child
 * @returns {boolean}
 */
export function is_statement_position(parent, child) {
	if (is_statement_list_item(parent, child)) return true;

	switch (parent.type) {
		case 'IfStatement':
			return parent.consequent === child || parent.alternate === child;
		case 'ForStatement':
		case 'ForInStatement':
		case 'ForOfStatement':
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'LabeledStatement':
		case 'WithStatement':
			return parent.body === child;
		default:
			return false;
	}
}

/**
 * Returns whether `child` is a direct item in a statement list. Unlike
 * {@link is_statement_position}, this deliberately excludes single-statement
 * control-flow bodies: transforms may replace a list item with declarations,
 * but a declaration is not valid in those braceless statement slots.
 *
 * @param {AST.Node} parent
 * @param {AST.Node} child
 * @returns {boolean}
 */
export function is_statement_list_item(parent, child) {
	switch (parent.type) {
		case 'Program':
		case 'BlockStatement':
		case 'JSXCodeBlock':
			return parent.body.includes(/** @type {AST.Statement} */ (child));
		case 'SwitchCase':
			return parent.consequent.includes(/** @type {AST.Statement} */ (child));
		default:
			return false;
	}
}

/**
 * Whether `parent` preserves `child` as the same expression value. Looking
 * through these wrappers keeps strict and editor-oriented ASTs on the same
 * semantic path.
 *
 * @param {AST.Node} parent
 * @param {AST.Node} child
 * @returns {boolean}
 */
export function is_transparent_expression_wrapper(parent, child) {
	return (
		(parent.type === 'ParenthesizedExpression' ||
			parent.type === 'TSAsExpression' ||
			parent.type === 'TSSatisfiesExpression' ||
			parent.type === 'TSNonNullExpression' ||
			parent.type === 'TSInstantiationExpression' ||
			parent.type === 'TSTypeAssertion' ||
			parent.type === 'ChainExpression') &&
		/** @type {{ expression?: AST.Node }} */ (parent).expression === child
	);
}

/**
 * Returns the closest native TSRX function in an ancestry path. By default,
 * function and class boundaries stop the search so callers only match direct
 * native TSRX function body/control-flow nodes.
 *
 * @param {AST.Node[]} path
 * @param {boolean} [includes_functions=false]
 * @returns {AST.Function | undefined}
 */
export function get_component_from_path(path, includes_functions = false) {
	for (let i = path.length - 1; i >= 0; i -= 1) {
		const node = path[i];

		if (is_function_node(node)) {
			if (node.metadata?.native_tsrx_function) {
				return node;
			}
			if (!includes_functions) {
				return;
			}
		}

		if (!includes_functions && is_class_node(node)) {
			return;
		}
	}
}

/**
 * @param {AST.Node[] | { path: AST.Node[] }} context_or_path
 * @param {boolean} [includes_functions=false]
 * @returns {AST.Function | undefined}
 */
export function is_inside_component(context_or_path, includes_functions = false) {
	const path = Array.isArray(context_or_path) ? context_or_path : context_or_path.path;
	return get_component_from_path(path, includes_functions);
}

/**
 * Gets the left-most identifier of a member expression or identifier.
 * @param {AST.MemberExpression | AST.Identifier} expression
 * @returns {AST.Identifier | null}
 */
export function object(expression) {
	while (expression.type === 'MemberExpression') {
		expression = /** @type {AST.MemberExpression | AST.Identifier} */ (expression.object);
	}

	if (expression.type !== 'Identifier') {
		return null;
	}

	return expression;
}

/**
 * Extracts all identifiers and member expressions from a pattern.
 * @param {AST.Pattern} pattern
 * @param {Array<AST.Identifier | AST.MemberExpression>} [nodes]
 * @returns {Array<AST.Identifier | AST.MemberExpression>}
 */
export function unwrap_pattern(pattern, nodes = []) {
	switch (pattern.type) {
		case 'Identifier':
			nodes.push(pattern);
			break;

		case 'MemberExpression':
			// member expressions can be part of an assignment pattern, but not a binding pattern
			// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment#binding_and_assignment
			nodes.push(pattern);
			break;

		case 'ObjectPattern':
			for (const prop of pattern.properties) {
				if (prop.type === 'RestElement') {
					unwrap_pattern(prop.argument, nodes);
				} else {
					unwrap_pattern(prop.value, nodes);
				}
			}

			break;

		case 'ArrayPattern':
			for (const element of pattern.elements) {
				if (element) unwrap_pattern(element, nodes);
			}

			break;

		case 'RestElement':
			unwrap_pattern(pattern.argument, nodes);
			break;

		case 'AssignmentPattern':
			unwrap_pattern(pattern.left, nodes);
			break;
	}

	return nodes;
}

/**
 * Extracts all identifiers from a pattern.
 * @param {AST.Pattern} pattern
 * @returns {AST.Identifier[]}
 */
export function extract_identifiers(pattern) {
	return unwrap_pattern(pattern, []).filter((node) => node.type === 'Identifier');
}

/**
 * @param {AST.AssignmentOperator} operator
 * @param {AST.Identifier | AST.MemberExpression} left
 * @param {AST.Expression} right
 */
export function build_assignment_value(operator, left, right) {
	return operator === '='
		? right
		: // turn something like x += 1 into x = x + 1
			b.binary(/** @type {AST.BinaryOperator} */ (operator.slice(0, -1)), left, right);
}
