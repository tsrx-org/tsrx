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
				ecmaVersion: 13,
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
	 * @param {string} text
	 * @param {number} startIndex
	 * @returns {string | null}
	 */
	function getNextNonWhitespaceCharacter(text, startIndex) {
		for (let i = startIndex; i < text.length; i++) {
			const char = text[i];
			if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
				return char;
			}
		}
		return null;
	}

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
	 * Like Prettier's `getNextNonSpaceNonCommentCharacter`: the first character
	 * from `start` on that isn't whitespace or inside a comment.
	 * @param {number} start
	 * @returns {string | null}
	 */
	function getNextNonSpaceNonCommentCharacter(start) {
		for (let i = start; i < source.length; i++) {
			if (source.startsWith('/*', i)) {
				const end = source.indexOf('*/', i + 2);
				if (end === -1) return null;
				i = end + 1;
			} else if (source.startsWith('//', i)) {
				const newline = source.indexOf('\n', i);
				if (newline === -1) return null;
				i = newline;
			} else if (!/\s/.test(source[i])) {
				return source[i];
			}
		}
		return null;
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
			!/^[ \t)]*$/.test(source.slice(node.end, comments[0].start))
		) {
			return false;
		}
		if (!isBlankBetween(comments[0].end, statement.end - 1, false)) {
			// Only the parentheses around the statement's value may close after
			// the comment. Any other pair, like the one in `x = !(a /* c */);`,
			// stays, and so does the comment inside it.
			const value = getParenthesizedStatementValue(statement);
			if (
				!value ||
				value.end !== node.end ||
				(value !== node && !path.includes(value)) ||
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
		let previousEnd = node.end;
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
	 * The value of a statement, like the argument of `return (a)` or the right
	 * side of `x = (a)`, when it's written in parentheses that print as
	 * nothing (see {@link valuesPrintedWithoutParens}).
	 * @param {AST.Node} statement
	 * @returns {(AST.Node & AST.NodeWithLocation) | null}
	 */
	function getParenthesizedStatementValue(statement) {
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
		return (
			candidates.find(
				(candidate) =>
					candidate?.metadata?.parenthesized && valuesPrintedWithoutParens.has(candidate.type),
			) ?? null
		);
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
	 * The positions of the parentheses around a function's parameters, or null
	 * for an arrow function's lone unparenthesized parameter.
	 * @param {AST.FunctionDeclaration | AST.FunctionExpression | AST.ArrowFunctionExpression} fn
	 * @returns {{ open: number, close: number } | null}
	 */
	function getParameterParens(fn) {
		const node = /** @type {any} */ (fn);
		const end = /** @type {AST.NodeWithLocation} */ (node.returnType ?? node.body).start;
		const lastParam = /** @type {AST.NodeWithLocation | undefined} */ (node.params.at(-1));
		const firstParam = /** @type {AST.NodeWithLocation | undefined} */ (node.params[0]);
		const from = /** @type {AST.NodeWithLocation | undefined} */ (node.typeParameters ?? node.id)
			?.end;
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
							// we would definitely reach the attribute first before getting to the element
							if (ancestor.type === 'JSXAttribute') {
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
					// its comments.
					const emptyParent = path.at(-1);
					if (node.type === 'EmptyStatement' && isListEntry(node, emptyParent)) {
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

					while (
						comments[0] &&
						comments[0].start < /** @type {AST.NodeWithLocation} */ (node).start
					) {
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
						next();
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

						const parent = /** @type {AST.Node & AST.NodeWithLocation} */ (path.at(-1));

						// Like Prettier, which ends a statement before its `;`, the comments
						// between the two, as in `if (a) return b // note` with the `;` on the
						// next line, trail the outermost statement that ends at that `;`, so
						// they print after it
						if (
							/** @type {AST.NodeWithLocation} */ (node).end <= comments[0].start &&
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

						if (parent === undefined || node.end !== parent.end) {
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
								} else if (parent.type === 'TSEnumDeclaration') {
									// The enum's name is not a member. With no members, it would
									// count as the last one and take the body's comments.
									if (node !== parent.id) {
										node_array = parent.members;
									}
								} else if (isFunctionNode(parent)) {
									// The function's name, type parameters, and return type
									// aren't parameters. Like Prettier, a comment after the name
									// trails it.
									if (parent.params.includes(/** @type {any} */ (node))) {
										node_array = parent.params;
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

							const trailingCommentBoundary =
								parent &&
								parent.type === 'ObjectPattern' &&
								parent.typeAnnotation &&
								parent.typeAnnotation.start !== undefined
									? parent.typeAnnotation.start
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

										const nextChar = getNextNonWhitespaceCharacter(source, potentialComment.end);
										if (nextChar === ')') {
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
								const onlySimpleWhitespace = !isAfterStatementHeader && /^[,) \t]*$/.test(slice);
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

											// If comment ends on same line as next sibling starts, it's inline with next
											if (commentEndLine === nextSiblingStartLine) {
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
