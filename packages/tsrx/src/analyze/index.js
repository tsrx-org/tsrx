/**
@import * as AST from 'estree';
@import { TSRXAnalysisOptions, TSRXAnalysisResult, TSRXAnalysisState } from '../../types/index';
 */

import { walk } from 'zimmerframe';
import {
	is_code_block_function_body,
	is_statement_position,
	is_supported_lazy_assignment_position,
	is_transparent_expression_wrapper,
	is_tsrx_render_output_node,
} from '../utils/ast.js';
import {
	validate_forgotten_statement_container,
	validate_unsupported_lazy_assignment_position,
} from './validation.js';
import { create_scopes, ScopeRoot } from '../scope.js';
import { analyze_styles, is_template_statement_list_style } from './style-analyze.js';

/**
 * Find the first authored lazy pattern along an assignment target's binding
 * edges. Default-value expressions and computed keys are evaluated
 * expressions, so nested assignments there own their own diagnostics.
 *
 * @param {AST.Node} node
 * @returns {import('../../types/index').LazyPattern | null}
 */
function find_first_lazy_pattern(node) {
	if ((node.type === 'ObjectPattern' || node.type === 'ArrayPattern') && node.lazy) {
		return node;
	}

	switch (node.type) {
		case 'AssignmentPattern':
			return find_first_lazy_pattern(node.left);
		case 'RestElement':
			return find_first_lazy_pattern(node.argument);
		case 'ObjectPattern':
			for (const property of node.properties) {
				const lazy =
					property.type === 'Property'
						? find_first_lazy_pattern(property.value)
						: find_first_lazy_pattern(property.argument);
				if (lazy) return lazy;
			}
			return null;
		case 'ArrayPattern':
			for (const element of node.elements) {
				if (!element) continue;
				const lazy = find_first_lazy_pattern(element);
				if (lazy) return lazy;
			}
			return null;
		default: {
			const expression = /** @type {{ expression?: AST.Node }} */ (node).expression;
			return expression && is_transparent_expression_wrapper(node, expression)
				? find_first_lazy_pattern(expression)
				: null;
		}
	}
}

/**
 * @param {AST.AssignmentExpression} node
 * @param {{ next: () => unknown, path: AST.Node[], state: TSRXAnalysisState }} context
 */
function visit_assignment_expression(node, { next, path, state }) {
	const lazy = find_first_lazy_pattern(node.left);

	if (lazy && !is_supported_lazy_assignment_position(node, path)) {
		validate_unsupported_lazy_assignment_position(
			lazy,
			state.filename,
			state.collect ? state.errors : undefined,
			state.comments,
		);
	}

	next();
}

/**
 * A template is unused only when it is itself the statement being executed.
 * Templates nested in assignments, returns, arguments, operands, or other
 * value-producing expressions may be consumed later and are valid.
 *
 * @param {AST.Node} node
 * @param {AST.Node[]} path
 * @returns {boolean}
 */
function is_free_floating_template(node, path) {
	let child = node;

	for (let i = path.length - 1; i >= 0; i -= 1) {
		const parent = path[i];

		if (is_transparent_expression_wrapper(parent, child)) {
			child = parent;
			continue;
		}

		if (parent.type === 'ExpressionStatement' && parent.expression === child) {
			return true;
		}

		if (is_statement_position(parent, child)) {
			return true;
		}

		return false;
	}

	return false;
}

/**
 * @param {AST.Function} node
 * @param {{ next: (state?: TSRXAnalysisState) => unknown, state: TSRXAnalysisState }} context
 */
function visit_function(node, { next, state }) {
	next({
		...state,
		function: node,
		function_body_is_code_block: is_code_block_function_body(node.body, node),
		inside_template_output: false,
	});
}

/**
 * @param {AST.Node} node
 * @param {{ next: (state?: TSRXAnalysisState) => unknown, path: AST.Node[], state: TSRXAnalysisState }} context
 */
function visit_render_output(node, { next, path, state }) {
	if (!is_tsrx_render_output_node(node)) {
		next();
		return;
	}

	// A `<style>` block is not rendered output: as a sibling in a `@{ … }` body
	// or a directive body it contributes CSS to that scope (D3).
	if (node.type === 'JSXStyleElement' && is_template_statement_list_style(path)) {
		next();
		return;
	}

	if (
		state.function &&
		!(state.function_body_is_code_block && state.function.body === node) &&
		!state.inside_template_output &&
		is_free_floating_template(node, path)
	) {
		validate_forgotten_statement_container(
			node,
			state.filename,
			state.collect ? state.errors : undefined,
			state.comments,
		);
	}

	// A JSXCodeBlock contains ordinary setup statements in `body` as well as
	// the retained output in `render`. Reset the template context while walking
	// both fields so free-floating output in setup is still diagnosed. The
	// render node itself is retained by the code block, and establishes template
	// context for its own descendants when this visitor reaches it.
	next({ ...state, inside_template_output: node.type !== 'JSXCodeBlock' });
}

/**
 * @param {AST.ClassDeclaration | AST.ClassExpression} _node
 * @param {{ next: (state?: TSRXAnalysisState) => unknown, state: TSRXAnalysisState }} context
 */
function visit_class(_node, { next, state }) {
	next({
		...state,
		function: null,
		function_body_is_code_block: false,
		inside_template_output: false,
	});
}

const visitors = {
	AssignmentExpression: visit_assignment_expression,

	FunctionDeclaration: visit_function,
	FunctionExpression: visit_function,
	ArrowFunctionExpression: visit_function,

	// A class body is not part of the surrounding function's execution context.
	// Method/function nodes establish their own context when reached.
	ClassDeclaration: visit_class,
	ClassExpression: visit_class,

	JSXElement: visit_render_output,
	JSXFragment: visit_render_output,
	JSXStyleElement: visit_render_output,
	JSXCodeBlock: visit_render_output,
	JSXIfExpression: visit_render_output,
	JSXForExpression: visit_render_output,
	JSXSwitchExpression: visit_render_output,
	JSXTryExpression: visit_render_output,
};

/**
 * Run target-neutral semantic validation over a parsed TSRX module. Parsing
 * remains syntax-only; every target invokes this pass before target analysis or
 * transformation. Type-only/Volar callers collect diagnostics and continue.
 *
 * @param {AST.Program} ast
 * @param {string | null | undefined} filename
 * @param {TSRXAnalysisOptions} [options]
 * @returns {TSRXAnalysisResult}
 */
export function analyze_tsrx(ast, filename, options = {}) {
	const errors = options.errors ?? [];
	const comments = options.comments ?? [];
	const collect = !!(options.collect || options.loose || options.typeOnly || options.to_ts);

	/** @type {TSRXAnalysisState} */
	const state = {
		filename: filename ?? null,
		collect,
		errors,
		comments,
		function: null,
		function_body_is_code_block: false,
		inside_template_output: false,
	};

	walk(ast, state, visitors);

	// Style `apply` targets resolve through real bindings. Scope diagnostics
	// (duplicate declarations, reserved names) stay with the compilers that
	// already report them, so this run collects into a private list.
	const { scope, scopes } = create_scopes(ast, new ScopeRoot(), null, {
		filename: /** @type {string} */ (filename ?? null),
		collect: true,
		errors: [],
		comments,
	});
	const styles = analyze_styles(ast, scopes, state);

	return { ast, errors, comments, scope, scopes, styles };
}
