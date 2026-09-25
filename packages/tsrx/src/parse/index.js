/**
@import * as AST from 'estree'
@import * as ESTreeJSX from 'estree-jsx'
@import { Parse } from '../../types/parse'
@import { BaseNodeMetaData } from '../../types/index'
@import { NonEmptyString } from '../../types/helpers'
 */

import * as acorn from 'acorn';
import { tsPlugin } from '@sveltejs/acorn-typescript';
import { walk } from 'zimmerframe';
import { has_location, node_children } from '../utils/ast.js';

/** @type {Parse.BindingType} */
export const BINDING_TYPES = {
	BIND_NONE: 0, // Not a binding
	BIND_VAR: 1, // Var-style binding
	BIND_LEXICAL: 2, // Let- or const-style binding
	BIND_FUNCTION: 3, // Function declaration
	BIND_SIMPLE_CATCH: 4, // Simple (identifier pattern) catch binding
	BIND_OUTSIDE: 5, // Special case for function names as bound inside the function
};

/**
 * @this {Parse.DestructuringErrors}
 * @returns {Parse.DestructuringErrors}
 */
export function DestructuringErrors() {
	if (!(this instanceof DestructuringErrors)) {
		throw new TypeError("'DestructuringErrors' must be invoked with 'new'");
	}
	this.shorthandAssign = -1;
	this.trailingComma = -1;
	this.parenthesizedAssign = -1;
	this.parenthesizedBind = -1;
	this.doubleProto = -1;
	return this;
}

const regex_whitespace_only = /\s/;

/**
 * Skip whitespace characters without skipping comments.
 * This is needed because Acorn's skipSpace() also skips comments, which breaks
 * parsing in certain contexts. Updates parser position and line tracking.
 * @param {Parse.Parser} parser
 */
export function skipWhitespace(parser) {
	const originalStart = parser.start;
	/** @type {acorn.Position | undefined} */
	let lineInfo;
	while (
		parser.start < parser.input.length &&
		regex_whitespace_only.test(parser.input[parser.start])
	) {
		parser.start++;
	}
	// Update line tracking if whitespace was skipped
	if (parser.start !== originalStart) {
		lineInfo = acorn.getLineInfo(parser.input, parser.start);
		if (parser.pos <= parser.start) {
			parser.curLine = lineInfo.line;
			parser.lineStart = parser.start - lineInfo.column;
		}
	}

	parser.startLoc = lineInfo || acorn.getLineInfo(parser.input, parser.start);
}

/**
 * @param {AST.Node | ESTreeJSX.JSXText | null | undefined} node
 * @returns {boolean}
 */
export function isWhitespaceTextNode(node) {
	if (!node) {
		return false;
	}

	if (node.type === 'JSXText') {
		return /^\s*$/.test(node.value);
	}

	return false;
}

/**
 * @type {Parse.AcornPlugin}
 */
