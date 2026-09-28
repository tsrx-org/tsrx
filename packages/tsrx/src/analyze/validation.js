/**
@import * as AST from 'estree';
@import * as ESTreeJSX from 'estree-jsx';
@import { AnalysisContext, CompileError } from '../../types/index';
@import { Diagnostic } from '../diagnostics.js';
 */

import { error } from '../errors.js';
import { TSRX_ERRORS } from '../diagnostics.js';

// The messages of `TSRX_ERRORS` entries, under the names `@tsrx/core` exports
// them by, for matching an error that has no code, such as one from an older
// compiler. Report an error with its entry, which carries its code too.
export const TSRX_RETURN_STATEMENT_ERROR = TSRX_ERRORS.TEMPLATE_RETURN_STATEMENT.message;
export const TSRX_LOOP_RETURN_ERROR = TSRX_ERRORS.FOR_RETURN_STATEMENT.message;
export const TSRX_LOOP_BREAK_ERROR = TSRX_ERRORS.FOR_BREAK_STATEMENT.message;
export const TSRX_LOOP_CONTINUE_ERROR = TSRX_ERRORS.FOR_CONTINUE_STATEMENT.message;
export const TSRX_IF_RETURN_ERROR = TSRX_ERRORS.IF_RETURN_STATEMENT.message;
export const TSRX_IF_BREAK_ERROR = TSRX_ERRORS.IF_BREAK_STATEMENT.message;
export const TSRX_IF_CONTINUE_ERROR = TSRX_ERRORS.IF_CONTINUE_STATEMENT.message;
export const TSRX_FOR_STATEMENT_ERROR = TSRX_ERRORS.FOR_STATEMENT.message;
export const TSRX_FOR_IN_STATEMENT_ERROR = TSRX_ERRORS.FOR_IN_STATEMENT.message;
export const TSRX_WHILE_STATEMENT_ERROR = TSRX_ERRORS.WHILE_STATEMENT.message;
export const TSRX_DO_WHILE_STATEMENT_ERROR = TSRX_ERRORS.DO_WHILE_STATEMENT.message;
export const TSRX_FORGOTTEN_STATEMENT_CONTAINER_ERROR =
	TSRX_ERRORS.FORGOTTEN_STATEMENT_CONTAINER.message;
export const TSRX_JSX_SPREAD_CHILD_ERROR = TSRX_ERRORS.JSX_SPREAD_CHILD.message;
export const TSRX_DYNAMIC_TAG_EXPRESSION_ERROR = TSRX_ERRORS.DYNAMIC_TAG_EXPRESSION.message;
export const TSRX_STYLE_APPLY_VALUE_ERROR = TSRX_ERRORS.STYLE_APPLY_VALUE.message;
export const TSRX_STYLE_APPLY_DUPLICATE_ERROR = TSRX_ERRORS.STYLE_APPLY_DUPLICATE.message;
export const TSRX_STYLE_APPLY_UNSUPPORTED_HOST_ERROR =
	TSRX_ERRORS.STYLE_APPLY_UNSUPPORTED_HOST.message;
export const TSRX_STYLE_RESERVED_CLASS_KEY_ERROR = TSRX_ERRORS.STYLE_RESERVED_CLASS_KEY.message;
export const TSRX_STYLE_STANDALONE_AT_MODULE_SCOPE_ERROR =
	TSRX_ERRORS.STYLE_STANDALONE_AT_MODULE_SCOPE.message;
export const TSRX_STYLE_STANDALONE_NEEDS_FRAGMENT_ERROR =
	TSRX_ERRORS.STYLE_STANDALONE_NEEDS_FRAGMENT.message;
export const TSRX_STYLE_STANDALONE_OUTSIDE_TEMPLATE_ERROR =
	TSRX_ERRORS.STYLE_STANDALONE_OUTSIDE_TEMPLATE.message;
export const TSRX_CSS_GLOBAL_NESTED_IN_PSEUDOCLASS_ERROR =
	TSRX_ERRORS.CSS_GLOBAL_IN_PSEUDOCLASS.message;
export const TSRX_CSS_GLOBAL_MIDDLE_PLACEMENT_ERROR = TSRX_ERRORS.CSS_GLOBAL_IN_MIDDLE.message;
export const TSRX_CSS_IMPORT_ERROR = TSRX_ERRORS.CSS_IMPORT.message;

/**
 * The message of `TSRX_ERRORS.STYLE_APPLY_TARGET(name)`.
 * @param {string} name
 * @returns {string}
 */
export function tsrx_style_apply_target_error(name) {
	return TSRX_ERRORS.STYLE_APPLY_TARGET(name).message;
}

/**
 * The message of `TSRX_ERRORS.STYLE_APPLY_BEFORE_DECLARATION(name)`.
 * @param {string} name
 * @returns {string}
 */
export function tsrx_style_apply_before_declaration_error(name) {
	return TSRX_ERRORS.STYLE_APPLY_BEFORE_DECLARATION(name).message;
}

/**
 * The message of `TSRX_ERRORS.STYLE_UNKNOWN_ATTRIBUTE(name)`.
 * @param {string} name
 * @returns {string}
 */
