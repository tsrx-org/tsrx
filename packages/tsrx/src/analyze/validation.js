/**
@import * as AST from 'estree';
@import { AnalysisContext, CompileError } from '../../types/index';
 */

import { error } from '../errors.js';
import { DIAGNOSTIC_CODES } from '../diagnostics.js';

export const TSRX_RETURN_STATEMENT_ERROR =
	'Return statements are not allowed inside TSRX templates. Move the return before the TSRX return value, or use conditional rendering instead.';
export const TSRX_LOOP_RETURN_ERROR =
	'Return statements are not allowed inside TSRX template for...of loops. Filter the iterable before rendering or use an @empty fallback for empty lists.';
export const TSRX_LOOP_BREAK_ERROR =
	'Break statements are not allowed inside TSRX template for...of loops.';
export const TSRX_LOOP_CONTINUE_ERROR =
	'Continue statements are not allowed inside TSRX template for...of loops. Filter the iterable before rendering.';
export const TSRX_IF_RETURN_ERROR =
	'Return statements are not allowed inside TSRX template @if blocks. Move the return before the template output or render conditionally instead.';
export const TSRX_IF_BREAK_ERROR =
	'Break statements are not allowed inside TSRX template @if blocks.';
export const TSRX_IF_CONTINUE_ERROR =
	'Continue statements are not allowed inside TSRX template @if blocks. Filter before rendering or use conditional output instead.';
export const TSRX_FOR_STATEMENT_ERROR =
	'For loops are not supported in TSRX templates. Use for...of instead.';
export const TSRX_FOR_IN_STATEMENT_ERROR =
	'For...in loops are not supported in TSRX templates. Use for...of instead.';
export const TSRX_WHILE_STATEMENT_ERROR =
	'While loops are not supported in TSRX templates. Move the while loop into a function.';
export const TSRX_DO_WHILE_STATEMENT_ERROR =
	'Do...while loops are not supported in TSRX templates. Move the do...while loop into a function.';
export const TSRX_FORGOTTEN_STATEMENT_CONTAINER_ERROR =
	"This TSRX template output is unused. Return it, assign it to a value that is rendered, or make it part of the rendered output of a function '@{...}' body.";
export const TSRX_UNSUPPORTED_LAZY_ASSIGNMENT_POSITION_ERROR =
	'Lazy destructuring assignments require a directly lazy target as a standalone statement inside a program, block, TSRX code block, or switch case.';
export const TSRX_STYLE_APPLY_VALUE_ERROR =
	"The 'apply' attribute of a <style> block requires an expression value: apply={theme} or apply={[a, b]}.";
export const TSRX_STYLE_APPLY_DUPLICATE_ERROR =
	"A <style> block accepts a single 'apply' attribute; pass several themes as an array: apply={[a, b]}.";
export const TSRX_STYLE_APPLY_UNSUPPORTED_HOST_ERROR =
	"The 'apply' attribute is only supported on scoped <style> blocks, not on <head> styles or resource styles.";
export const TSRX_STYLE_RESERVED_CLASS_KEY_ERROR =
	"'$class' is reserved on assigned <style> blocks for the block's scope hash; rename the '.$class' selector.";
export const TSRX_STYLE_STANDALONE_AT_MODULE_SCOPE_ERROR =
	'A standalone <style> block is only allowed inside a template scope. At module scope assign it: const theme = <style>…</style>.';
export const TSRX_STYLE_STANDALONE_NEEDS_FRAGMENT_ERROR =
	'A standalone <style> block must be a child of an element or a fragment. Wrap it with the output it styles in a fragment: <><style>…</style><div>…</div></>.';
export const TSRX_STYLE_STANDALONE_OUTSIDE_TEMPLATE_ERROR =
	'A standalone <style> block with CSS text is TSRX template syntax and needs an enclosing @{ … } body or an @if/@for/@switch/@try body. In plain TSX give <style> an expression child instead: <style>{css}</style>. To declare a reusable block here, assign it: const theme = <style>…</style>.';