function elementTemplateClosingTagPlugin(Base) {
	const jsxTagStart = Base.acornTypeScript?.tokTypes?.jsxTagStart;
	if (!jsxTagStart) return Base;

	/**
	 * @param {Parse.Parser} parser
	 */
	function inElementTemplateBodyDirect(parser) {
		const stack = parser.context;
		const top = stack[stack.length - 1];
		const below = stack[stack.length - 2];
		return top && top.token === '{' && below && below.token === '<tag>...</tag>';
	}

	/**
	 * @param {Parse.Parser} parser
	 */
	function inElementTemplateBodyAnywhere(parser) {
		const stack = parser.context;
		for (let i = 1; i < stack.length; i++) {
			if (
				stack[i] &&
				stack[i].token === '{' &&
				stack[i - 1] &&
				stack[i - 1].token === '<tag>...</tag>'
			) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param {Parse.Parser} parser
	 */
	function isOpeningTagAfterReturnKeyword(parser) {
		if (parser.input.charCodeAt(parser.start + 1) === 47 /* '/' */) return false;

		let index = parser.start - 1;
		while (index >= 0) {
			const ch = parser.input.charCodeAt(index);
			if (ch === 32 /* ' ' */ || ch === 9 /* '\t' */) {
				index--;
				continue;
			}
			if (ch === 10 /* '\n' */ || ch === 13 /* '\r' */) return false;
			break;
		}

		const end = index + 1;
		const start = end - 'return'.length;
		if (start < 0 || parser.input.slice(start, end) !== 'return') return false;
		const before = start > 0 ? parser.input.charCodeAt(start - 1) : -1;
		return !(
			(before >= 48 /* '0' */ && before <= 57) ||
			(before >= 65 /* 'A' */ && before <= 90) ||
			(before >= 97 /* 'a' */ && before <= 122) ||
			before === 36 /* '$' */ ||
			before === 95 /* '_' */
		);
	}

	return class extends Base {
		/** @param {number} code */
		getTokenFromCode(code) {
			if (code === 60 /* '<' */ && !this.inType) {
				const nextChar =
					this.pos + 1 < this.input.length ? this.input.charCodeAt(this.pos + 1) : -1;
				if (nextChar === 47 /* '/' */ && inElementTemplateBodyDirect(this)) {
					++this.pos;
					return this.finishToken(jsxTagStart);
				}
			}
			return super.getTokenFromCode(code);
		}

		canInsertSemicolon() {
			if (
				this.type === jsxTagStart &&
				inElementTemplateBodyAnywhere(this) &&
				!isOpeningTagAfterReturnKeyword(this)
			) {
				return true;
			}
			return super.canInsertSemicolon();
		}
	};
}

/**
 * Create a parser by composing Acorn with TypeScript/JSX support and optional framework plugins.
 *
 * This is the core factory for building tsrx-based parsers. Framework plugins (like TSRXPlugin)
 * extend the base parser with framework-specific syntax.
 *
 * @param {...Parse.AcornPlugin} plugins - Framework parser plugins to compose
 * @returns {<T extends string>(source: string, filename: NonEmptyString<T>, options?: Parse.ParseFunctionOptions) => AST.Program} A parse function
 */
export function createParser(...plugins) {
	const parser = /** @type {Parse.ParserConstructor} */ (
		/** @type {unknown} */ (
			acorn.Parser.extend(
				tsPlugin({ jsx: true }),
				.../** @type {Array<(BaseParser: typeof acorn.Parser) => typeof acorn.Parser>} */ (
					/** @type {unknown} */ (plugins)
				),
				/** @type {(BaseParser: typeof acorn.Parser) => typeof acorn.Parser} */ (
					/** @type {unknown} */ (elementTemplateClosingTagPlugin)
				),
			)
		)
	);

	/**
	 * @param {string} source
	 * @param {string} filename
	 * @param {Parse.ParseFunctionOptions} [options]
	 * @returns {AST.Program}
	 */
	return function parse(source, filename, options) {
		/** @type {AST.CommentWithLocation[]} */
		const comments = [];
		const collect = !!(options?.collect || options?.loose);
		const output_comments = collect ? options?.comments : undefined;

		const { onComment, add_comments } = get_comment_handlers(source, comments);
		/** @type {AST.Program} */
		let ast;

		// Lexer-authoritative keyword positions (volar opt-in): the mapping
		// collector needs the SOURCE spans of `async`/`function`, which no AST
		// node records. The tokenizer is the only correct source — offset
		// arithmetic breaks on extra whitespace, and text search breaks on
		// comments (`async /* function */ function`).
		/** @type {Parse.KeywordToken[] | undefined} */
		const keyword_tokens = options?.keywordTokens ? [] : undefined;
		/** @type {Parse.Options['onToken'] | undefined} */
		const onToken = keyword_tokens
			? (token) => {
					const is_function_keyword = token.type.keyword === 'function';
					const is_async_name = token.type.label === 'name' && token.value === 'async';
					if ((is_function_keyword || is_async_name) && token.loc) {
						keyword_tokens.push({
							value: is_function_keyword ? 'function' : 'async',
							start: token.start,
							end: token.end,
							loc: token.loc,
						});
					}
				}
			: undefined;

		try {
			ast = parser.parse(source, {
				sourceType: 'module',
				// Parse everything the installed acorn supports (hashbangs, `using`
				// declarations, the regex `v` flag and modifiers, …); TypeScript
				// accepts the same syntax at any target.
				ecmaVersion: 'latest',
				allowReturnOutsideFunction: true,
				locations: true,
				onToken,
				preserveParens: !!options?.preserveParens,
				onComment,
				tsrxOptions: {
					filename,
					collect,
					errors: collect ? (options?.errors ?? []) : undefined,
					loose: options?.loose || false,
				},
			});
		} catch (e) {
			throw e;
		}

		if (output_comments) {
			for (let i = 0; i < comments.length; i++) {
				output_comments.push(comments[i]);
			}
		}

		add_comments(ast);

		if (keyword_tokens) {
			ast.tsrx_keyword_tokens = keyword_tokens;
		}

		return ast;
	};
}

/**
 * Create comment handlers for tracking and attaching comments to AST nodes.
 * Used by parse functions to collect and attach comments during parsing.
 * @param {string} source - The source code being parsed
 * @param {AST.CommentWithLocation[]} comments - Array to collect comments into
 * @param {number} [index=0] - Starting index for comment filtering
 * @returns {{ onComment: Parse.Options['onComment'], add_comments: (ast: AST.Node | AST.CSS.StyleSheet) => void }}
 */
export function get_comment_handlers(source, comments, index = 0) {
	/**
	 * Find the first `token` between two positions that isn't inside a comment,
	 * such as the comma after a list element or the `from` of an import. Only
	 * punctuation, whitespace, and comments can come before it there.
	 * @param {string} token
	 * @param {number} start
	 * @param {number} end
	 * @returns {number} The token's position, or `end` if there is none
	 */
	function findOutsideComments(token, start, end) {
		for (let i = start; i < end; i++) {
			if (source.startsWith('/*', i)) {
				i = source.indexOf('*/', i + 2) + 1;
			} else if (source.startsWith('//', i)) {
				const newline = source.indexOf('\n', i);
				i = newline === -1 ? end : newline;
			} else if (source.startsWith(token, i)) {
				return i;
			}
		}
		return end;
	}

	/**
	 * Like Prettier's `getNextNonSpaceNonCommentCharacterIndex`: the position
	 * of the first character from `start` on that isn't whitespace or inside a
	 * comment, or -1.
	 * @param {number} start
	 * @returns {number}
	 */
	function getNextNonSpaceNonCommentCharacterIndex(start) {
		for (let i = start; i < source.length; i++) {
			if (source.startsWith('/*', i)) {
				const end = source.indexOf('*/', i + 2);
				if (end === -1) return -1;
				i = end + 1;
			} else if (source.startsWith('//', i)) {
				const newline = source.indexOf('\n', i);
				if (newline === -1) return -1;
				i = newline;
			} else if (!/\s/.test(source[i])) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * Like Prettier's `getNextNonSpaceNonCommentCharacter`: the first character
	 * from `start` on that isn't whitespace or inside a comment.
	 * @param {number} start
	 * @returns {string | null}
	 */
	function getNextNonSpaceNonCommentCharacter(start) {
		const index = getNextNonSpaceNonCommentCharacterIndex(start);
		return index === -1 ? null : source[index];
	}

	/**
	 * Whether only whitespace and comments, and closing parentheses when
	 * `parens` is set, sit between two positions.
	 * @param {number} start
	 * @param {number} end
	 * @param {boolean} parens
	 * @returns {boolean}
	 */
	function isBlankBetween(start, end, parens) {
		for (let i = start; i < end; i++) {
			if (source.startsWith('/*', i)) {
				i = source.indexOf('*/', i + 2) + 1;
				if (i === 0) return false;
			} else if (source.startsWith('//', i)) {
				const newline = source.indexOf('\n', i);
				if (newline === -1 || newline >= end) return false;
				i = newline;
			} else if (!/\s/.test(source[i]) && !(parens && source[i] === ')')) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Like Prettier's `locEnd`, which ends these statements before their `;`
	 * (`__contentEnd`), so the comments between the two lie outside them.
	 */
	const statementsEndingBeforeSemicolon = new Set([
		'ExpressionStatement',
		'ImportDeclaration',
		'ExportDefaultDeclaration',
		'ExportNamedDeclaration',
		'ExportAllDeclaration',
		'ReturnStatement',
		'ThrowStatement',
		'DoWhileStatement',
		'VariableDeclaration',
		'BreakStatement',
		'ContinueStatement',
		'DebuggerStatement',
	]);

	/**
	 * The end of the keyword of a statement that is only its keyword and `;`:
	 * `continue` or `break` without a label, `debugger`, and `return` without
	 * an argument. Other nodes give -1.
	 * @param {AST.NodeWithLocation} node
	 * @returns {number}
	 */
	function getKeywordOnlyStatementEnd(node) {
		const statement = /** @type {any} */ (node);
		const keyword =
			(statement.type === 'ContinueStatement' && !statement.label && 'continue') ||
			(statement.type === 'BreakStatement' && !statement.label && 'break') ||
			(statement.type === 'DebuggerStatement' && 'debugger') ||
			(statement.type === 'ReturnStatement' && !statement.argument && 'return');
		return keyword ? node.start + keyword.length : -1;
	}

	/**
	 * When the next comment follows `node` on its line and only comments sit
	 * between it and the `;` that ends the statement enclosing `node`, give it,
	 * and the comments after it on the same line, to the outermost statement
	 * that ends at that `;`, as trailing comments. Like Prettier, which ends the
	 * statement before them, they then print after the `;`:
	 * `if (a) return b /* note *\/;` prints `if (a) return b; /* note *\/`.
	 * A comment before the closing parenthesis around the statement's value
	 * moves too, since the printer drops those parentheses: Prettier prints
	 * `return (b /* note *\/);` as `return b /* note *\/;`, and moves it after
	 * the `;` on the next pass.
	 * @param {AST.NodeWithLocation} node - The node the comment follows
	 * @param {(AST.Node | AST.CSS.StyleSheet)[]} path - The node's ancestors
	 * @returns {boolean} Whether it took the comments
	 */
	function takeCommentsBeforeFinalSemicolon(node, path) {
		// A statement that is only its keyword has no child for the comment to
		// follow, so the comment follows the keyword, and the statement itself
		// may end at the `;`: `for (;;) continue // note` with the `;` on the
		// next line prints `for (;;) continue; // note`
		const keywordEnd = getKeywordOnlyStatementEnd(node);
		if (keywordEnd >= 0) {
			path = [...path, /** @type {AST.Node} */ (node)];
		}
		// Look past the expressions around the node, whose parentheses may close
		// between the comment and the `;`, for the statement they end. A call's
		// parentheses are its own, so a comment inside them stays there.
		let index = path.length - 1;
		while (
			index >= 0 &&
			!statementsEndingBeforeSemicolon.has(path[index].type) &&
			!/Statement$|Declaration$|^Program$|^(Call|New|Import)Expression$|^JSX/.test(path[index].type)
		) {
			index--;
		}
		const statement = /** @type {(AST.Node & AST.NodeWithLocation) | undefined} */ (path[index]);
		if (
			!comments[0] ||
			!statement ||
			!statementsEndingBeforeSemicolon.has(statement.type) ||
			statement.end <= comments[0].end ||
			source[statement.end - 1] !== ';' ||
			// The comment must follow the node on its line
			!/^[ \t)]*$/.test(source.slice(keywordEnd < 0 ? node.end : keywordEnd, comments[0].start))
		) {
			return false;
		}
		if (!isBlankBetween(comments[0].end, statement.end - 1, false)) {
			// Only the parentheses around the statement's value may close after
			// the comment. Any other pair, like the one in `x = !(a /* c */);`,
			// stays, and so does the comment inside it. The value ends where the
			// node does, so the `)`s between the comment and the `;` all close
			// the value's own parentheses (or the ones around the statement's
			// other parts that end there, like an arrow function's), never a
			// pair inside the value.
			const values = getParenthesizedStatementValues(statement, comments[0]);
			if (
				!values.some(
					(value) => value.end === node.end && (value === node || path.includes(value)),
				) ||
				!isBlankBetween(comments[0].end, statement.end - 1, true)
			) {
				return false;
			}
		}
		let target = statement;
		for (let i = index - 1; i >= 0; i--) {
			const ancestor = /** @type {AST.Node & AST.NodeWithLocation} */ (path[i]);
			if (ancestor.type === 'Program' || ancestor.end !== statement.end) break;
			target = ancestor;
		}
		const targetNode = /** @type {AST.NodeWithMaybeComments} */ (target);
		const trailing = (targetNode.trailingComments ||= []);
		let previousEnd = keywordEnd < 0 ? node.end : keywordEnd;
		while (
			comments[0] &&
			comments[0].end < statement.end &&
			!source.slice(previousEnd, comments[0].start).includes('\n')
		) {
			previousEnd = comments[0].end;
			trailing.push(/** @type {AST.CommentWithLocation} */ (comments.shift()));
		}
		return true;
	}

	/**
	 * Values that print without the parentheses they're written in, wherever
	 * they end a statement. A binary or logical value keeps them when it
	 * breaks after `return`, so a comment before them stays inside.
	 */
	const valuesPrintedWithoutParens = new Set([
		'Identifier',
		'Literal',
		'ThisExpression',
		'MemberExpression',
		'CallExpression',
		'NewExpression',
		'ChainExpression',
		'TemplateLiteral',
		'TaggedTemplateExpression',
		'ArrayExpression',
		'UnaryExpression',
		'UpdateExpression',
		'AwaitExpression',
		'TSNonNullExpression',
	]);

	/**
	 * The values of a statement, like the argument of `return (a)`, the
	 * expression of `(a);`, or the right side of `x = (a)`, that are written in
	 * parentheses that print as nothing (see {@link valuesPrintedWithoutParens})
	 * or that `comment`, after the value in them, ends up after (see
	 * {@link movesCommentAfterParens}), and the expression body of an arrow
	 * function that is the value, as in `const f = () => (a);`, when the
	 * comments after it in its parentheses print before the `;` (see
	 * {@link keepsCommentsInArrowBodyParens}). The one the comment follows
	 * takes it.
	 * @param {AST.Node} statement
	 * @param {AST.CommentWithLocation} comment
	 * @returns {(AST.Node & AST.NodeWithLocation)[]}
	 */
	function getParenthesizedStatementValues(statement, comment) {
		const node = /** @type {any} */ (statement);
		/** @type {(AST.Node & AST.NodeWithLocation)[]} */
		const candidates = [];
		if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') {
			candidates.push(node.argument);
		} else if (node.type === 'ExpressionStatement') {
			candidates.push(node.expression, node.expression.right);
		} else if (node.type === 'VariableDeclaration') {
			candidates.push(node.declarations.at(-1)?.init);
		} else if (node.type === 'ExportDefaultDeclaration') {
			candidates.push(node.declaration);
		}
		/** @type {(AST.Node & AST.NodeWithLocation)[]} */
		const values = [];
		for (const value of candidates) {
			let candidate = value;
			let isArrowBody = false;
			while (candidate?.type === 'ArrowFunctionExpression') {
				candidate = /** @type {AST.Node & AST.NodeWithLocation} */ (candidate.body);
				isArrowBody = true;
			}
			if (
				candidate?.metadata?.parenthesized &&
				(isArrowBody
					? !keepsCommentsInArrowBodyParens(candidate)
					: valuesPrintedWithoutParens.has(candidate.type))
			) {
				values.push(candidate);
			} else if (value?.metadata?.parenthesized && movesCommentAfterParens(node, value, comment)) {
				values.push(value);
			}
		}
		return values;
	}

	/**
	 * Whether a comment after a statement's value, in the parentheses around
	 * it, ends up after the statement's `;` in Prettier, at once or on its
	 * next pass, so that it goes there at once:
	 * - After an expression statement's expression, other than an element or
	 *   template, `handleParenthesizedExpressionTrailingComment` gives it to
	 *   the statement: `(a, b /* c *\/);` prints `(a, b); /* c *\/`.
	 * - After a sequence or assignment that is the argument of a `throw` or
	 *   the declaration of an `export default`, which the handler leaves out,
	 *   it trails the value, which prints it after its parentheses.
	 * - After an assignment on the right side of another, the handler gives it
	 *   to the right side, but the chain prints without the parentheses:
	 *   `x = (y = z /* c *\/);` prints `x = y = z /* c *\/;`.
	 * - A line comment after the sequence of a declarator's value or an
	 *   assignment's right side trails its last expression, but those
	 *   parentheses don't break, so it prints after the `;`.
	 * @param {AST.Node} statement
	 * @param {AST.Node} value
	 * @param {AST.CommentWithLocation} comment
	 * @returns {boolean}
	 */
	function movesCommentAfterParens(statement, value, comment) {
		if (statement.type === 'ExpressionStatement' && statement.expression === value) {
			return !value.type.startsWith('JSX');
		}
		if (value.type !== 'SequenceExpression' && value.type !== 'AssignmentExpression') {
			return false;
		}
		if (statement.type === 'ThrowStatement' || statement.type === 'ExportDefaultDeclaration') {
			return true;
		}
		const isAssignmentRight =
			statement.type === 'ExpressionStatement' &&
			statement.expression.type === 'AssignmentExpression' &&
			statement.expression.right === value;
		return value.type === 'AssignmentExpression'
			? isAssignmentRight
			: comment.type === 'Line' && (isAssignmentRight || statement.type === 'VariableDeclaration');
	}

	/**
	 * Whether the comments after an arrow function's expression body, in the
	 * parentheses it's written in, print inside parentheses, as they do after
	 * an element or other template value (see {@link elementValueTypes}), a
	 * conditional, which Prettier prints in parentheses when it fits, and a
	 * sequence or assignment, where Prettier gives them to the last
	 * expression (`handleParenthesizedExpressionTrailingComment`, which
	 * `handleComment` ports). After any
	 * other body, they print before the statement's `;`: its parentheses print
	 * as nothing, or, around an object, before them.
	 * @param {AST.Node} node
	 * @returns {boolean}
	 */
	function keepsCommentsInArrowBodyParens(node) {
		return (
			node.type.startsWith('JSX') ||
			node.type === 'ConditionalExpression' ||
			node.type === 'SequenceExpression' ||
			node.type === 'AssignmentExpression'
		);
	}

	/**
	 * Where the outermost pair of parentheses around `node` that completes a
	 * JSDoc type cast (`/** @type {T} *\/ (node)`) closes, or -1. The printer
	 * keeps those, like Prettier's `babel` parser keeps them as a
	 * `ParenthesizedExpression`.
	 * @param {AST.Node & AST.NodeWithLocation} node
	 * @returns {number}
	 */
	function getTypeCastEnd(node) {
		const parenStart = node.metadata?.paren_start;
		if (typeof parenStart !== 'number') return -1;
		// The node's opening parens, and how many of them, from the outermost
		// cast on, close after it
		let parens = 0;
		let closing = 0;
		for (let i = parenStart; i < node.start; i++) {
			const comment = commentsByStart.get(i);
			if (comment) {
				i = comment.end - 1;
			} else if (source[i] === '(') {
				parens++;
				let before = i;
				while (before > 0 && /\s/.test(source[before - 1])) before--;
				const cast = commentsByEnd.get(before);
				if (closing === 0 && cast && isTypeCastComment(cast)) {
					closing = parens;
				}
			}
		}
		if (closing === 0) return -1;
		closing = parens - closing + 1;
		for (let i = node.end; i < source.length; i++) {
			const comment = commentsByStart.get(i);
			if (comment) {
				i = comment.end - 1;
			} else if (source[i] === ')') {
				if (--closing === 0) return i;
			} else if (!/\s/.test(source[i])) {
				break;
			}
		}
		return -1;
	}

	/**
	 * @param {AST.Node | AST.CSS.StyleSheet | null | undefined} node
	 * @returns {node is AST.FunctionDeclaration | AST.FunctionExpression | AST.ArrowFunctionExpression}
	 */
	function isFunctionNode(node) {
		return (
			node?.type === 'FunctionDeclaration' ||
			node?.type === 'FunctionExpression' ||
			node?.type === 'ArrowFunctionExpression'
		);
	}

	/**
	 * The positions of the parentheses around the parameters of a function or
	 * a TypeScript function type or signature, or null for an arrow function's
	 * lone unparenthesized parameter.
	 * @param {AST.Node} fn
	 * @returns {{ open: number, close: number } | null}
	 */
	function getParameterParens(fn) {
		const node = /** @type {any} */ (fn);
		const params = getSignatureParameters(node) ?? [];
		const end =
			/** @type {AST.NodeWithLocation | undefined} */ (getReturnType(node) ?? node.body)?.start ??
			/** @type {AST.NodeWithLocation} */ (node).end;
		const lastParam = /** @type {AST.NodeWithLocation | undefined} */ (params.at(-1));
		const firstParam = /** @type {AST.NodeWithLocation | undefined} */ (params[0]);
		const from = /** @type {AST.NodeWithLocation | undefined} */ (
			node.typeParameters ?? node.id ?? node.key
		)?.end;
		const open = findOutsideComments(
			'(',
			from ?? /** @type {AST.NodeWithLocation} */ (node).start,
			firstParam?.start ?? end,
		);
		if (open >= (firstParam?.start ?? end)) return null;
		const close = findOutsideComments(')', lastParam?.end ?? open + 1, end);
		return close < end ? { open, close } : null;
	}

	/**
	 * The keyword between a type parameter's name and its first child: the
	 * `in` of a mapped type's key, the `extends` before a constraint, or the
	 * `=` before a default. Null when there's no child.
	 * @param {AST.TSTypeParameter} node
	 * @param {AST.Node | AST.CSS.StyleSheet | undefined} parent
	 * @returns {string | null}
	 */
	function getTypeParameterKeyword(node, parent) {
		if (parent?.type === 'TSMappedType') return 'in';
		return node.constraint ? 'extends' : node.default ? '=' : null;
	}

	/**
	 * Prettier's parsers keep a type parameter's name as a node, which takes
	 * the comments around it. The ones between the modifiers and the name lead
	 * it. After it, before the type after the `extends`, `=`, or mapped type's
	 * `in` (see {@link getTypeParameterKeyword}), the ones that end their line
	 * trail it, and so do the other ones before the keyword that aren't on a
	 * line of their own. This parser keeps the name as a string, so those
	 * comments dangle on the type parameter, which prints them around its
	 * name. The rest lead the type after the keyword, with two exceptions:
	 * - A `prettier-ignore` comment on its own line, or after the keyword,
	 *   keeps ignoring that type.
	 * - A line comment, or a block comment that ends its line, on a line of
	 *   its own: Prettier prints it right after the keyword, where it ends the
	 *   line, and its next pass trails the name with it, so it trails the name
	 *   at once. After a line comment that trails the name, though, the type
	 *   moves to the next line, and the comment stays on its own line there.
	 * The comments between the constraint and the `=` of the default, and
	 * after the `=`, follow the same rules for the constraint (see
	 * {@link trailsTypeParameterPart}).
	 * @param {AST.TSTypeParameter & AST.NodeWithLocation} node
	 * @param {AST.Node | AST.CSS.StyleSheet | undefined} parent
	 */
	function takeTypeParameterNameComments(node, parent) {
		const keyword = getTypeParameterKeyword(node, parent);
		const first = /** @type {AST.NodeWithLocation | undefined} */ (node.constraint ?? node.default);
		const end = first?.start ?? node.end;
		let hasLineComment = false;
		while (comments[0] && comments[0].end <= end) {
			const comment = comments[0];
			if (keyword && !trailsTypeParameterPart(comment, keyword, end, hasLineComment)) break;
			hasLineComment ||= comment.type === 'Line';
			pushInnerComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
		}
	}

	/**
	 * Whether a comment after part of a type parameter, its name or its
	 * constraint, and before the type after the next keyword, trails that part
	 * rather than leading the type (see {@link takeTypeParameterNameComments})
	 * @param {AST.CommentWithLocation} comment
	 * @param {string} keyword - The keyword before the type
	 * @param {number} end - Where the type starts
	 * @param {boolean} hasLineComment - Whether a line comment after the part
	 *   trails it already
	 * @returns {boolean}
	 */
	function trailsTypeParameterPart(comment, keyword, end, hasLineComment) {
		const isAfterKeyword = findOutsideComments(keyword, comment.end, end) >= end;
		if (isPrettierIgnoreComment(comment) && (isAfterKeyword || isOwnLineComment(comment))) {
			return false;
		}
		return isOwnLineComment(comment)
			? !hasLineComment && (comment.type === 'Line' || isEndOfLineComment(comment))
			: isEndOfLineComment(comment) || !isAfterKeyword;
	}

	/**
	 * Whether `node` ends the parenthesized header of a statement, like the test
	 * of `if (a)` or the update of `for (…; …; i++)`, so the `)` after it closes
	 * the header. A switch's discriminant doesn't count: as in Prettier, a
	 * comment between its `)` and `{` trails it.
	 * @param {AST.Node} node
	 * @param {AST.Node} parent
	 * @returns {boolean}
	 */
	function endsStatementHeader(node, parent) {
		const statement = /** @type {any} */ (parent);
		/** @type {(AST.Node | null | undefined)[]} */
		let header;
		switch (statement.statementType ?? statement.type) {
			case 'IfStatement':
			case 'WhileStatement':
			case 'DoWhileStatement':
				header = [statement.test];
				break;
			case 'WithStatement':
				header = [statement.object];
				break;
			case 'ForInStatement':
			case 'ForOfStatement':
				header = [statement.right, statement.index, statement.key];
				break;
			case 'ForStatement':
				header = [statement.init, statement.test, statement.update];
				break;
			case 'CatchClause':
				header = [statement.param];
				break;
			default:
				return false;
		}
		const end = /** @type {AST.NodeWithLocation} */ (node).end;
		return (
			header.includes(node) &&
			header.every((part) => !part || /** @type {AST.NodeWithLocation} */ (part).end <= end)
		);
	}

	/**
	 * @param {AST.Node | AST.CSS.Node | null | undefined} node
	 * @returns {node is AST.NativeTSRXTemplateNode & AST.NodeWithLocation}
	 */
	function isNativeTemplateNode(node) {
		return (
			(node?.type === 'JSXElement' ||
				node?.type === 'JSXFragment' ||
				node?.type === 'JSXStyleElement') &&
			node.metadata?.native_tsrx === true
		);
	}

	/**
	 * @param {AST.Node | AST.CSS.Node | null | undefined} node
	 * @returns {node is AST.TSRXElementNode & AST.NodeWithLocation}
	 */
	function isNativeTemplateElement(node) {
		return (
			(node?.type === 'JSXElement' || node?.type === 'JSXStyleElement') &&
			node.metadata?.native_tsrx === true
		);
	}

	/**
	 * A JSX space, `{" "}`
	 * @param {AST.Node | AST.CSS.StyleSheet} node
	 * @returns {boolean}
	 */
	function isJSXSpace(node) {
		const expression = /** @type {any} */ (node).expression;
		return (
			node.type === 'JSXExpressionContainer' &&
			expression?.type === 'Literal' &&
			expression.value === ' '
		);
	}

	/**
	 * JSX text that renders more than whitespace
	 * @param {AST.Node | AST.CSS.Node | null | undefined} node
	 * @returns {node is ESTreeJSX.JSXText & AST.NodeWithLocation}
	 */
	function isTextWithWords(node) {
		return node?.type === 'JSXText' && /[^ \t\r\n]/.test(node.value);
	}

	/**
	 * Whether JSX text with words keeps a comment that lies in it. A
	 * `prettier-ignore` after its last word leads the next child instead, which
	 * it keeps as written.
	 * @param {AST.CommentWithLocation} comment
	 * @param {AST.Node | AST.CSS.Node | null | undefined} node
	 * @returns {boolean}
	 */
	function isCommentInText(comment, node) {
		if (!isTextWithWords(node) || comment.start < node.start || comment.end > node.end) {
			return false;
		}
		if (!isPrettierIgnoreComment(comment)) {
			return true;
		}
		return /[^ \t\r\n]/.test(stripCommentsFromSource(comment.end, node.end));
	}

	/**
	 * The source from `start` to `end` without its comments
	 * @param {number} start
	 * @param {number} end
	 * @returns {string}
	 */
	function stripCommentsFromSource(start, end) {
		let result = '';
		let index = start;
		while (index < end) {
			const comment = commentsByStart.get(index);
			if (comment) {
				index = comment.end;
			} else {
				result += source[index++];
			}
		}
		return result;
	}

	/**
	 * @param {AST.Node | AST.CSS.Node | null | undefined} node
	 * @returns {node is AST.NativeTSRXTemplateNode & AST.NodeWithLocation}
	 */
	function isEmptyTemplateNode(node) {
		return isNativeTemplateNode(node) && node.children.length === 0;
	}

	/**
	 * @param {AST.Node} node
	 * @returns {BaseNodeMetaData}
	 */
	function getNodeMetadata(node) {
		node.metadata ??= { path: [] };
		return node.metadata;
	}

	/**
	 * @param {AST.NodeWithMaybeComments} node
	 * @param {AST.CommentWithLocation} comment
	 */
	function pushInnerComment(node, comment) {
		(node.innerComments ||= []).push(comment);
	}

	/**
	 * @param {AST.NodeWithMaybeComments} node
	 * @returns {boolean}
	 */
	function hasInnerComments(node) {
		return !!node.innerComments?.length;
	}

	/**
	 * Whether a statement list has nothing but empty statements (`;`), which
	 * never take comments, so the list's comments belong to its container.
	 * @param {AST.Node[]} statements
	 * @returns {boolean}
	 */
	function hasOnlyEmptyStatements(statements) {
		return statements.every((statement) => statement.type === 'EmptyStatement');
	}

	/**
	 * Whether a node is an entry in one of its parent's lists, like a statement
	 * in a block, rather than a single child, like the body of `if (x) ;`.
	 * @param {AST.Node} node
	 * @param {AST.Node | AST.CSS.StyleSheet | undefined} parent
	 * @returns {boolean}
	 */
	function isListEntry(node, parent) {
		return (
			!!parent &&
			Object.values(parent).some((value) => Array.isArray(value) && value.includes(node))
		);
	}

	/**
	 * @param {AST.TSRXElementNode} node
	 * @returns {string | null}
	 */
	function getJSXElementName(node) {
		const name = node.openingElement.name;
		if (!name) return null;
		if (name.type === 'JSXIdentifier') return name.name;
		if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
		return null;
	}

	/**
	 * Every comment by its start and by its end, to look past the comments next
	 * to one on its line. Filled by `add_comments`.
	 * @type {Map<number, AST.CommentWithLocation>}
	 */
	const commentsByStart = new Map();
	/** @type {Map<number, AST.CommentWithLocation>} */
	const commentsByEnd = new Map();

	/**
	 * Like Prettier's `ownLine` placement: only whitespace and other comments sit
	 * between the start of the comment's line and the comment.
	 * @param {AST.CommentWithLocation} comment
	 * @returns {boolean}
	 */
	function isOwnLineComment(comment) {
		let i = comment.start - 1;
		while (i >= 0) {
			const previous = commentsByEnd.get(i + 1);
			if (previous) {
				i = previous.start - 1;
			} else if (source[i] === ' ' || source[i] === '\t') {
				i--;
			} else {
				return source[i] === '\n' || source[i] === '\r';
			}
		}
		return false;
	}

	/**
	 * Like Prettier's `endOfLine` placement: only whitespace and other comments
	 * sit between the comment and the end of its line.
	 * @param {AST.CommentWithLocation} comment
	 * @returns {boolean}
	 */
	function isEndOfLineComment(comment) {
		let i = comment.end;
		while (i < source.length) {
			const next = commentsByStart.get(i);
			if (next?.type === 'Line') {
				return true;
			} else if (next) {
				i = next.end;
			} else if (source[i] === ' ' || source[i] === '\t') {
				i++;
			} else {
				return source[i] === '\n' || source[i] === '\r';
			}
		}
		return false;
	}

	/**
	 * The child nodes a comment can attach to, like Prettier's
	 * `getSortedChildNodes` with its `canAttachComment` (in key order, not
	 * sorted)
	 * @param {AST.Node} node
	 * @param {(AST.Node & AST.NodeWithLocation)[]} [children]
	 * @returns {(AST.Node & AST.NodeWithLocation)[]}
	 */
	function getAttachableChildren(node, children = []) {
		for (const key in node) {
			if (key === 'metadata' || key === 'loc' || /[cC]omments$/.test(key)) continue;
			const value = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (node))[key];
			for (const child of Array.isArray(value) ? value : [value]) {
				if (
					child &&
					typeof child === 'object' &&
					typeof child.type === 'string' &&
					typeof child.start === 'number' &&
					typeof child.end === 'number' &&
					child.type !== 'TemplateElement' &&
					child.type !== 'EmptyStatement'
				) {
					// A property signature's type annotation takes no comments either:
					// its type does, so that a comment before the `:` trails the key
					if (
						child.type === 'ChainExpression' ||
						(child.type === 'TSTypeAnnotation' && node.type === 'TSPropertySignature')
					) {
						getAttachableChildren(child, children);
					} else {
						children.push(child);
					}
				}
			}
		}
		return children;
	}

	/**
	 * The nodes that zimmerframe's `next()` visits in `node`, with the ones in
	 * the source in source order, like Prettier's `getSortedChildNodes`, or
	 * null when they're in order already. The parser doesn't always add a
	 * node's keys in source order: it adds a call's type arguments after its
	 * arguments, a switch case's test after its body, and a generic arrow
	 * function's type parameters after its body. The walker gives a comment to
	 * the first node it visits that starts after it, so it must visit them in
	 * order.
	 * @param {AST.Node} node
	 * @returns {AST.Node[] | null}
	 */
	function getChildrenInSourceOrder(node) {
		/** @type {AST.Node[]} */
		const children = [];
		for (const key in node) {
			if (key === 'type') continue;
			const value = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (node))[key];
			if (!value || typeof value !== 'object') continue;
			for (const child of Array.isArray(value) ? value : [value]) {
				if (child && typeof child === 'object' && child.type) {
					children.push(child);
				}
			}
		}
		// Comments stay where they are, and so does a style sheet, whose
		// positions count from the start of its `<style>` element
		/** @param {AST.Node} child */
		const isSorted = (child) =>
			typeof (/** @type {AST.NodeWithLocation} */ (child).start) === 'number' &&
			child.type !== /** @type {string} */ ('Line') &&
			child.type !== /** @type {string} */ ('Block') &&
			child.type !== /** @type {string} */ ('StyleSheet');
		const located = /** @type {(AST.Node & AST.NodeWithLocation)[]} */ (children.filter(isSorted));
		const sorted = [...located].sort((a, b) => a.start - b.start);
		if (sorted.every((child, i) => child === located[i])) {
			return null;
		}
		let next = 0;
		return children.map((child) => (isSorted(child) ? sorted[next++] : child));
	}

	/**
	 * Like Prettier's `decorateComment`, the children of `enclosing` right
	 * before and after a comment that lies in `enclosing` outside all its
	 * children, so that `enclosing` is the comment's enclosing node, or null
	 * when it isn't.
	 * @param {AST.CommentWithLocation} comment
	 * @param {AST.Node | AST.CSS.StyleSheet | undefined} enclosing
	 * @returns {{ preceding: (AST.Node & AST.NodeWithLocation) | null, following: (AST.Node & AST.NodeWithLocation) | null } | null}
	 */
	function getCommentNeighbors(comment, enclosing) {
		if (!enclosing || enclosing.type === 'StyleSheet') {
			return null;
		}
		const node = /** @type {AST.Node & AST.NodeWithLocation} */ (enclosing);
		if (!(getCommentStart(node) <= comment.start && comment.end <= node.end)) {
			return null;
		}
		const { children, precedingIndexes } = getSortedAttachableChildren(node);
		// The first child that starts after the comment follows it. Every child
		// before it starts before the comment's end, so it precedes the comment,
		// or the comment lies in it.
		let low = 0;
		let high = children.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (getCommentStart(children[middle]) < comment.end) {
				low = middle + 1;
			} else {
				high = middle;
			}
		}
		const preceding = low > 0 ? children[precedingIndexes[low - 1]] : null;
		if (preceding && preceding.end > comment.start) {
			return null;
		}
		return { preceding, following: children[low] ?? null };
	}

	/**
	 * The attachable children of each node asked about, like Prettier's
	 * `childNodesCache`
	 * @type {WeakMap<AST.Node, { children: (AST.Node & AST.NodeWithLocation)[], precedingIndexes: number[] }>}
	 */
	const sortedChildrenCache = new WeakMap();

	/**
	 * A node's attachable children (see {@link getAttachableChildren}) sorted
	 * by their start (see {@link getCommentStart}), like Prettier's
	 * `getSortedChildNodes`, with, for each
	 * index, the index of the child up to it that ends last (the first such
	 * one)
	 * @param {AST.Node} node
	 * @returns {{ children: (AST.Node & AST.NodeWithLocation)[], precedingIndexes: number[] }}
	 */
	function getSortedAttachableChildren(node) {
		let sorted = sortedChildrenCache.get(node);
		if (!sorted) {
			const children = getAttachableChildren(node).sort(
				(a, b) => getCommentStart(a) - getCommentStart(b),
			);
			/** @type {number[]} */
			const precedingIndexes = [];
			children.forEach((child, index) => {
				const last = precedingIndexes[index - 1];
				precedingIndexes.push(last !== undefined && children[last].end >= child.end ? last : index);
			});
			sorted = { children, precedingIndexes };
			sortedChildrenCache.set(node, sorted);
		}
		return sorted;
	}

	/**
	 * Where a node starts for the comments before it, like Prettier's
	 * `locStart`: a node whose decorators come before it starts at the first
	 * of them, so that the comments after them lie in the node. That's an
	 * export whose declaration's decorators come before `export`
	 * (`@dec /* c *\/ export class A {}`), and a parameter, whose decorators
	 * the parser keeps outside its span (`@dec /* c *\/ x`). A parameter
	 * property's decorators hang off its parameter (`@dec private x`).
	 * @param {AST.Node | AST.CSS.StyleSheet} node
	 * @returns {number}
	 */
	function getCommentStart(node) {
		const { start } = /** @type {AST.NodeWithLocation} */ (node);
		const decorated = /** @type {any} */ (node).declaration ?? node;
		const [decorator] =
			(node.type === /** @type {string} */ ('TSParameterProperty')
				? /** @type {any} */ (node).parameter
				: decorated
			)?.decorators ?? [];
		return decorator && decorator.start < start ? decorator.start : start;
	}

	/**
	 * @param {AST.Node | null | undefined} node
	 * @returns {node is AST.ClassDeclaration | AST.ClassExpression | AST.TSInterfaceDeclaration}
	 */
	function isClassLike(node) {
		return (
			node?.type === 'ClassDeclaration' ||
			node?.type === 'ClassExpression' ||
			node?.type === 'TSInterfaceDeclaration'
		);
	}

	/**
	 * Like Prettier's `isPropertyLikeNode`: a class member, or a parameter
	 * property, whose modifiers print between its decorators and its key
	 * @param {AST.Node | AST.CSS.StyleSheet | null | undefined} node
	 * @returns {boolean}
	 */
	function isPropertyLike(node) {
		const type = /** @type {string | undefined} */ (node?.type);
		return (
			type === 'PropertyDefinition' ||
			type === 'MethodDefinition' ||
			type === 'AccessorProperty' ||
			type === 'TSAbstractPropertyDefinition' ||
			type === 'TSAbstractMethodDefinition' ||
			type === 'TSAbstractAccessorProperty' ||
			type === 'TSDeclareMethod' ||
			type === 'TSParameterProperty'
		);
	}

	/**
	 * @param {AST.Node} node
	 * @param {AST.CommentWithLocation} comment
	 */
	function addLeadingComment(node, comment) {
		const withComments = /** @type {AST.NodeWithMaybeComments} */ (node);
		(withComments.leadingComments ||= []).push(comment);
	}

	/**
	 * @param {AST.Node} node
	 * @param {AST.CommentWithLocation} comment
	 */
	function addTrailingComment(node, comment) {
		const withComments = /** @type {AST.NodeWithMaybeComments} */ (node);
		(withComments.trailingComments ||= []).push(comment);
	}

	/**
	 * Like Prettier's `addBlockStatementFirstComment`: the comment leads the
	 * first statement of a block, or dangles in the block when it has none.
	 * @param {AST.BlockStatement | AST.ClassBody} block
	 * @param {AST.CommentWithLocation} comment
	 */
	function addBlockStatementFirstComment(block, comment) {
		const first = /** @type {AST.Node[]} */ (block.body).find(
			(statement) => statement.type !== 'EmptyStatement',
		);
		if (first) {
			addLeadingComment(first, comment);
		} else {
			pushInnerComment(block, comment);
		}
	}

	/**
	 * Like Prettier's `isTypeCastComment`: a JSDoc comment with `@type` or
	 * `@satisfies`
	 * @param {AST.CommentWithLocation} comment
	 * @returns {boolean}
	 */
	function isTypeCastComment(comment) {
		return (
			comment.type === 'Block' &&
			comment.value[0] === '*' &&
			/@(?:type|satisfies)\b/.test(comment.value)
		);
	}

	/**
	 * @param {AST.CommentWithLocation} comment
	 * @returns {boolean}
	 */
	function isPrettierIgnoreComment(comment) {
		return /^\s*prettier-ignore(?:\s|$)/.test(comment.value);
	}

	/**
	 * The type inside any parentheses written around a type
	 * (`TSParenthesizedType`), or the node itself.
	 * @param {AST.Node | null} node
	 * @returns {AST.Node | null}
	 */
	function skipParenthesizedTypes(node) {
		while (node?.type === 'TSParenthesizedType') {
			node = /** @type {AST.Node} */ (/** @type {unknown} */ (node.typeAnnotation));
		}
		return node;
	}

	/**
	 * Whether {@link handleComment} has a rule for comments in the node.
	 * @param {AST.Node | AST.CSS.StyleSheet | undefined} node
	 * @returns {boolean}
	 */
	function isHandledEnclosingNode(node) {
		const type = /** @type {any} */ (node)?.statementType ?? node?.type;
		return (
			type === 'IfStatement' ||
			type === 'WhileStatement' ||
			type === 'WithStatement' ||
			type === 'TryStatement' ||
			type === 'CatchClause' ||
			type === 'ConditionalExpression' ||
			type === 'TSConditionalType' ||
			type === 'MemberExpression' ||
			type === 'BinaryExpression' ||
			type === 'LogicalExpression' ||
			type === 'TSUnionType' ||
			type === 'AssignmentPattern' ||
			type === 'TSMappedType' ||
			type === 'TSTypeParameter' ||
			type === 'VariableDeclarator' ||
			type === 'ReturnStatement' ||
			type === 'AssignmentExpression' ||
			getSignatureParameters(node) !== null ||
			isClassLike(/** @type {AST.Node} */ (node)) ||
			isPropertyLike(node) ||
			// A parameter property's decorators hang off its parameter
			!!(/** @type {any} */ (node)?.decorators?.length)
		);
	}

	/**
	 * Template values that print in parentheses when they break, with the
	 * comments after them inside: an element, a fragment, or template control
	 * flow
	 */
	const elementValueTypes = new Set([
		'JSXElement',
		'JSXFragment',
		'JSXIfExpression',
		'JSXForExpression',
		'JSXSwitchExpression',
		'JSXTryExpression',
	]);

	/**
	 * Whether a node is an arrow function whose body is an element or other
	 * template value (see {@link elementValueTypes})
	 * @param {AST.Node | AST.CSS.StyleSheet} node
	 * @returns {boolean}
	 */
	function isArrowWithElementBody(node) {
		return node.type === 'ArrowFunctionExpression' && elementValueTypes.has(node.body.type);
	}

	/**
	 * Whether the comments inside a node after its last child are its own: a
	 * list or body keeps them inside, where its last entry or the node itself
	 * takes them, and a template, a function (around its parameters and
	 * body), and a template literal have their own rules. Like Prettier, the
	 * comments after an arrow's element body, in the parentheses around it,
	 * trail the body and print inside them. Prettier gives the comments after
	 * any other body to it too, but prints that body without the parentheses,
	 * so the next pass moves them after the statement: they go there at once.
	 * Like Prettier, the comments after a spread's argument, or the expression
	 * of a `{…}` (a child, an attribute value, or a dynamic tag's name), before
	 * its `}`, trail it, and the braces print them inside.
	 * @param {AST.Node | AST.CSS.StyleSheet} node
	 * @returns {boolean}
	 */
	function keepsCommentsAfterChildren(node) {
		return (
			(node.type.startsWith('JSX') &&
				node.type !== 'JSXSpreadAttribute' &&
				node.type !== 'JSXSpreadChild' &&
				node.type !== 'JSXExpressionContainer') ||
			isNativeTemplateNode(node) ||
			(isFunctionNode(node) && !isArrowWithElementBody(node)) ||
			isClassLike(/** @type {AST.Node} */ (node)) ||
			node.type === 'Program' ||
			node.type === 'BlockStatement' ||
			node.type === 'StaticBlock' ||
			node.type === 'TSModuleBlock' ||
			node.type === 'ClassBody' ||
			node.type === 'TSInterfaceBody' ||
			node.type === 'SwitchStatement' ||
			node.type === 'SwitchCase' ||
			node.type === 'TSTypeLiteral' ||
			node.type === 'TSEnumDeclaration' ||
			node.type === 'ObjectExpression' ||
			node.type === 'ObjectPattern' ||
			node.type === 'ArrayExpression' ||
			node.type === 'ArrayPattern' ||
			node.type === 'TemplateLiteral' ||
			node.type === 'StyleSheet'
		);
	}

	/**
	 * A port of Prettier's comment handlers (`handleOwnLineComment`,
	 * `handleEndOfLineComment`, and `handleRemainingComment` in
	 * `src/language-js/comments/handle-comments.js`) for the places where this
	 * parser's own rules differ from them. It runs before those rules.
	 * @param {AST.CommentWithLocation} comment
	 * @param {AST.Node} enclosing - The node the comment lies in
	 * @param {AST.Node | null} preceding - The child of `enclosing` before it
	 * @param {AST.Node | null} following - The child of `enclosing` after it
	 * @param {AST.Node | AST.CSS.StyleSheet | undefined} ancestor - The parent
	 *   of `enclosing`
	 * @returns {boolean} Whether the comment was attached
	 */
	function handleComment(comment, enclosing, preceding, following, ancestor) {
		// A JSDoc type cast keeps to the parentheses it casts, which Prettier's
		// `babel` parser keeps as a node of their own for it
		if (isTypeCastComment(comment) && getNextNonSpaceNonCommentCharacter(comment.end) === '(') {
			return false;
		}

		const ownLine = isOwnLineComment(comment);
		const endOfLine = !ownLine && isEndOfLineComment(comment);
		const node = /** @type {any} */ (enclosing);
		const type = node.statementType ?? node.type;

		// `handleCommentInEmptyParens`: a comment in the empty parentheses of a
		// parameter list dangles on the function or signature, which prints it
		// there: `(/* c */): T`
		if (getSignatureParameters(enclosing)?.length === 0) {
			const parens = getParameterParens(enclosing);
			if (parens && comment.start > parens.open && comment.end <= parens.close) {
				pushInnerComment(enclosing, comment);
				return true;
			}
		}

		// `handleIfStatementComments` and `handleWhileLikeComments`: a comment
		// before the `)` that closes the condition trails the condition
		if (
			(type === 'IfStatement' || type === 'WhileStatement' || type === 'WithStatement') &&
			preceding &&
			following &&
			getNextNonSpaceNonCommentCharacter(comment.end) === ')'
		) {
			addTrailingComment(preceding, comment);
			return true;
		}

		// `handleTryStatementComments`: a comment on its own line or at the end
		// of a line before a block of a `try` (the `try` block, a template's
		// `@pending` block, the `catch` body, or the `finally` block) moves into
		// that block as its first comment. In a `catch`, one after the
		// parameter trails it.
		if (
			(ownLine || endOfLine) &&
			(type === 'TryStatement' || type === 'CatchClause') &&
			following
		) {
			if (type === 'CatchClause' && preceding) {
				addTrailingComment(preceding, comment);
				return true;
			}
			if (following.type === 'BlockStatement') {
				addBlockStatementFirstComment(/** @type {AST.BlockStatement} */ (following), comment);
				return true;
			}
			if (following.type === 'CatchClause') {
				addBlockStatementFirstComment(/** @type {AST.CatchClause} */ (following).body, comment);
				return true;
			}
		}

		// `handleConditionalExpressionComments`: a comment on its own line or at
		// the end of a line in a conditional leads the branch after it, unless
		// it's on the line of the node before it. That one trails the node by
		// the default below, so it stays before the `?` or `:`.
		if (
			(ownLine || endOfLine) &&
			(type === 'ConditionalExpression' || type === 'TSConditionalType') &&
			following &&
			(!preceding ||
				source
					.slice(/** @type {AST.NodeWithLocation} */ (preceding).end, comment.start)
					.includes('\n'))
		) {
			addLeadingComment(following, comment);
			return true;
		}

		// Prettier's tie-break for a comment between a class's last decorator
		// and the node after it: with a keyword between them, like the
		// `export` and `class` of `@dec export /* c */ class A {}`, it trails
		// the decorator, which prints it before `export`
		if (
			!ownLine &&
			!endOfLine &&
			isClassLike(enclosing) &&
			preceding?.type === 'Decorator' &&
			following &&
			following.type !== 'Decorator' &&
			!isBlankBetween(comment.end, /** @type {AST.NodeWithLocation} */ (following).start, false)
		) {
			addTrailingComment(preceding, comment);
			return true;
		}

		// `handleClassComments`: a comment in the heading of a decorated class
		// trails the last decorator. One before the body moves into it, and one
		// before the superclass or the first `implements`/`extends` type trails
		// the name, the type parameters, or the superclass before it, so that it
		// doesn't print after the keyword.
		if ((ownLine || endOfLine) && isClassLike(enclosing) && following) {
			const decorators = /** @type {AST.Node[] | undefined} */ (node.decorators);
			if (decorators?.length && following.type !== 'Decorator') {
				addTrailingComment(/** @type {AST.Node} */ (decorators.at(-1)), comment);
				return true;
			}
			if (following === node.body) {
				addBlockStatementFirstComment(node.body, comment);
				return true;
			}
			/** @type {unknown[]} */
			const heading = [node.id, node.typeParameters];
			if (preceding && following === node.superClass && heading.includes(preceding)) {
				addTrailingComment(preceding, comment);
				return true;
			}
			// The superclass's type arguments print with it
			heading.push(node.superClass, node.superTypeParameters);
			const heritage = node.type === 'TSInterfaceDeclaration' ? node.extends : node.implements;
			if (following === heritage?.[0]) {
				if (preceding && heading.includes(preceding)) {
					addTrailingComment(preceding, comment);
				} else {
					// With nothing before the clause, as in a class expression with
					// no name, the comment dangles on the class, and the clause
					// prints it (Prettier's dangling comment marked `implements`)
					pushInnerComment(node, comment);
				}
				return true;
			}
		}

		// `handleMethodNameComments`: a line comment, or a comment on its own
		// line, after a class member's or a parameter property's decorator
		// trails it, so that it prints before the modifiers (`static`,
		// `accessor`, `private`, …) rather than between them and the name,
		// where it would break the line after them. The parser hangs a
		// parameter property's decorators off its parameter.
		const isParameterPropertyParameter =
			ancestor?.type === /** @type {string} */ ('TSParameterProperty') &&
			/** @type {any} */ (ancestor).parameter === enclosing;
		if (
			preceding?.type === 'Decorator' &&
			(isPropertyLike(enclosing) || isParameterPropertyParameter) &&
			(comment.type === 'Line' || ownLine)
		) {
			addTrailingComment(preceding, comment);
			return true;
		}

		// Prettier's tie-break for a comment with code on both sides between a
		// parameter property's decorators and its name, which follows it in
		// Prettier's parameter property, where the decorators are. Here a
		// parameter without a default is the name the decorators hang off, so
		// no child follows the comment: like the tie-break, it leads the
		// parameter when only whitespace and comments sit before the name, so
		// it stays after the modifiers (`@dec private /* c */ x`), and trails
		// the decorator before the modifiers otherwise (`@dec /* c */ private
		// x`). With a default, the name is the pattern's `left`, and the
		// tie-break below places the comment.
		const enclosingStart = /** @type {AST.NodeWithLocation} */ (enclosing).start;
		if (
			preceding?.type === 'Decorator' &&
			isParameterPropertyParameter &&
			enclosing.type === 'Identifier' &&
			comment.end <= enclosingStart
		) {
			if (!ownLine && !endOfLine && isBlankBetween(comment.end, enclosingStart, false)) {
				addLeadingComment(enclosing, comment);
			} else {
				addTrailingComment(preceding, comment);
			}
			return true;
		}

		// `handleMemberExpressionComments`: a comment on its own line before the
		// name of a member lookup leads the lookup, so that a member chain prints
		// it before the `.`
		if (ownLine && node.type === 'MemberExpression' && following?.type === 'Identifier') {
			addLeadingComment(node, comment);
			return true;
		}

		// `handleAssignmentPatternComments`: a comment on its own line in a
		// default value leads the whole pattern, so that it prints before the
		// parameter or property rather than after the `=`. In a parameter
		// property, it leads the property: Prettier prints it after the
		// modifier (`private // c`), which breaks the code.
		if (ownLine && node.type === 'AssignmentPattern') {
			addLeadingComment(
				ancestor?.type === /** @type {string} */ ('TSParameterProperty')
					? /** @type {AST.Node} */ (ancestor)
					: enclosing,
				comment,
			);
			return true;
		}

		// `handleUnionTypeComments`: a comment on its own line after a union
		// member trails it, so that it prints before the next `|`. A
		// `prettier-ignore` comment there, or on its own line before a union,
		// ignores the member after it: it marks that member and no longer
		// counts itself (Prettier's `prettierIgnore` and `unignore`). Any other
		// `prettier-ignore` comment stays with the member it ignores.
		// Prettier's parsers keep no node for a type's parentheses, so a union
		// written in them is the node after the comment there.
		if (ownLine && isPrettierIgnoreComment(comment)) {
			const followingType = skipParenthesizedTypes(following);
			const ignored =
				node.type === 'TSUnionType'
					? following
					: followingType?.type === 'TSUnionType'
						? /** @type {AST.TSUnionType} */ (followingType).types[0]
						: null;
			if (ignored) {
				getNodeMetadata(ignored).prettierIgnore = true;
				comment.unignore = true;
			}
		}
		if (ownLine && node.type === 'TSUnionType' && preceding) {
			addTrailingComment(preceding, comment);
			return true;
		}
		if (node.type === 'TSUnionType' && isPrettierIgnoreComment(comment)) {
			return false;
		}

		// `handleUnionTypeLeadingComments`: a one-line block comment right before
		// a union leads its first member, so it prints after the `|` that starts
		// the member when the union breaks
		if (
			!endOfLine &&
			following?.type === 'TSUnionType' &&
			comment.type === 'Block' &&
			!source.slice(comment.start, comment.end).includes('\n') &&
			!isPrettierIgnoreComment(comment) &&
			/^[ \t]*$/.test(source.slice(comment.end, following.start))
		) {
			addLeadingComment(/** @type {AST.TSUnionType} */ (following).types[0], comment);
			return true;
		}

		// `handleParenthesizedExpressionTrailingComment`: a comment that isn't on
		// a line of its own, after a sequence or assignment in the parentheses
		// around an arrow function's body, a declarator's value, a `return`
		// argument, or the right side of an assignment, trails the sequence's
		// last expression or the assignment's right side, so that it prints
		// inside the parentheses the printer keeps there:
		// `const f = () => (a = b /* note */);`. The handler's first case, for
		// an expression statement, is in `movesCommentAfterParens`.
		if (
			!ownLine &&
			preceding &&
			!following &&
			(preceding.type === 'SequenceExpression' || preceding.type === 'AssignmentExpression') &&
			(node.type === 'ArrowFunctionExpression'
				? node.body === preceding
				: node.type === 'VariableDeclarator'
					? node.init === preceding
					: node.type === 'ReturnStatement'
						? node.argument === preceding
						: node.type === 'AssignmentExpression' && node.right === preceding) &&
			// Before the `)` of those parentheses. A comment before the `;` of a
			// `return` without them lies outside the statement for Prettier,
			// which ends it before the `;` (see `takeCommentsBeforeFinalSemicolon`)
			getNextNonSpaceNonCommentCharacter(comment.end) === ')'
		) {
			addTrailingComment(
				preceding.type === 'SequenceExpression'
					? /** @type {AST.Node} */ (preceding.expressions.at(-1))
					: preceding.right,
				comment,
			);
			return true;
		}

		// A comment on its own line before the `]` of a mapped type's key trails
		// the node before it, where the printer keeps it. Prettier gives it to
		// the type after the `]`, which prints it after the `:`, and its next
		// pass moves it back before the `]`, at the end of the key's line.
		if (
			ownLine &&
			node.type === 'TSMappedType' &&
			preceding &&
			getNextNonSpaceNonCommentCharacter(comment.end) === ']'
		) {
			addTrailingComment(preceding, comment);
			return true;
		}

		// Like the comments after a type parameter's name (see
		// `takeTypeParameterNameComments`), the ones between its constraint and
		// its default trail the constraint, which prints them on its line, before
		// the `=`, or after it at the end of that line. As in Prettier, whose
		// default below trails the constraint with a comment that ends its line,
		// one after the `=` then stays there (`T extends C = // note`) instead
		// of leading the default, which would print its own `hardline` without
		// indenting the default. A `prettier-ignore` comment after the `=` keeps
		// ignoring the default.
		if (
			node.type === 'TSTypeParameter' &&
			preceding &&
			following &&
			preceding === node.constraint
		) {
			const hasLineComment = !!(
				/** @type {AST.NodeWithMaybeComments} */ (preceding).trailingComments?.some(
					(trailing) => trailing.type === 'Line',
				)
			);
			const defaultStart = /** @type {AST.NodeWithLocation} */ (following).start;
			if (!trailsTypeParameterPart(comment, '=', defaultStart, hasLineComment)) {
				return false;
			}
			addTrailingComment(preceding, comment);
			return true;
		}

		// Prettier's default for a comment that ends its line: it trails the
		// node before it, so that it stays after an operator (`a || // note`)
		// instead of moving to its own line, and before the `)` of a parameter
		// list (`function f(a) // note` with the return type on the next line)
		// or the `]` of a mapped type's key instead of after the `:`
		if (endOfLine && preceding && following && following === getReturnType(enclosing)) {
			addTrailingComment(preceding, comment);
			return true;
		}
		if (
			endOfLine &&
			preceding &&
			(node.type === 'BinaryExpression' ||
				node.type === 'LogicalExpression' ||
				node.type === 'ConditionalExpression' ||
				node.type === 'TSConditionalType' ||
				node.type === 'TSUnionType' ||
				node.type === 'AssignmentPattern' ||
				node.type === 'TSMappedType')
		) {
			addTrailingComment(preceding, comment);
			return true;
		}

		return false;
	}

	/**
	 * The parameters of a function or a TypeScript function type or signature,
	 * which TypeScript's own nodes keep in `parameters`
	 * @param {AST.Node | AST.CSS.StyleSheet | null | undefined} node
	 * @returns {AST.Node[] | null}
	 */
	function getSignatureParameters(node) {
		const signature = /** @type {any} */ (node);
		return isFunctionNode(node) || node?.type === 'TSDeclareFunction'
			? signature.params
			: isTypeSignatureNode(node)
				? signature.parameters
				: null;
	}

	/**
	 * The return type of a function or a TypeScript function type or
	 * signature, which TypeScript's own nodes keep in `typeAnnotation`
	 * @param {AST.Node | AST.CSS.StyleSheet | null | undefined} node
	 * @returns {AST.Node | null}
	 */
	function getReturnType(node) {
		const signature = /** @type {any} */ (node);
		return (
			signature?.returnType ?? (isTypeSignatureNode(node) ? signature.typeAnnotation : null) ?? null
		);
	}

	/**
	 * @param {AST.Node | AST.CSS.StyleSheet | null | undefined} node
	 * @returns {boolean}
	 */
	function isTypeSignatureNode(node) {
		return (
			node?.type === 'TSFunctionType' ||
			node?.type === 'TSConstructorType' ||
			node?.type === 'TSCallSignatureDeclaration' ||
			node?.type === 'TSConstructSignatureDeclaration' ||
			node?.type === 'TSMethodSignature'
		);
	}

	/**
	 * Prettier's `breakTies` (`src/main/comments/attach.js`) for the comments
	 * right after `node` that share their line with code on both sides (its
	 * placement "remaining"), with `node` before them and `following` after
	 * them in `parent`. Going back from `following`, the comments that only
	 * whitespace or `(` separate from it, and from each other, lead it, and
	 * the ones before them trail `node`: `tag /* c *\/ \`x\``, `(a, /* c *\/ b)`,
	 * and `x /* c *\/ : T` lead the node after the comment, and
	 * `import d /* c *\/, { a }` trails the one before it. Like Prettier's
	 * handlers, which run first, a comment before the `(` of a function or
	 * method trails the name before it, and the arrow function's own rules
	 * place a comment before its `=>`. An `if` statement and templates keep
	 * their own rules, and so does a comment before a `)`.
	 * @param {AST.Node} node
	 * @param {AST.Node} parent
	 * @param {AST.Node | null} following
	 * @returns {'none' | 'trail' | 'lead'} Whether the comments that tie all
	 *   trailed `node`, some are left to lead `following`, or none tie
	 */
	function breakTies(node, parent, following) {
		const first = /** @type {AST.CommentWithLocation} */ (comments[0]);
		const isRemaining = (/** @type {AST.CommentWithLocation} */ comment) =>
			!isOwnLineComment(comment) && !isEndOfLineComment(comment);
		const type = /** @type {any} */ (parent).statementType ?? parent.type;
		if (!following || type === 'IfStatement' || type.startsWith('JSX') || !isRemaining(first)) {
			return 'none';
		}

		const nextIndex = getNextNonSpaceNonCommentCharacterIndex(first.end);
		const next = source[nextIndex];
		// Like Prettier, a comment before the `)` of a function called right away
		// or used as a tag trails the function, which prints it inside those
		// parentheses (Prettier's `printCommentsForFunction`):
		// `(() => {} /* c */)(x)`
		const call = /** @type {any} */ (parent);
		if (
			next === ')' &&
			(node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') &&
			((parent.type === 'CallExpression' && call.callee === node) ||
				(parent.type === 'TaggedTemplateExpression' && call.tag === node))
		) {
			addTrailingComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
			return 'trail';
		}
		if (
			// Prettier gives a comment before a `)` to the node before it too, but
			// prints it after the parentheses, where its next pass may give it to
			// the node after them: `(a /* c */)(x)`
			next === ')' ||
			// A JSDoc type cast keeps to its parentheses (see `handleComment`)
			(isTypeCastComment(first) && next === '(') ||
			// `handleCommentAfterArrowParams`
			(parent.type === 'ArrowFunctionExpression' && source.startsWith('=>', nextIndex))
		) {
			return 'none';
		}

		// `handleFunctionNameComments` and `handleMethodNameComments`
		const property = /** @type {any} */ (parent);
		if (
			next === '(' &&
			(parent.type === 'FunctionDeclaration' ||
				parent.type === 'FunctionExpression' ||
				parent.type === 'MethodDefinition' ||
				(parent.type === 'Property' &&
					property.key === node &&
					node.type === 'Identifier' &&
					getNextNonSpaceNonCommentCharacter(/** @type {AST.NodeWithLocation} */ (node).end) !==
						':'))
		) {
			addTrailingComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
			return 'trail';
		}

		let count = 1;
		while (comments[count] && isRemaining(comments[count])) {
			const neighbors = getCommentNeighbors(comments[count], parent);
			if (neighbors?.preceding !== node || neighbors.following !== following) break;
			count++;
		}
		let gapEnd = /** @type {AST.NodeWithLocation} */ (following).start;
		let firstLeading = count;
		while (
			firstLeading > 0 &&
			/^[\s(]*$/.test(source.slice(comments[firstLeading - 1].end, gapEnd))
		) {
			firstLeading--;
			gapEnd = comments[firstLeading].start;
		}
		for (let i = 0; i < firstLeading; i++) {
			addTrailingComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
		}
		return firstLeading < count ? 'lead' : 'trail';
	}

	return {
		/**
		 * @type {Parse.Options['onComment']}
		 */
		onComment: (block, value, start, end, start_loc, end_loc, metadata) => {
			if (block && /\n/.test(value)) {
				let a = start;
				while (a > 0 && source[a - 1] !== '\n') a -= 1;

				let b = a;
				while (/[ \t]/.test(source[b])) b += 1;

				const indentation = source.slice(a, b);
				value = value.replace(new RegExp(`^${indentation}`, 'gm'), '');
			}

			comments.push({
				type: block ? 'Block' : 'Line',
				value,
				start,
				end,
				loc: {
					start: start_loc,
					end: end_loc,
				},
				context: metadata ?? null,
			});
		},

		/**
		 * @param {AST.Node | AST.CSS.StyleSheet} ast
		 */
		add_comments: (ast) => {
			if (comments.length === 0) return;

			comments = comments
				.filter((comment) => comment.start >= index)
				.map(({ type, value, start, end, loc, context }) => ({
					type,
					value,
					start,
					end,
					loc,
					context,
				}));
			for (const comment of comments) {
				commentsByStart.set(comment.start, comment);
				commentsByEnd.set(comment.end, comment);
			}

			walk(ast, null, {
				_(node, { next, path, visit }) {
					const metadata = /** @type {AST.Node} */ (node)?.metadata;

					/** @returns {boolean} */
					function isCommentInsideAttributeExpression() {
						for (let i = path.length - 1; i >= 0; i--) {
							const ancestor = path[i];
							if (
								ancestor &&
								(ancestor.type === 'JSXAttribute' || ancestor.type === 'JSXExpressionContainer')
							) {
								return true;
							}
						}
						return false;
					}

					/**
					 * @param {AST.CommentWithLocation} comment
					 * @returns {boolean}
					 */
					function isCommentInsideUnvisitedAttribute(comment) {
						for (let i = path.length - 1; i >= 0; i--) {
							const ancestor = path[i];
							// Inside an attribute, which is visited before the element, the
							// comments in it are its own: one in a spread attribute's braces
							// (`{.../* c */ b}`) leads the argument
							if (ancestor.type === 'JSXAttribute' || ancestor.type === 'JSXSpreadAttribute') {
								return false;
							}
							if (isNativeTemplateElement(ancestor)) {
								for (const attr of ancestor.openingElement.attributes) {
									if (
										attr.start !== undefined &&
										attr.end !== undefined &&
										comment.start >= attr.start &&
										comment.end <= attr.end
									) {
										return true;
									}
								}
							}
						}
						return false;
					}

					/**
					 * @param {AST.CommentWithLocation} comment
					 * @returns {(AST.NativeTSRXTemplateNode & AST.NodeWithLocation) | null}
					 */
					function getEmptyElementInnerCommentTarget(comment) {
						const element = path.findLast((ancestor) => isNativeTemplateNode(ancestor));
						const openingEnd =
							element?.type === 'JSXFragment'
								? element.openingFragment?.end
								: element?.openingElement?.end;
						if (
							!element ||
							!isEmptyTemplateNode(element) ||
							openingEnd === undefined ||
							!(comment.start >= openingEnd && comment.end <= element.end)
						) {
							return null;
						}

						return element;
					}

					// Skip CSS nodes entirely - they use CSS-local positions (relative to
					// the <style> tag content) which would incorrectly match against
					// absolute source positions of JS/HTML comments. Also consume any
					// CSS comments (which have absolute positions) that fall within the
					// parent <style> element's content range so they don't leak to
					// subsequent JS nodes.
					if (node.type === 'StyleSheet') {
						const styleElement = path.findLast(
							(ancestor) =>
								isNativeTemplateElement(ancestor) && getJSXElementName(ancestor) === 'style',
						);
						if (isNativeTemplateElement(styleElement)) {
							const cssStart = styleElement.openingElement.end ?? styleElement.start;
							const cssEnd = styleElement.closingElement?.start ?? styleElement.end;
							while (comments[0] && comments[0].start >= cssStart && comments[0].end <= cssEnd) {
								comments.shift();
							}
						}
						return;
					}

					// Like Prettier's `canAttachComment`, an empty statement in a statement
					// list never owns a comment: it prints as nothing, so the comment would
					// lose its place. The statement before or after it, or the list's
					// container, takes it. A `;` body (`if (x) ;`) prints in place and keeps
					// its comments. Nor does a template literal's text, which prints as
					// written, so the expression in the `${…}` takes a comment in it.
					const emptyParent = path.at(-1);
					if (
						(node.type === 'EmptyStatement' && isListEntry(node, emptyParent)) ||
						node.type === 'TemplateElement'
					) {
						return;
					}

					// Like Prettier's `canAttachComment`, the key of a shorthand
					// property with a default value (`{ a = 1 }`) never owns a comment
					// either: the default, which prints instead, has its own copy of it
					if (
						emptyParent?.type === 'Property' &&
						emptyParent.shorthand &&
						emptyParent.key === node &&
						emptyParent.value.type === 'AssignmentPattern'
					) {
						return;
					}

					if (metadata && metadata.commentContainerId !== undefined) {
						// For empty template elements, keep comments as `innerComments`.
						// The Prettier plugin uses `innerComments` to preserve them and
						// to avoid collapsing the element into self-closing syntax.
						const isEmptyElement = isEmptyTemplateNode(node);
						if (!isEmptyElement) {
							while (
								comments[0] &&
								comments[0].context &&
								comments[0].context.containerId === metadata.commentContainerId &&
								comments[0].context.beforeMeaningfulChild
							) {
								// Check that the comment is actually in this element's own content
								// area, not positionally inside a child element. This handles the
								// case where jsx_parseOpeningElementAt() triggers jsx_readToken()
								// before the child element is pushed to the parser's #path, causing
								// comments inside the child to get the parent's containerId.
								const commentStart = comments[0].start;
								const isInsideChildElement = node_children(node).some(
									(child) =>
										child &&
										child.start !== undefined &&
										child.end !== undefined &&
										commentStart >= child.start &&
										commentStart < child.end,
								);
								if (isInsideChildElement) break;

								const elementComment = /** @type {AST.CommentWithLocation} */ (comments.shift());

								(metadata.elementLeadingComments ||= []).push(elementComment);
							}
						}
					}

					while (comments[0] && comments[0].start < getCommentStart(node)) {
						// Skip comments that are inside an attribute of an ancestor JSX element.
						// Since zimmerframe visits children before attributes, we need to leave
						// these comments for when the attribute nodes are visited.
						if (
							isCommentInsideUnvisitedAttribute(
								/** @type {AST.CommentWithLocation} */ (comments[0]),
							)
						) {
							break;
						}

						const maybeInner = getEmptyElementInnerCommentTarget(
							/** @type {AST.CommentWithLocation} */ (comments[0]),
						);
						if (maybeInner) {
							pushInnerComment(
								maybeInner,
								/** @type {AST.CommentWithLocation} */ (comments.shift()),
							);
							continue;
						}

						const comment = /** @type {AST.CommentWithLocation} */ (comments.shift());

						// A comment that reaches a function's body from outside it sits
						// between the parameter list's `(` and the body, where no node
						// took it. As in Prettier, one in empty parentheses dangles on
						// the function, one before an arrow's `=>` dangles on the arrow
						// (in its `comments`), a line comment before a block body moves
						// into it, and any other comment leads the body.
						const functionNode = path.at(-1);
						const nodeStart = /** @type {AST.NodeWithLocation} */ (node).start;
						if (isFunctionNode(functionNode) && functionNode.body === node) {
							const parens = getParameterParens(functionNode);
							if (parens && comment.start > parens.open && comment.end <= parens.close) {
								pushInnerComment(functionNode, comment);
								continue;
							}
							if (
								functionNode.type === 'ArrowFunctionExpression' &&
								findOutsideComments('=>', comment.end, nodeStart) < nodeStart
							) {
								(functionNode.comments ||= []).push(comment);
								continue;
							}
							if (node.type === 'BlockStatement' && comment.type === 'Line') {
								comments.unshift(comment);
								break;
							}
						}

						// Prettier's handlers for a comment before this node in its parent
						const enclosing = /** @type {AST.Node} */ (path.at(-1));
						if (
							isHandledEnclosingNode(enclosing) ||
							skipParenthesizedTypes(node)?.type === 'TSUnionType'
						) {
							const neighbors = getCommentNeighbors(comment, enclosing);
							if (
								neighbors?.following === node &&
								handleComment(comment, enclosing, neighbors.preceding, node, path.at(-2))
							) {
								continue;
							}
						}

						if (isCommentInsideAttributeExpression()) {
							(node.leadingComments ||= []).push(comment);
							continue;
						}

						const ancestorElements = path
							.filter(has_location)
							.filter(isNativeTemplateNode)
							.sort((a, b) => a.loc.start.line - b.loc.start.line);

						const targetAncestor = ancestorElements.find(
							(ancestor) => comment.loc.start.line < ancestor.loc.start.line,
						);

						if (targetAncestor) {
							const targetMetadata = getNodeMetadata(targetAncestor);
							(targetMetadata.elementLeadingComments ||= []).push(comment);
							continue;
						}

						(node.leadingComments ||= []).push(comment);
					}

					if (node.type === 'TSTypeParameter') {
						takeTypeParameterNameComments(
							/** @type {AST.TSTypeParameter & AST.NodeWithLocation} */ (node),
							path.at(-1),
						);
					}

					// The parser puts an element's children before its opening tag, and
					// a tag's attributes before its name, so visit them in source order:
					// the comments in the attributes are taken before the ones in the
					// children, which would otherwise wait behind them and reach the
					// closing tag
					const element = /** @type {AST.TSRXElementNode} */ (node);
					const tag = /** @type {ESTreeJSX.JSXOpeningElement} */ (node);
					if (
						(node.type === 'JSXElement' || node.type === 'JSXStyleElement') &&
						element.openingElement &&
						Array.isArray(element.children)
					) {
						visit(element.openingElement);
						for (const child of element.children) {
							visit(child);
						}
						if (element.closingElement) {
							visit(element.closingElement);
						}
					} else if (node.type === 'JSXOpeningElement' && tag.name) {
						visit(tag.name);
						const typeArguments = /** @type {any} */ (tag).typeArguments;
						if (typeArguments) {
							visit(typeArguments);
						}
						for (const attribute of tag.attributes) {
							visit(attribute);
						}
					} else {
						const children = comments[0] ? getChildrenInSourceOrder(node) : null;
						if (children) {
							for (const child of children) {
								visit(child);
							}
						} else {
							next();
						}
					}

					if (comments[0]) {
						if (node.type === 'Program' && hasOnlyEmptyStatements(node.body)) {
							// Collect all comments in an empty program (file with only comments)
							while (comments.length) {
								const comment = /** @type {AST.CommentWithLocation} */ (comments.shift());
								(node.innerComments ||= []).push(comment);
							}
							if (node.innerComments && node.innerComments.length > 0) {
								return;
							}
						}
						if (
							((node.type === 'BlockStatement' ||
								node.type === 'StaticBlock' ||
								node.type === 'TSModuleBlock') &&
								hasOnlyEmptyStatements(node.body)) ||
							((node.type === 'TSInterfaceBody' || node.type === 'ClassBody') &&
								node.body.length === 0) ||
							(node.type === 'SwitchStatement' && node.cases.length === 0) ||
							((node.type === 'TSTypeLiteral' || node.type === 'TSEnumDeclaration') &&
								node.members.length === 0)
						) {
							// Collect all comments that fall within this empty block or member list
							while (
								comments[0] &&
								comments[0].start < /** @type {AST.NodeWithLocation} */ (node).end &&
								comments[0].end < /** @type {AST.NodeWithLocation} */ (node).end
							) {
								const comment = /** @type {AST.CommentWithLocation} */ (comments.shift());
								(node.innerComments ||= []).push(comment);
							}
							if (node.innerComments && node.innerComments.length > 0) {
								return;
							}
						}
						// Like Prettier, comments in an empty array or object stay inside
						// its brackets
						if (
							((node.type === 'ArrayExpression' || node.type === 'ArrayPattern') &&
								node.elements.length === 0) ||
							((node.type === 'ObjectExpression' || node.type === 'ObjectPattern') &&
								node.properties.length === 0)
						) {
							while (
								comments[0] &&
								comments[0].start > /** @type {AST.NodeWithLocation} */ (node).start &&
								comments[0].end < /** @type {AST.NodeWithLocation} */ (node).end
							) {
								pushInnerComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
							}
							if (hasInnerComments(node)) {
								return;
							}
						}
						// Like Prettier, the comments in the parentheses of a call with no
						// arguments dangle on the call: `run(/* none */)`
						if (
							(node.type === 'CallExpression' || node.type === 'NewExpression') &&
							node.arguments.length === 0
						) {
							const end = /** @type {AST.NodeWithLocation} */ (node).end;
							const open = findOutsideComments(
								'(',
								/** @type {AST.NodeWithLocation} */ (node.typeArguments ?? node.callee).end,
								end,
							);
							while (comments[0] && comments[0].start > open && comments[0].end < end) {
								pushInnerComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
							}
							if (comments.length === 0) {
								return;
							}
						}
						// Like Prettier, the comments between a fragment's `<` and `>`, or
						// its `</` and `>`, dangle on that tag: `</* note */>`, `</ /* note */>`
						if (node.type === 'JSXOpeningFragment' || node.type === 'JSXClosingFragment') {
							while (
								comments[0] &&
								comments[0].start > /** @type {AST.NodeWithLocation} */ (node).start &&
								comments[0].end < /** @type {AST.NodeWithLocation} */ (node).end
							) {
								pushInnerComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
							}
							if (comments.length === 0) {
								return;
							}
						}
						// The comments after an opening tag's `>` are in the element's body,
						// where a child or the closing tag takes them, even on the tag's line
						// (`<div>/* note */ text`)
						if (
							((node.type === 'JSXOpeningElement' && !node.selfClosing) ||
								node.type === 'JSXOpeningFragment') &&
							comments[0].start >= /** @type {AST.NodeWithLocation} */ (node).end
						) {
							return;
						}
						// A comment in JSX text (`text /* note */ more`) lies inside the text
						// node, which the parser keeps whole around it, so no child starts
						// after it. It dangles on the text, which prints it in place, even
						// on the line of the child before (`{a} /* note */ text`), unless
						// that child is a JSX space (`{" "}`), which keeps it and so prints
						// as written. Text of only whitespace leaves its comments to the
						// children around it, and so does text for a `prettier-ignore`
						// after its last word (see `isCommentInText`).
						const jsxParent = /** @type {AST.Node | undefined} */ (path.at(-1));
						if (
							(jsxParent?.type === 'JSXElement' || jsxParent?.type === 'JSXFragment') &&
							!isJSXSpace(node)
						) {
							const siblings = /** @type {AST.Node[]} */ (jsxParent.children);
							const next = siblings[siblings.indexOf(/** @type {AST.Node} */ (node)) + 1];
							if (isCommentInText(comments[0], next)) {
								return;
							}
						}
						while (comments[0] && isCommentInText(comments[0], node)) {
							pushInnerComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
						}
						if (comments.length === 0) {
							return;
						}
						// Handle JSXEmptyExpression - these represent {/* comment */} in JSX
						if (node.type === 'JSXEmptyExpression') {
							// Collect all comments that fall within this JSXEmptyExpression
							while (
								comments[0] &&
								comments[0].start >= /** @type {AST.NodeWithLocation} */ (node).start &&
								comments[0].end <= /** @type {AST.NodeWithLocation} */ (node).end
							) {
								const comment = /** @type {AST.CommentWithLocation} */ (comments.shift());
								(node.innerComments ||= []).push(comment);
							}
							if (node.innerComments && node.innerComments.length > 0) {
								return;
							}
						}
						// Handle empty template nodes the same way as empty BlockStatements
						if (isEmptyTemplateNode(node)) {
							// Collect all comments that fall within this empty element
							while (
								comments[0] &&
								comments[0].start < /** @type {AST.NodeWithLocation} */ (node).end &&
								comments[0].end < /** @type {AST.NodeWithLocation} */ (node).end
							) {
								const comment = /** @type {AST.CommentWithLocation} */ (comments.shift());
								pushInnerComment(node, comment);
							}
							if (hasInnerComments(node)) {
								return;
							}
						}

						// Trailing comments after the last statement/render inside a `@{ … }`
						// code block (before its `}`) have no following node to attach to and
						// would otherwise be claimed by the enclosing element's closing tag.
						// Claim them here as the block's inner comments.
						if (node.type === 'JSXCodeBlock') {
							while (
								comments[0] &&
								comments[0].start >= /** @type {AST.NodeWithLocation} */ (node).start &&
								comments[0].start < /** @type {AST.NodeWithLocation} */ (node).end
							) {
								pushInnerComment(node, /** @type {AST.CommentWithLocation} */ (comments.shift()));
							}
							if (comments.length === 0) {
								return;
							}
						}

						// Like Prettier, a comment inside this node after all its children,
						// which none of them took, trails the last of them, as `// why` in
						// `!(\n (a || b) // why\n)` trails `a || b`. It doesn't move out of
						// the node to the next one. A statement that Prettier ends before
						// its `;` doesn't hold the comments right before that `;`.
						if (!keepsCommentsAfterChildren(node)) {
							const nodeEnd = /** @type {AST.NodeWithLocation} */ (node).end;
							const semicolon =
								statementsEndingBeforeSemicolon.has(node.type) && source[nodeEnd - 1] === ';'
									? nodeEnd - 1
									: -1;
							while (comments[0] && comments[0].end <= nodeEnd) {
								if (semicolon >= 0 && isBlankBetween(comments[0].end, semicolon, false)) break;
								const neighbors = getCommentNeighbors(comments[0], node);
								if (!neighbors?.preceding || neighbors.following) break;
								addTrailingComment(
									neighbors.preceding,
									/** @type {AST.CommentWithLocation} */ (comments.shift()),
								);
							}
							if (comments.length === 0) {
								return;
							}
						}

						// Like the expression of a `ParenthesizedExpression`, which Prettier's
						// `babel` parser keeps for a JSDoc cast, a cast node trails the
						// comments after it inside its cast's parentheses, even the ones
						// after the last node it ends with (`(await foo /* c */)`). None of
						// them moves to the statement's `;` or the class body after them.
						const nodeEnd = /** @type {AST.NodeWithLocation} */ (node).end;
						let castNode = /** @type {AST.Node & AST.NodeWithLocation} */ (node);
						let castEnd = getTypeCastEnd(castNode);
						for (
							let i = path.length - 1;
							castEnd < 0 &&
							i >= 0 &&
							/** @type {AST.NodeWithLocation} */ (path[i]).end === nodeEnd;
							i--
						) {
							castNode = /** @type {AST.Node & AST.NodeWithLocation} */ (path[i]);
							castEnd = getTypeCastEnd(castNode);
						}
						while (comments[0] && comments[0].start >= nodeEnd && comments[0].end <= castEnd) {
							addTrailingComment(
								castNode,
								/** @type {AST.CommentWithLocation} */ (comments.shift()),
							);
						}
						if (comments.length === 0) {
							return;
						}

						const parent = /** @type {AST.Node & AST.NodeWithLocation} */ (path.at(-1));

						// Like Prettier, whose `canAttachComment` rejects a template literal's
						// text, the comments after an expression in its `${…}` trail it. In a
						// template literal type, which Prettier doesn't keep to its `${…}`
						// (`findExpressionIndexForComment` checks `TemplateLiteral` only), an
						// own-line one leads the next type instead, if there is one.
						if (parent?.type === 'TemplateLiteral') {
							const index = parent.expressions.indexOf(/** @type {any} */ (node));
							if (index >= 0) {
								const nextQuasi = /** @type {AST.NodeWithLocation} */ (parent.quasis[index + 1]);
								const nextType =
									path.at(-2)?.type === 'TSLiteralType' ? parent.expressions[index + 1] : null;
								while (
									comments[0] &&
									comments[0].end <= nextQuasi.start &&
									!(nextType && isOwnLineComment(comments[0]))
								) {
									addTrailingComment(
										/** @type {AST.Node} */ (node),
										/** @type {AST.CommentWithLocation} */ (comments.shift()),
									);
								}
								if (comments.length === 0) {
									return;
								}
							}
						}

						// Prettier's handlers for the comments between this node and the
						// next child of its parent, and then its tie-break for the ones
						// with code on both sides, which run before the rules below. The
						// first comment they leave stops them, so that the comments a node
						// takes stay in source order.
						while (comments[0]) {
							const neighbors = getCommentNeighbors(comments[0], parent);
							if (neighbors?.preceding !== node) {
								break;
							}
							if (
								isHandledEnclosingNode(parent) &&
								handleComment(comments[0], parent, node, neighbors.following, path.at(-2))
							) {
								comments.shift();
								continue;
							}
							const ties = breakTies(node, parent, neighbors.following);
							if (ties === 'lead') {
								return;
							}
							if (ties === 'none') {
								break;
							}
						}
						if (comments.length === 0) {
							return;
						}

						// Like Prettier, which ends a statement before its `;`, the comments
						// between the two, as in `if (a) return b // note` with the `;` on the
						// next line, trail the outermost statement that ends at that `;`, so
						// they print after it. In a statement that is only its keyword, like
						// `continue // note`, they lie in the statement itself.
						if (
							(nodeEnd <= comments[0].start ||
								getKeywordOnlyStatementEnd(/** @type {AST.NodeWithLocation} */ (node)) >= 0) &&
							takeCommentsBeforeFinalSemicolon(/** @type {AST.NodeWithLocation} */ (node), path)
						) {
							return;
						}

						// Like Prettier's `handleIfStatementComments`, a comment between an
						// `if` body and `else` trails an unbraced body when it's a one-line
						// comment on the body's line, and otherwise dangles on the `if`
						// statement, which prints it before `else`
						const ifStatement = /** @type {any} */ (parent);
						if (
							ifStatement &&
							(ifStatement.statementType ?? ifStatement.type) === 'IfStatement' &&
							ifStatement.alternate &&
							ifStatement.consequent === node
						) {
							const nodeEnd = /** @type {AST.NodeWithLocation} */ (node).end;
							const elseStart = findOutsideComments(
								'else',
								nodeEnd,
								/** @type {AST.NodeWithLocation} */ (ifStatement.alternate).start,
							);
							while (comments[0] && comments[0].end <= elseStart) {
								const comment = /** @type {AST.CommentWithLocation} */ (comments.shift());
								if (
									node.type !== 'BlockStatement' &&
									!source.slice(nodeEnd, comment.end).includes('\n')
								) {
									(node.trailingComments ||= []).push(comment);
								} else {
									pushInnerComment(ifStatement, comment);
								}
							}
							return;
						}

						// A node that ends where its parent does leaves the comments to the
						// parent, except the last statement of a file that ends right after
						// it: the program keeps no comments after its statements, so the
						// statement takes them, as it does when a line break follows it
						// (`const x = 1` / `// c` / `;`)
						if (parent === undefined || node.end !== parent.end || parent.type === 'Program') {
							// Check if this node is the last item in an array-like structure
							let is_last_in_array = false;
							/** @type {(AST.Node | null)[] | null} */
							let node_array = null;
							let isParam = false;
							let isArgument = false;
							let isSwitchCaseSibling = false;
							let isCodeBlockChild = false;

							if (parent) {
								if (
									parent.type === 'BlockStatement' ||
									parent.type === 'Program' ||
									parent.type === 'ClassBody' ||
									parent.type === 'StaticBlock' ||
									parent.type === 'TSModuleBlock' ||
									parent.type === 'TSInterfaceBody'
								) {
									node_array = parent.body;
								} else if (parent.type === 'JSXCodeBlock') {
									// The render output is the sibling after the setup statements.
									// Comments after the last node stay for the code block, which
									// keeps them as inner comments.
									node_array = parent.render ? [...parent.body, parent.render] : parent.body;
									isCodeBlockChild = true;
								} else if (parent.type === 'SwitchStatement') {
									// The discriminant isn't a case. With no cases, it would count
									// as the last one and take the body's comments.
									if (node !== parent.discriminant) {
										node_array = parent.cases;
										isSwitchCaseSibling = true;
									}
								} else if (parent.type === 'SwitchCase') {
									node_array = parent.consequent;
								} else if (parent.type === 'ArrayExpression') {
									node_array = parent.elements;
								} else if (parent.type === 'ObjectExpression') {
									node_array = parent.properties;
								} else if (parent.type === 'ObjectPattern') {
									node_array = parent.properties;
								} else if (parent.type === 'TSTypeLiteral') {
									node_array = parent.members;
								} else if (
									parent.type === 'TSTypeParameterInstantiation' ||
									parent.type === 'TSTypeParameterDeclaration'
								) {
									node_array = parent.params;
								} else if (parent.type === 'TSTupleType') {
									node_array = parent.elementTypes;
								} else if (parent.type === 'TSEnumDeclaration') {
									// The enum's name is not a member. With no members, it would
									// count as the last one and take the body's comments.
									if (node !== parent.id) {
										node_array = parent.members;
									}
								} else if (getSignatureParameters(parent)) {
									// The function's name, type parameters, and return type
									// aren't parameters. Like Prettier, a comment after the name
									// trails it.
									const params = /** @type {AST.Node[]} */ (getSignatureParameters(parent));
									if (params.includes(node)) {
										node_array = params;
										isParam = true;
									}
								} else if (
									parent.type === 'JSXOpeningElement' &&
									parent.attributes.includes(/** @type {any} */ (node))
								) {
									// A comment after the last attribute, before `>`, trails it
									node_array = parent.attributes;
								} else if (parent.type === 'CallExpression' || parent.type === 'NewExpression') {
									node_array = parent.arguments;
									isArgument = true;
								} else if (
									(parent.type === 'ImportDeclaration' ||
										parent.type === 'ExportNamedDeclaration') &&
									parent.specifiers.includes(/** @type {any} */ (node))
								) {
									// A comment after the last specifier, before `}` or `from`,
									// trails that specifier, as it does after the last element
									// of an array or object
									node_array = parent.specifiers;
								}
							}

							/** @type {AST.NodeWithLocation} */
							let end_node = /** @type {AST.NodeWithLocation} */ (node);
							let next_index = -1;

							if (node_array && Array.isArray(node_array)) {
								// Empty statements take no comments, so look past them: the next
								// sibling is the next real one, and the `;` of any before the
								// comment ends this node, as in `a; ; // comment`
								next_index = node_array.indexOf(node) + 1;
								while (next_index > 0 && node_array[next_index]?.type === 'EmptyStatement') {
									const empty = /** @type {AST.NodeWithLocation} */ (node_array[next_index]);
									if (empty.end <= comments[0].start) {
										end_node = empty;
									}
									next_index++;
								}
								// The callee isn't an argument, even when there are none
								is_last_in_array =
									!isCodeBlockChild &&
									next_index >= node_array.length &&
									!(isArgument && next_index === 0);
							}

							// A stray `;` in a class body isn't a node. Like an empty statement
							// in a statement list, the last one before the comment ends this
							// member, as in `a = 1; ; // comment`
							if (parent?.type === 'ClassBody') {
								const semicolons = /^[\s;]*;/.exec(source.slice(end_node.end, comments[0].start));
								if (semicolons) {
									const end = end_node.end + semicolons[0].length;
									end_node = {
										start: end - 1,
										end,
										loc: {
											start: acorn.getLineInfo(source, end - 1),
											end: acorn.getLineInfo(source, end),
										},
									};
								}
							}

							const nextSibling = node_array?.[next_index];

							const slice = source.slice(end_node.end, comments[0].start);

							// A typed pattern's comments between its `}` and the `:` lead the
							// type annotation, like Prettier: `{ a } /* c */ : T`
							const trailingCommentBoundary =
								parent &&
								parent.type === 'ObjectPattern' &&
								parent.typeAnnotation &&
								parent.typeAnnotation.start !== undefined
									? findOutsideComments(
											'}',
											/** @type {AST.NodeWithLocation} */ (node).end,
											parent.typeAnnotation.start,
										)
									: parent &&
										  (parent.type === 'ImportDeclaration' ||
												parent.type === 'ExportNamedDeclaration') &&
										  parent.source
										? findOutsideComments(
												'from',
												/** @type {AST.NodeWithLocation} */ (node).end,
												/** @type {AST.NodeWithLocation} */ (parent.source).start,
											)
										: isParam
											? // An arrow's lone parameter without parentheses ends the list
												(getParameterParens(
													/** @type {AST.FunctionDeclaration} */ (/** @type {unknown} */ (parent)),
												)?.close ?? /** @type {AST.NodeWithLocation} */ (node).end)
											: parent?.end;

							if (is_last_in_array) {
								if (isParam || isArgument) {
									while (comments.length) {
										const potentialComment = comments[0];
										if (
											trailingCommentBoundary !== undefined &&
											potentialComment.start >= trailingCommentBoundary
										) {
											break;
										}

										const maybeInner = getEmptyElementInnerCommentTarget(potentialComment);
										if (maybeInner) {
											pushInnerComment(
												maybeInner,
												/** @type {AST.CommentWithLocation} */ (comments.shift()),
											);
											continue;
										}

										// Like Prettier, the comments before the `)` all trail the last
										// one, even with other comments or a trailing comma between
										// (`f(a, b /* c */ /* d */)`, `f(a, b /* c */,)`)
										const nextChar = getNextNonSpaceNonCommentCharacter(potentialComment.end);
										if (
											nextChar === ')' ||
											(nextChar === ',' &&
												getNextNonSpaceNonCommentCharacter(
													findOutsideComments(',', potentialComment.end, source.length) + 1,
												) === ')')
										) {
											(node.trailingComments ||= []).push(
												/** @type {AST.CommentWithLocation} */ (comments.shift()),
											);
											continue;
										}

										break;
									}
								} else {
									// Special case: There can be multiple trailing comments after the last node in a block,
									// and they can be separated by newlines
									while (comments.length) {
										const comment = comments[0];
										if (
											trailingCommentBoundary !== undefined &&
											comment.start >= trailingCommentBoundary
										) {
											break;
										}

										const maybeInner = getEmptyElementInnerCommentTarget(comment);
										if (maybeInner) {
											pushInnerComment(
												maybeInner,
												/** @type {AST.CommentWithLocation} */ (comments.shift()),
											);
											continue;
										}

										(node.trailingComments ||= []).push(comment);
										comments.shift();
									}
								}
							} else if (/** @type {AST.NodeWithLocation} */ (node).end <= comments[0].start) {
								const maybeInner = getEmptyElementInnerCommentTarget(
									/** @type {AST.CommentWithLocation} */ (comments[0]),
								);
								if (maybeInner) {
									pushInnerComment(
										maybeInner,
										/** @type {AST.CommentWithLocation} */ (comments.shift()),
									);
									return;
								}

								// A `)` that closes a statement header, as in `if (a) /* c */ b();`,
								// ends the header: like Prettier, a comment after it leads the body,
								// unless another `)` follows it (`if ((a) /* c */) b();`)
								const isAfterStatementHeader =
									slice.includes(')') &&
									endsStatementHeader(node, parent) &&
									getNextNonSpaceNonCommentCharacter(comments[0].end) !== ')';
								// A comment after the `)` that ends the parent, as in
								// `const x = (a >> 6) // c` without a `;`, lies outside the
								// parent, so this node isn't the one before it. Like
								// Prettier, an ancestor that ends before it takes it.
								const isAfterParent = !!parent && parent.end <= comments[0].start;
								// The `{` of an import's named specifiers may follow its default
								// one, and a comment after it still trails that one, as Prettier
								// does with a comment at the end of the line: `import d, { // c`
								const opensNamedSpecifiers =
									parent?.type === 'ImportDeclaration' &&
									node.type !== 'ImportSpecifier' &&
									nextSibling?.type === 'ImportSpecifier';
								const onlySimpleWhitespace =
									!isAfterStatementHeader &&
									!isAfterParent &&
									(opensNamedSpecifiers ? /^[,{ \t]*$/ : /^[,) \t]*$/).test(slice);
								const onlyWhitespace = /^\s*$/.test(slice);
								const hasBlankLine = /\n\s*\n/.test(slice);
								const nodeEndLine = end_node.loc?.end?.line ?? null;
								const commentStartLine = comments[0].loc?.start?.line ?? null;
								const commentOnSameLine =
									nodeEndLine !== null &&
									commentStartLine !== null &&
									nodeEndLine === commentStartLine;
								const isImmediateNextLine =
									nodeEndLine !== null &&
									commentStartLine !== null &&
									commentStartLine === nodeEndLine + 1;

								// Like Prettier, the comments that follow a node on its line all
								// trail it, except a block comment on the next sibling's line
								const takeSameLineComments = () => {
									const trailing = [/** @type {AST.CommentWithLocation} */ (comments.shift())];
									while (
										comments[0] &&
										comments[0].loc?.start.line === nodeEndLine &&
										/^[ \t]*$/.test(
											source.slice(trailing[trailing.length - 1].end, comments[0].start),
										) &&
										!(
											comments[0].type === 'Block' &&
											nextSibling?.loc &&
											comments[0].loc.end.line === nextSibling.loc.start.line
										)
									) {
										trailing.push(/** @type {AST.CommentWithLocation} */ (comments.shift()));
									}
									(node.trailingComments ||= []).push(...trailing);
								};

								if (isSwitchCaseSibling && !is_last_in_array) {
									if (
										nodeEndLine !== null &&
										commentStartLine !== null &&
										nodeEndLine === commentStartLine
									) {
										takeSameLineComments();
									}
									return;
								}

								// In a comma-separated list, the comments before the comma trail
								// the element and the ones after it lead the next element, as in
								// Prettier: `[a /* a */, /* b */ b]`
								const isCommaList =
									isParam ||
									isArgument ||
									parent?.type === 'ArrayExpression' ||
									parent?.type === 'ObjectExpression' ||
									parent?.type === 'ObjectPattern' ||
									parent?.type === 'TSEnumDeclaration' ||
									parent?.type === 'TSTypeParameterInstantiation' ||
									parent?.type === 'TSTypeParameterDeclaration' ||
									parent?.type === 'TSTupleType' ||
									parent?.type === 'ImportDeclaration' ||
									parent?.type === 'ExportNamedDeclaration';
								// `next_index` is 0 for a callee or a function's name, which aren't
								// in the list
								if (isCommaList && next_index > 0 && !is_last_in_array && nextSibling) {
									const nextStart = /** @type {AST.NodeWithLocation} */ (nextSibling).start;
									const comma = findOutsideComments(',', end_node.end, nextStart);
									// Without a comma there's nothing to measure against, so the
									// usual rules decide
									if (comma < nextStart && comments[0].start < comma) {
										while (comments[0] && comments[0].start < comma) {
											(node.trailingComments ||= []).push(
												/** @type {AST.CommentWithLocation} */ (comments.shift()),
											);
										}
										return;
									}
								}

								if (
									onlySimpleWhitespace ||
									(onlyWhitespace && !hasBlankLine && isImmediateNextLine)
								) {
									// Check if this is a block comment that's inline with the next statement
									// e.g., /** @type {SomeType} */ (a) = 5;
									// These should be leading comments, not trailing
									if (comments[0].type === 'Block' && !is_last_in_array && node_array) {
										if (nextSibling && nextSibling.loc) {
											const commentEndLine = comments[0].loc?.end?.line;
											const nextSiblingStartLine = nextSibling.loc?.start?.line;

											// If comment ends on same line as next sibling starts, it's inline with next.
											// A JSDoc type cast keeps to the parentheses it casts on any line.
											if (
												commentEndLine === nextSiblingStartLine ||
												(isTypeCastComment(comments[0]) &&
													getNextNonSpaceNonCommentCharacter(comments[0].end) === '(')
											) {
												// Leave it for next sibling's leading comments
												return;
											}
										}
									}

									// For function parameters, only attach as trailing comment if it's on the same line
									// Comments on next line after comma should be leading comments of next parameter
									if (isParam) {
										if (commentOnSameLine) {
											(node.trailingComments ||= []).push(
												/** @type {AST.CommentWithLocation} */ (comments.shift()),
											);
										}
										// Otherwise leave it for next parameter's leading comments
									} else {
										// Line comments on the next line should be leading comments
										// for the next statement, not trailing comments for this one.
										// Only attach as trailing if:
										// 1. It's on the same line as this node, OR
										// 2. This is the last item in the array (no next sibling to attach to)
										if (commentOnSameLine) {
											takeSameLineComments();
										} else if (is_last_in_array) {
											(node.trailingComments ||= []).push(
												/** @type {AST.CommentWithLocation} */ (comments.shift()),
											);
										}
										// Otherwise leave it for next sibling's leading comments
									}
								} else if (hasBlankLine && onlyWhitespace && node_array) {
									// When there's a blank line between node and comment(s),
									// check if there's also a blank line after the comment(s) before the next node
									// If so, attach comments as trailing to preserve the grouping
									// Only do this for statement-level contexts (blocks, Program),
									// not for JSX element children or other contexts
									const isStatementContext =
										parent.type === 'BlockStatement' ||
										parent.type === 'Program' ||
										parent.type === 'StaticBlock' ||
										parent.type === 'TSModuleBlock';

									if (!isStatementContext) {
										return;
									}

									if (nextSibling && nextSibling.loc) {
										// Find where the comment block ends
										let lastCommentIndex = 0;
										let lastCommentEnd = comments[0].end;

										// Collect consecutive comments (without blank lines between them)
										while (comments[lastCommentIndex + 1]) {
											const currentComment = comments[lastCommentIndex];
											const nextComment = comments[lastCommentIndex + 1];
											const sliceBetween = source.slice(currentComment.end, nextComment.start);

											// If there's a blank line, stop
											if (/\n\s*\n/.test(sliceBetween)) {
												break;
											}

											lastCommentIndex++;
											lastCommentEnd = nextComment.end;
										}

										// Check if there's a blank line after the last comment and before next sibling
										const sliceAfterComments = source.slice(lastCommentEnd, nextSibling.start);
										const hasBlankLineAfter = /\n\s*\n/.test(sliceAfterComments);

										if (hasBlankLineAfter) {
											// Don't attach comments as trailing if they are inside the next template node.
											const nextIsElement = isNativeTemplateNode(nextSibling);
											const commentsInsideElement =
												nextIsElement &&
												nextSibling.loc &&
												comments.some((c) => {
													if (!c.loc) return false;
													// Check if comment is on a line between the JSX element's start and end lines
													return (
														c.loc.start.line >= nextSibling.loc.start.line &&
														c.loc.end.line <= nextSibling.loc.end.line
													);
												});

											if (!commentsInsideElement) {
												// Attach all the comments as trailing
												for (let i = 0; i <= lastCommentIndex; i++) {
													(node.trailingComments ||= []).push(
														/** @type {AST.CommentWithLocation} */ (comments.shift()),
													);
												}
											}
										}
									}
								}
							}
						}
					}
				},
			});
		},
	};
}

// Re-export acorn utilities that plugins may need
export { acorn, tsPlugin };