export function tsrx_style_unknown_attribute_error(name) {
	return TSRX_ERRORS.STYLE_UNKNOWN_ATTRIBUTE(name).message;
}

const invalid_nestings = {
	// <p> cannot contain block-level elements
	p: new Set([
		'address',
		'article',
		'aside',
		'blockquote',
		'details',
		'div',
		'dl',
		'fieldset',
		'figcaption',
		'figure',
		'footer',
		'form',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'header',
		'hgroup',
		'hr',
		'main',
		'menu',
		'nav',
		'ol',
		'p',
		'pre',
		'section',
		'table',
		'ul',
	]),
	// <span> cannot contain block-level elements
	span: new Set([
		'address',
		'article',
		'aside',
		'blockquote',
		'details',
		'div',
		'dl',
		'fieldset',
		'figcaption',
		'figure',
		'footer',
		'form',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'header',
		'hgroup',
		'hr',
		'main',
		'menu',
		'nav',
		'ol',
		'p',
		'pre',
		'section',
		'table',
		'ul',
	]),
	// Interactive elements cannot be nested
	a: new Set(['a', 'button']),
	button: new Set(['a', 'button']),
	// Form elements
	label: new Set(['label']),
	form: new Set(['form']),
	// Headings cannot be nested within each other
	h1: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
	h2: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
	h3: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
	h4: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
	h5: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
	h6: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
	// Table structure
	table: new Set(['table', 'tr', 'td', 'th']), // Can only contain caption, colgroup, thead, tbody, tfoot
	thead: new Set(['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'td', 'th']), // Can only contain tr
	tbody: new Set(['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'td', 'th']), // Can only contain tr
	tfoot: new Set(['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'td', 'th']), // Can only contain tr
	tr: new Set(['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr']), // Can only contain td and th
	td: new Set(['td', 'th']), // Cannot nest td/th elements
	th: new Set(['td', 'th']), // Cannot nest td/th elements
	// Media elements
	picture: new Set(['picture']),
	// Main landmark - only one per document, cannot be nested
	main: new Set(['main']),
	// Other semantic restrictions
	figcaption: new Set(['figcaption']),
	dt: new Set([
		'header',
		'footer',
		'article',
		'aside',
		'nav',
		'section',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
	]),
	// No interactive content inside summary
	summary: new Set(['summary']),
};

/**
 * @param {AST.TSRXElementNode} element
 * @returns {string | null}
 */
function get_element_tag(element) {
	const name = element.openingElement.name;
	return name.type === 'JSXIdentifier' || name.type === 'Identifier' ? name.name : null;
}

/**
 * @param {AST.ReturnStatement} node
 * @returns {AST.ReturnStatement}
 */
export function get_return_keyword_node(node) {
	return get_statement_keyword_node(node, 'return');
}

/**
 * @template {AST.Node} T
 * @param {T} node
 * @param {string} keyword
 * @returns {T}
 */
export function get_statement_keyword_node(node, keyword) {
	const keyword_length = keyword.length;
	const start = /** @type {AST.NodeWithLocation} */ (node).start ?? 0;
	const loc = /** @type {AST.NodeWithLocation} */ (node).loc;

	return /** @type {T} */ ({
		...node,
		end: start + keyword_length,
		loc: loc
			? {
					start: loc.start,
					end: {
						line: loc.start.line,
						column: loc.start.column + keyword_length,
					},
				}
			: undefined,
	});
}

/**
 * @param {AST.ReturnStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_return_statement(node, filename, errors, comments) {
	error(
		TSRX_ERRORS.TEMPLATE_RETURN_STATEMENT,
		filename ?? null,
		get_return_keyword_node(node),
		errors,
		comments,
	);
}

/**
 * @param {AST.Node} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_forgotten_statement_container(node, filename, errors, comments) {
	error(TSRX_ERRORS.FORGOTTEN_STATEMENT_CONTAINER, filename ?? null, node, errors, comments);
}

/**
 * JSX spread children parse, as in TypeScript, but no target supports them:
 * Babel's React transform and vue-jsx-vapor reject or drop them, and Solid's
 * JSX compiler misplaces them.
 * @param {ESTreeJSX.JSXSpreadChild} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_jsx_spread_child(node, filename, errors, comments) {
	error(TSRX_ERRORS.JSX_SPREAD_CHILD, filename ?? null, node, errors, comments);
}

/**
 * @param {AST.ReturnStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_loop_return_statement(node, filename, errors, comments) {
	error(
		TSRX_ERRORS.FOR_RETURN_STATEMENT,
		filename ?? null,
		get_return_keyword_node(node),
		errors,
		comments,
	);
}

/**
 * @param {AST.BreakStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_loop_break_statement(node, filename, errors, comments) {
	error(
		TSRX_ERRORS.FOR_BREAK_STATEMENT,
		filename ?? null,
		get_statement_keyword_node(node, 'break'),
		errors,
		comments,
	);
}

/**
 * @param {AST.ContinueStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_loop_continue_statement(node, filename, errors, comments) {
	error(
		TSRX_ERRORS.FOR_CONTINUE_STATEMENT,
		filename ?? null,
		get_statement_keyword_node(node, 'continue'),
		errors,
		comments,
	);
}

/**
 * @param {AST.ReturnStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_if_return_statement(node, filename, errors, comments) {
	error(
		TSRX_ERRORS.IF_RETURN_STATEMENT,
		filename ?? null,
		get_return_keyword_node(node),
		errors,
		comments,
	);
}

/**
 * @param {AST.BreakStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_if_break_statement(node, filename, errors, comments) {
	error(
		TSRX_ERRORS.IF_BREAK_STATEMENT,
		filename ?? null,
		get_statement_keyword_node(node, 'break'),
		errors,
		comments,
	);
}

/**
 * @param {AST.ContinueStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_if_continue_statement(node, filename, errors, comments) {
	error(
		TSRX_ERRORS.IF_CONTINUE_STATEMENT,
		filename ?? null,
		get_statement_keyword_node(node, 'continue'),
		errors,
		comments,
	);
}

/**
 * @param {AST.ForStatement | AST.ForInStatement | AST.WhileStatement | AST.DoWhileStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_unsupported_loop_statement(node, filename, errors, comments) {
	let diagnostic;
	if (node.type === 'ForStatement') {
		diagnostic = TSRX_ERRORS.FOR_STATEMENT;
	} else if (node.type === 'ForInStatement') {
		diagnostic = TSRX_ERRORS.FOR_IN_STATEMENT;
	} else if (node.type === 'WhileStatement') {
		diagnostic = TSRX_ERRORS.WHILE_STATEMENT;
	} else {
		diagnostic = TSRX_ERRORS.DO_WHILE_STATEMENT;
	}

	error(diagnostic, filename ?? null, node, errors, comments);
}

/**
 * Returns `true` when `child` occupies a value slot of `parent` — i.e. it is
 * being captured as a value (assigned to a binding, pushed into an array,
 * passed as an argument, used as an operand, …) rather than rendered as a
 * statement-position template child.
 *
 * Target analyzers use this to tell apart direct template output from a TSRX
 * element that merely happens to be a value, so that a value-position element
 * nested inside plain JavaScript control flow does not get mistaken for direct
 * output that would require a `@for`/`@if`/`@switch`/`@try` directive.
 * @param {AST.Node} parent
 * @param {AST.Node} child
 * @returns {boolean}
 */
export function is_template_value_position(parent, child) {
	switch (parent.type) {
		case 'VariableDeclarator':
			return parent.init === child;
		case 'AssignmentExpression':
			return parent.right === child;
		case 'Property':
		case 'PropertyDefinition':
			return parent.value === child;
		case 'ArrayExpression':
			return parent.elements.some((element) => element === child);
		case 'CallExpression':
		case 'NewExpression':
			return parent.callee === child || parent.arguments.some((argument) => argument === child);
		case 'ConditionalExpression':
			return parent.test === child || parent.consequent === child || parent.alternate === child;
		case 'LogicalExpression':
		case 'BinaryExpression':
			return parent.left === child || parent.right === child;
		case 'UnaryExpression':
		case 'AwaitExpression':
		case 'SpreadElement':
		case 'YieldExpression':
			return parent.argument === child;
		case 'TemplateLiteral':
		case 'SequenceExpression':
			return parent.expressions.some((expression) => expression === child);
		case 'TSAsExpression':
		case 'TSNonNullExpression':
		case 'TSSatisfiesExpression':
			return parent.expression === child;
		default:
			return false;
	}
}

/**
 * @param {AST.TSRXElementNode} element
 * @param {AnalysisContext} context
 * @param {CompileError[]} [errors]
 */
export function validate_nesting(element, context, errors) {
	const tag = get_element_tag(element);

	if (tag === null) {
		return;
	}

	for (let i = context.path.length - 1; i >= 0; i--) {
		const parent = context.path[i];
		if (parent.type === 'JSXElement' || parent.type === 'JSXStyleElement') {
			const parent_tag = get_element_tag(parent);
			if (parent_tag === null) {
				continue;
			}

			if (parent_tag in invalid_nestings) {
				const validation_set =
					invalid_nestings[/** @type {keyof typeof invalid_nestings} */ (parent_tag)];
				if (validation_set.has(tag)) {
					error(
						TSRX_ERRORS.INVALID_HTML_NESTING(tag, parent_tag),
						context.state.analysis.module.filename,
						element,
						errors,
						context.state.analysis.comments,
					);
				} else {
					// if my parent has a set of invalid children
					// and i'm not in it, then i'm valid
					return;
				}
			}
		}
	}
}

/**
 * Report a style diagnostic through the shared error channel so editors get
 * positions and `@tsrx-ignore` applies.
 *
 * @param {Diagnostic} diagnostic
 * @param {AST.Node} node
 * @param {string | null} filename
 * @param {CompileError[] | undefined} errors
 * @param {AST.CommentWithLocation[] | undefined} comments
 */
export function validate_style(diagnostic, node, filename, errors, comments) {
	error(diagnostic, filename, node, errors, comments);
}
