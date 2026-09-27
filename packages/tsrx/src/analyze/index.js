/**
@import * as AST from 'estree';
@import * as ESTreeJSX from 'estree-jsx';
@import { TSRXAnalysisOptions, TSRXAnalysisResult, TSRXAnalysisState } from '../../types/index';
 */

import { walk } from 'zimmerframe';
import {
	is_code_block_function_body,
	is_statement_position,
	is_transparent_expression_wrapper,
	is_tsrx_render_output_node,
} from '../utils/ast.js';
import { validate_forgotten_statement_container, validate_jsx_spread_child } from './validation.js';
import { is_jsx_child_tooling_comment } from '../comment-utils.js';
import { create_scopes, ScopeRoot } from '../scope.js';
import { analyze_styles } from './style-analyze.js';

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
 * @param {ESTreeJSX.JSXSpreadChild} node
 * @param {{ next: (state?: TSRXAnalysisState) => unknown, state: TSRXAnalysisState }} context
 */
function visit_jsx_spread_child(node, { next, state }) {
	validate_jsx_spread_child(
		node,
		state.filename,
		state.collect ? state.errors : undefined,
		state.comments,
	);
	next();
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

/**
 * A comment between children renders like `{/* … *\/}` in TSX: the text on
 * each side of it follows JSX's whitespace rules on its own. The parser keeps
 * the text around comments as one `JSXText` with its pieces in
 * `metadata.text_pieces`; this splits it into those pieces, with an empty
 * `{}` between two of them so that they stay apart in the output, as every
 * target's JSX compiler reads it. A piece that is whitespace with a line break
 * renders nothing and is left out.
 *
 * A tooling comment (`// @ts-expect-error`, see
 * `is_jsx_child_tooling_comment`) goes into its `{}` for the editor's
 * TypeScript, as `{/* @ts-expect-error *\/}` works in TSX, and the text around
 * it keeps its line breaks, so that it stays on the line before the child it's
 * about. Only type-only compiles pass the comments.
 * @param {any[]} list
 * @param {AST.CommentWithLocation[]} comments
 * @returns {any[]}
 */
function split_text_pieces(list, comments) {
	/** @type {any[]} */
	const result = [];
	for (const child of list) {
		const pieces = child?.type === 'JSXText' ? child.metadata?.text_pieces : undefined;
		if (!pieces) {
			result.push(child);
			continue;
		}
		// The comment between each piece and the next starts where the piece ends.
		const tooling = pieces.slice(0, -1).map((/** @type {any} */ piece) => {
			const comment = comments.find((comment) => comment.start === piece.end);
			return comment && is_jsx_child_tooling_comment(comment) ? comment : null;
		});
		const keep_layout = tooling.some(Boolean);
		/** @type {any} */
		let previous = null;
		for (const [index, piece] of pieces.entries()) {
			const renders =
				piece.value !== '' && (!/[\r\n]/.test(piece.value) || /[^ \t\r\n]/.test(piece.value));
			if (renders || (keep_layout && piece.value !== '')) {
				if (previous && !keep_layout) {
					result.push(
						empty_container(previous.end, piece.start, previous.loc.end, piece.loc.start),
					);
				}
				previous = {
					type: 'JSXText',
					value: piece.value,
					raw: piece.value,
					start: piece.start,
					end: piece.end,
					loc: piece.loc,
					metadata: { path: [] },
				};
				result.push(previous);
			}
			if (keep_layout && index < pieces.length - 1) {
				const next = pieces[index + 1];
				result.push(
					empty_container(piece.end, next.start, piece.loc.end, next.loc.start, tooling[index]),
				);
				previous = null;
			}
		}
	}
	return result;
}

/**
 * An empty `{}` child, which renders nothing, for the span of a comment.
 * @param {number} start
 * @param {number} end
 * @param {AST.Position} start_loc
 * @param {AST.Position} end_loc
 * @param {AST.CommentWithLocation | null} [tooling_comment] A tooling comment it holds
 * @returns {any}
 */
function empty_container(start, end, start_loc, end_loc, tooling_comment = null) {
	const loc = { start: start_loc, end: end_loc };
	return {
		type: 'JSXExpressionContainer',
		expression: {
			type: 'JSXEmptyExpression',
			start,
			end,
			loc,
			metadata: tooling_comment ? { path: [], tooling_comment } : { path: [] },
		},
		start,
		end,
		loc,
		metadata: { path: [] },
	};
}

/**
 * @param {any} node
 * @param {{ next: () => void, state: TSRXAnalysisState }} context
 */
function visit_node(node, { next, state }) {
	for (const key of ['children', 'body']) {
		const list = node[key];
		if (
			Array.isArray(list) &&
			list.some((child) => child?.type === 'JSXText' && child.metadata?.text_pieces)
		) {
			node[key] = split_text_pieces(list, state.comments);
		}
	}
	next();
}

const visitors = {
	_: visit_node,

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

	JSXSpreadChild: visit_jsx_spread_child,
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