export const TSRX_CSS_GLOBAL_NESTED_IN_PSEUDOCLASS_ERROR =
	'A :global selector cannot be inside a pseudoclass.';
export const TSRX_CSS_GLOBAL_MIDDLE_PLACEMENT_ERROR =
	':global(...) can be at the start or end of a selector sequence, but not in the middle.';

/**
 * @param {string} name
 * @returns {string}
 */
export function tsrx_style_apply_target_error(name) {
	return `'${name}' is not a style block. An 'apply' target must be a variable, import, or member holding an assigned <style> block.`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function tsrx_style_apply_before_declaration_error(name) {
	return `'${name}' is applied before its declaration. Declare the style block before the block that applies it.`;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function tsrx_style_unknown_attribute_error(name) {
	return `Unknown <style> attribute '${name}'. Scoped style blocks accept 'ref' and 'apply'.`;
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
		TSRX_RETURN_STATEMENT_ERROR,
		filename ?? null,
		get_return_keyword_node(node),
		errors,
		comments,
		DIAGNOSTIC_CODES.TEMPLATE_RETURN_STATEMENT,
	);
}

/**
 * @param {AST.Node} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_forgotten_statement_container(node, filename, errors, comments) {
	error(
		TSRX_FORGOTTEN_STATEMENT_CONTAINER_ERROR,
		filename ?? null,
		node,
		errors,
		comments,
		DIAGNOSTIC_CODES.FORGOTTEN_STATEMENT_CONTAINER,
	);
}

/**
 * @param {import('../../types/index').LazyPattern} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_unsupported_lazy_assignment_position(node, filename, errors, comments) {
	error(
		TSRX_UNSUPPORTED_LAZY_ASSIGNMENT_POSITION_ERROR,
		filename ?? null,
		node,
		errors,
		comments,
		DIAGNOSTIC_CODES.UNSUPPORTED_LAZY_ASSIGNMENT_POSITION,
	);
}

/**
 * @param {AST.ReturnStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_loop_return_statement(node, filename, errors, comments) {
	error(TSRX_LOOP_RETURN_ERROR, filename ?? null, get_return_keyword_node(node), errors, comments);
}

/**
 * @param {AST.BreakStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_loop_break_statement(node, filename, errors, comments) {
	error(
		TSRX_LOOP_BREAK_ERROR,
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
		TSRX_LOOP_CONTINUE_ERROR,
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
	error(TSRX_IF_RETURN_ERROR, filename ?? null, get_return_keyword_node(node), errors, comments);
}

/**
 * @param {AST.BreakStatement} node
 * @param {string | null | undefined} filename
 * @param {CompileError[]} [errors]
 * @param {AST.CommentWithLocation[]} [comments]
 */
export function validate_tsrx_if_break_statement(node, filename, errors, comments) {
	error(
		TSRX_IF_BREAK_ERROR,
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
		TSRX_IF_CONTINUE_ERROR,
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
	let message;
	if (node.type === 'ForStatement') {
		message = TSRX_FOR_STATEMENT_ERROR;
	} else if (node.type === 'ForInStatement') {
		message = TSRX_FOR_IN_STATEMENT_ERROR;
	} else if (node.type === 'WhileStatement') {
		message = TSRX_WHILE_STATEMENT_ERROR;
	} else {
		message = TSRX_DO_WHILE_STATEMENT_ERROR;
	}

	error(message, filename ?? null, node, errors, comments);
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
						`Invalid HTML nesting: <${tag}> cannot be a descendant of <${parent_tag}>.`,
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
 * @param {string} message
 * @param {string} code
 * @param {AST.Node} node
 * @param {string | null} filename
 * @param {CompileError[] | undefined} errors
 * @param {AST.CommentWithLocation[] | undefined} comments
 */
export function validate_style(message, code, node, filename, errors, comments) {
	error(message, filename, node, errors, comments, code);
}
