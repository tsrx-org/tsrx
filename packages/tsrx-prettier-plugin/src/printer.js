/**
 * @import { AstPath, Doc, ParserOptions, Printer } from 'prettier'
 * @import { Node } from './parse.js'
 */

import { builders, utils } from 'prettier/doc';
import * as estreePlugin from 'prettier/plugins/estree';
import * as standalone from 'prettier/standalone';
import { printJsxElementInternal } from './jsx.js';
import { TSRX_DIRECTIVES, isRawScriptElement } from './parse.js';

const { breakParent, group, hardline, ifBreak, indent, join, line, lineSuffix, softline } =
	builders;
const { replaceEndOfLine } = utils;
// Prettier's text and comment helpers. `prettier/standalone` exports the same
// `util` as `prettier` and loads in the browser too; only its types leave
// `util` out.
const {
	addDanglingComment,
	hasNewline,
	isNextLineEmpty,
	isPreviousLineEmpty,
	skipNewline,
	skipSpaces,
} = /** @type {{ util: typeof import('prettier').util }} */ (/** @type {unknown} */ (standalone))
	.util;

/**
 * Prettier's own JS/TS printer. Everything that isn't TSRX syntax is printed by
 * it unchanged.
 * @type {Printer<Node>}
 */
const estree = /** @type {Printer<Node>} */ (estreePlugin.printers.estree);

/**
 * @typedef {(selector?: string | number | Array<string | number> | AstPath) => Doc} Print
 */

/** @type {WeakMap<object, object>} */
const typescriptOptions = new WeakMap();

/**
 * The options as Prettier's printer sees them for its own `typescript` parser.
 * The printer checks the parser's name in a few places, such as keeping the
 * quotes of a class property's key, and the TSRX AST has the typescript-estree
 * shape.
 * @template {object} T
 * @param {T} options
 * @returns {T}
 */
function asTypeScript(options) {
	let result = typescriptOptions.get(options);
	if (!result) {
		result = { ...options, parser: 'typescript' };
		typescriptOptions.set(options, result);
	}
	return /** @type {T} */ (result);
}

/** Child keys of the TSRX nodes, which Prettier's visitor keys don't know. */
const TSRX_VISITOR_KEYS = /** @type {Record<string, string[]>} */ ({
	JSXIfExpression: ['test', 'consequent', 'alternate'],
	JSXForExpression: ['init', 'test', 'update', 'left', 'right', 'index', 'key', 'body', 'empty'],
	JSXSwitchExpression: ['discriminant', 'cases'],
	JSXTryExpression: ['block', 'pending', 'handler'],
	TSRXRangeText: [],
});

/** `@catch (error, reset)` has a second parameter. */
const CATCH_CLAUSE_KEYS = ['param', 'resetParam', 'body'];

/**
 * A shorthand attribute (`{name}`) prints only its value: its `name` is the
 * same identifier as the value's expression, so no comment may attach to it.
 */
const SHORTHAND_ATTRIBUTE_KEYS = ['value'];

/**
 * Directives whose comments Prettier places as in the statements they're
 * written like: a comment before `@else` or `@catch` stays after the `}` (a
 * line comment before `@catch` moves into its body), and one before a body's
 * `{` moves into the body.
 */
const COMMENT_STATEMENT_DIRECTIVES = new Set([
	'JSXForExpression',
	'JSXIfExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
]);

/**
 * One of Prettier's comment handlers, run while a directive enclosing the
 * comment presents itself as its statement.
 * @param {((context: any) => boolean) | undefined} handle
 * @returns {((context: any) => boolean) | undefined}
 */
function withDirectivesAsStatements(handle) {
	if (!handle) return handle;
	return (context) => {
		if (handleCommentBeforeEmpty(context)) return true;
		const node = context.enclosingNode;
		if (!COMMENT_STATEMENT_DIRECTIVES.has(node?.tsrxType)) return handle(context);
		return asStatement(node, () => handle(context));
	};
}

/**
 * A comment between a `@for` body and `@empty` stays there, as a comment
 * before `else` does: it becomes a dangling comment of the `@for`, which
 * `printFor` prints before `@empty`.
 * @param {{ comment: Node, precedingNode?: Node, enclosingNode?: Node, followingNode?: Node, text: string }} context
 * @returns {boolean}
 */
function handleCommentBeforeEmpty({ comment, precedingNode, enclosingNode, followingNode, text }) {
	if (
		enclosingNode?.tsrxType !== 'JSXForExpression' ||
		!followingNode ||
		precedingNode !== enclosingNode.body ||
		followingNode !== enclosingNode.empty ||
		!text.slice(comment.end, followingNode.start).includes('@empty')
	) {
		return false;
	}
	addDanglingComment(enclosingNode, comment, undefined);
	return true;
}

const estreeCommentHandlers = /** @type {Record<string, any>} */ (estree.handleComments);

/** @type {Printer<Node>} */
export const printer = {
	...estree,

	handleComments: {
		...estreeCommentHandlers,
		ownLine: withDirectivesAsStatements(estreeCommentHandlers.ownLine),
		endOfLine: withDirectivesAsStatements(estreeCommentHandlers.endOfLine),
		remaining: withDirectivesAsStatements(estreeCommentHandlers.remaining),
	},

	// Prettier's JSX printer prints an element's own comments, and so does this
	// plugin for the elements it prints itself (`printElement`). It also prints
	// the comments of a `@{ … }` value or a directive (inside its parentheses),
	// and of a tag name (`printTagNameComments`).
	/**
	 * @param {AstPath<Node>} path
	 * @param {...unknown} rest
	 */
	willPrintOwnComments(path, ...rest) {
		if (isTsrxValue(path) || isCommentedTagName(path) || isCatchDirective(path)) return true;
		const willPrintOwnComments = /** @type {(...args: unknown[]) => boolean} */ (
			estree.willPrintOwnComments
		);
		return willPrintOwnComments(path, ...rest);
	},

	getVisitorKeys(node, nonTraversableKeys) {
		const keys = TSRX_VISITOR_KEYS[node.tsrxType ?? node.type];
		if (keys) return keys;
		if (node.type === 'CatchClause' && node.resetParam) return CATCH_CLAUSE_KEYS;
		if (node.type === 'JSXAttribute' && node.shorthand) return SHORTHAND_ATTRIBUTE_KEYS;
		return /** @type {NonNullable<Printer<Node>['getVisitorKeys']>} */ (estree.getVisitorKeys)(
			node,
			nonTraversableKeys,
		);
	},

	print(path, options, print, args) {
		// A value that presents itself as a JSX element while its parent prints
		// (`withTsrxValuesAsJsx`) prints itself as what it is.
		const presentedAs = presentedAsJsx.get(path.node);
		if (presentedAs !== undefined) {
			path.node.type = presentedAs;
			try {
				return printNode(path, options, print, args);
			} finally {
				path.node.type = 'JSXElement';
			}
		}
		return printNode(path, options, print, args);
	},

	embed(path, options) {
		const { node } = path;
		// Prettier passes the full options, which `Printer` types loosely.
		const printOptions = /** @type {ParserOptions<Node>} */ (options);

		if (node.tsrxType === 'JSXStyleElement' && !node.openingElement.selfClosing) {
			return async (textToDoc, print) =>
				printRawTextElement(
					path,
					printOptions,
					print,
					node.css?.trim() ? await textToDoc(node.css, { parser: 'css' }) : '',
				);
		}

		if (isRawScriptElement(node)) {
			// A JavaScript or TypeScript body is formatted with this plugin's own
			// parser, so `prettier/standalone` needs no other plugin; any other
			// body (JSON, an import map, a template) is kept as written.
			return async (textToDoc, print) => {
				if (!node.content.trim()) return printRawTextElement(path, printOptions, print, '');
				if (!isCodeScript(node)) return printRawTextAsWritten(path, printOptions, print);
				return printRawTextElement(
					path,
					printOptions,
					print,
					await textToDoc(node.content, { parser: 'tsrx' }),
				);
			};
		}

		return estree.embed?.(path, asTypeScript(options)) ?? null;
	},
};

/**
 * Prettier lays out a JSX element specially where it is assigned, returned,
 * thrown, an arrow's body, or a call's last argument (inside `(` … `)`, with its
 * comments), and checks for JSX by node type. A `@{ … }` value or a directive
 * lays out the same way, so while Prettier prints its parent, it presents
 * itself as a JSX element. So does a directive that is the body of a call's
 * last-argument arrow, which the call checks (`list.map((item) => (` … `))`),
 * and a value on the right of a logical expression, which an assignment checks
 * to keep `a && (` on its line (Prettier's `shouldInlineLogicalExpression`).
 * @template T
 * @param {AstPath<Node>} path
 * @param {() => T} callback
 * @returns {T}
 */
function withTsrxValuesAsJsx(path, callback) {
	const { node } = path;
	if (JSX_LAYOUT_PARENTS.has(node.type)) return callback();

	/** @type {Node[]} */
	const values = [];
	for (const key of Object.keys(node)) {
		if (key === 'comments' || key === 'loc') continue;
		for (const child of [node[key]].flat()) {
			if (isTsrxValueNode(child, node, key)) values.push(child);
			else if (
				child?.type === 'LogicalExpression' &&
				isTsrxValueNode(child.right, child, 'right')
			) {
				values.push(child.right);
			}
		}
	}
	const lastArgument = node.arguments?.at(-1);
	if (
		lastArgument?.type === 'ArrowFunctionExpression' &&
		TSRX_DIRECTIVES.has(lastArgument.body.tsrxType)
	) {
		values.push(lastArgument.body);
	}
	// A value an enclosing node presents already stays presented while it prints.
	for (let i = values.length - 1; i >= 0; i--) {
		if (presentedAsJsx.has(values[i])) values.splice(i, 1);
	}
	if (values.length === 0) return callback();

	for (const value of values) {
		presentedAsJsx.set(value, value.type);
		value.type = 'JSXElement';
	}
	try {
		return callback();
	} finally {
		for (const value of values) {
			value.type = /** @type {string} */ (presentedAsJsx.get(value));
			presentedAsJsx.delete(value);
		}
	}
}

/** Parents whose layout of a TSRX value child isn't JSX-specific. */
const JSX_LAYOUT_PARENTS = new Set([
	'JSXElement',
	'JSXFragment',
	'ExpressionStatement',
	'BlockStatement',
]);

/**
 * `@catch`, whose comments `printTsrx` prints before its `@`.
 * @param {AstPath<Node>} path
 * @returns {boolean}
 */
function isCatchDirective(path) {
	return path.key === 'handler' && path.parent?.tsrxType === 'JSXTryExpression';
}

/**
 * A comment, printed as Prettier prints it, and marked as printed.
 * @param {Node} comment
 * @param {ParserOptions<Node>} options
 * @returns {Doc}
 */
function printCommentNode(comment, options) {
	comment.printed = true;
	return /** @type {NonNullable<Printer<Node>['printComment']>} */ (estree.printComment)(
		/** @type {AstPath<Node>} */ (/** @type {unknown} */ ({ node: comment })),
		options,
	);
}

/**
 * A node's dangling comments, one per line, indented on a line of their own,
 * as Prettier's `printDanglingComments` prints them with `indent` (which
 * plugins can't call).
 * @param {Node} node
 * @param {ParserOptions<Node>} options
 * @returns {Doc}
 */
function printDanglingComments(node, options) {
	const dangling = /** @type {Node[]} */ (node.comments ?? []).filter(
		(comment) => !comment.leading && !comment.trailing,
	);
	if (dangling.length === 0) return '';
	return indent([
		hardline,
		join(
			hardline,
			dangling.map((comment) => printCommentNode(comment, options)),
		),
	]);
}

/**
 * A node's leading and trailing comments around its doc, laid out as Prettier's
 * `printComments` does (which plugins can't call).
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Doc} doc
 * @param {{ afterText?: boolean }} [layout] `afterText`: the first comment is
 *   printed straight after other text, so a line break before it in the source
 *   doesn't count.
 * @returns {Doc}
 */
function printOwnComments(path, options, doc, { afterText = false } = {}) {
	const comments = /** @type {Node[] | undefined} */ (path.node.comments);
	if (!comments?.length) return doc;
	const text = options.originalText;
	const first = comments.find((comment) => comment.leading);
	const printComment = (/** @type {Node} */ comment) => printCommentNode(comment, options);

	/** @type {Doc[]} */
	const leading = [];
	/** @type {Doc[]} */
	const trailing = [];
	/** @type {{ isBlock: boolean, hasLineSuffix: boolean } | undefined} */
	let previous;
	for (const comment of comments) {
		const isBlock = comment.type === 'Block';
		if (comment.leading) {
			leading.push(printComment(comment));
			if (isBlock) {
				leading.push(
					hasNewline(text, comment.end)
						? hasNewline(text, comment.start, { backwards: true }) &&
							!(afterText && comment === first)
							? hardline
							: line
						: ' ',
				);
			} else {
				leading.push(hardline);
			}
			// As Prettier's `printLeadingComment` checks for a blank line after it.
			const next = skipNewline(text, skipSpaces(text, comment.end));
			if (next !== false && hasNewline(text, next)) leading.push(hardline);
		} else if (comment.trailing) {
			const printed = printComment(comment);
			if (
				(previous?.hasLineSuffix && !previous.isBlock) ||
				hasNewline(text, comment.start, { backwards: true })
			) {
				trailing.push(
					lineSuffix([hardline, isPreviousLineEmpty(text, comment.start) ? hardline : '', printed]),
				);
				previous = { isBlock, hasLineSuffix: true };
			} else if (!isBlock || previous?.hasLineSuffix) {
				trailing.push(lineSuffix([' ', printed]), isBlock ? '' : breakParent);
				previous = { isBlock, hasLineSuffix: true };
			} else {
				trailing.push([' ', printed]);
				previous = { isBlock, hasLineSuffix: false };
			}
		}
	}
	return [...leading, doc, ...trailing];
}

/**
 * A directive, or a `@{ … }` block used as a value (not a function's body).
 * @param {AstPath<Node>} path
 * @returns {boolean}
 */
function isTsrxValue(path) {
	return isTsrxValueNode(path.node, path.parent, path.key);
}

/**
 * @param {unknown} node
 * @param {Node | null} parent
 * @param {PropertyKey | null} key
 * @returns {boolean}
 */
function isTsrxValueNode(node, parent, key) {
	if (!node || typeof node !== 'object') return false;
	const { tsrxType, tsrxCodeBlock } = /** @type {Node} */ (node);
	if (TSRX_DIRECTIVES.has(tsrxType)) return true;
	if (!tsrxCodeBlock) return false;
	// A function's `@{ … }` body, and a `@{ … }` that is a statement (a nested
	// template output), aren't values.
	return !(
		(key === 'body' &&
			(parent?.type === 'FunctionDeclaration' ||
				parent?.type === 'FunctionExpression' ||
				parent?.type === 'ArrowFunctionExpression' ||
				parent?.type === 'BlockStatement' ||
				parent?.type === 'StaticBlock' ||
				parent?.type === 'Program')) ||
		(key === 'consequent' && parent?.type === 'SwitchCase')
	);
}

/**
 * A tag's name with a comment before it (`<` `// note` `div`), including a
 * dynamic tag's `{Tag}`.
 * @param {AstPath<Node>} path
 * @returns {boolean}
 */
function isCommentedTagName(path) {
	return (
		path.key === 'name' &&
		(path.parent?.type === 'JSXOpeningElement' || path.parent?.type === 'JSXClosingElement') &&
		/** @type {Node[] | undefined} */ (path.node.comments)?.some((comment) => comment.leading) ===
			true
	);
}

/**
 * A tag name with the comments before it. Prettier prints an opening tag's name
 * after a line comment at the indentation of its `<` (`<// note`), which TSX
 * can't parse, so the comments and the name go on their own indented lines
 * instead, the way Prettier prints a closing tag's: `<`, `// note`, `div`, the
 * attributes, `>`. An element's direct child keeps Prettier's layout, since a
 * `<` followed by a line break there is text. Block comments print as they
 * would straight after the `<` or `</` (`</* note *\/ div />`), which is what
 * Prettier's second format makes of a block comment on its own line.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @returns {Doc}
 */
function printTagNameComments(path, options, print) {
	const name = /** @type {Doc} */ (estree.print(path, asTypeScript(options), print));
	const hasLineComment = /** @type {Node[]} */ (path.node.comments).some(
		(comment) => comment.leading && comment.type === 'Line',
	);
	if (path.parent?.type === 'JSXClosingElement') {
		// Prettier puts the name on its own line after a line comment.
		return printOwnComments(path, options, name, { afterText: !hasLineComment });
	}
	const container = path.getParentNode(2)?.type;
	const isChild = container === 'JSXElement' || container === 'JSXFragment';
	return hasLineComment && !isChild
		? indent([hardline, printOwnComments(path, options, name)])
		: printOwnComments(path, options, name, { afterText: true });
}

/**
 * `type` values of a `<script>` whose body is JavaScript or TypeScript, as in
 * Prettier's HTML printer. No `type` means JavaScript.
 */
const CODE_SCRIPT_TYPE =
	/^(?:module|text\/babel|(?:text|application)\/(?:javascript|ecmascript|typescript|x-typescript))$/iu;

/**
 * @param {Node} node A `<script>` element.
 * @returns {boolean}
 */
function isCodeScript(node) {
	const type = node.openingElement.attributes.find(
		(/** @type {Node} */ attribute) =>
			attribute.type === 'JSXAttribute' && attribute.name.name === 'type',
	);
	if (!type) return true;
	const value = type.value?.type === 'Literal' ? type.value.value : undefined;
	return typeof value === 'string' && (value === '' || CODE_SCRIPT_TYPE.test(value));
}

/**
 * Values that present themselves as JSX elements while their parent prints,
 * with their own type.
 * @type {WeakMap<object, string>}
 */
const presentedAsJsx = new WeakMap();

/**
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @param {unknown} [args]
 * @returns {Doc}
 */
function printNode(path, options, print, args) {
	const doc = printTsrx(path, options, print);
	if (doc === null) {
		return withTsrxValuesAsJsx(
			path,
			() =>
				/** @type {Doc} */ (
					estree.print(path, asTypeScript(options), print, /** @type {any} */ (args))
				),
		);
	}
	if (!isTsrxValue(path) || rangeRoots.has(path.node)) return doc;
	const printed = printOwnComments(path, options, doc);
	// Like an element, a `@{ … }` value or a directive isn't a left-hand-side
	// expression, so it's the base of a call, member access, index, non-null
	// assertion, or tagged template only in parentheses, which Prettier's
	// `needsParens` prints around a JSX element there.
	switch (subscriptBaseKind(path)) {
		case 'callee':
			return ['(', printed, ')'];
		case 'object':
			return group(['(', indent([softline, printed]), softline, ')']);
	}
	// A `@{ … }` value or a directive gets JSX's parentheses where it is
	// assigned, returned, thrown, or an arrow's body, with its comments inside
	// them, as Prettier prints a JSX element.
	return maybeWrapJsxElementInParens(path, printed);
}

/**
 * Whether the node at `path` is the callee of a call or `new`, or the object
 * of a member access, index, non-null assertion, or tagged template.
 * @param {AstPath<Node>} path
 * @returns {'callee' | 'object' | null}
 */
function subscriptBaseKind(path) {
	const { key, parent } = path;
	switch (parent?.type) {
		case 'CallExpression':
		case 'OptionalCallExpression':
		case 'NewExpression':
			return key === 'callee' ? 'callee' : null;
		case 'MemberExpression':
		case 'OptionalMemberExpression':
			return key === 'object' ? 'object' : null;
		case 'TaggedTemplateExpression':
			return key === 'tag' ? 'object' : null;
		case 'TSNonNullExpression':
			return key === 'expression' ? 'object' : null;
		default:
			return null;
	}
}

/**
 * A range's one node, printed without the parentheses of a TSRX value.
 * @type {WeakSet<Node>}
 */
const rangeRoots = new WeakSet();

/**
 * The statements of a range (`range.js`), printed where they are in the file:
 * one statement, or the first to the last of a list, which Prettier puts on
 * lines of their own and keeps an empty line between.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @param {{ keys: Array<string | number>, first?: number, last?: number }} range
 * @returns {Doc}
 */
function printRange(path, options, print, { keys, first, last }) {
	// `AstPath#call` takes the keys as separate arguments.
	const pathTo =
		/** @type {(callback: (path: AstPath<Node>) => unknown, ...keys: Array<string | number>) => any} */ (
			path.call.bind(path)
		);
	if (first === undefined || last === undefined) {
		// A `@{ … }` value's parentheses are outside the range.
		const node = /** @type {Node} */ (pathTo(({ node }) => node, ...keys));
		rangeRoots.add(node);
		try {
			return /** @type {Doc} */ (pathTo(() => print(), ...keys));
		} finally {
			rangeRoots.delete(node);
		}
	}
	return /** @type {Doc} */ (
		pathTo(
			(listParent) => {
				/** @type {Doc[]} */
				const parts = [];
				listParent.each((statementPath, index) => {
					const node = /** @type {Node} */ (statementPath.node);
					if (index < first || index > last || node.type === 'EmptyStatement') return;
					if (parts.length > 0) parts.push(hardline);
					parts.push(print());
					if (index < last && isNextLineEmpty(options.originalText, options.locEnd(node))) {
						parts.push(hardline);
					}
				}, /** @type {string} */ (keys.at(-1)));
				return parts;
			},
			...keys.slice(0, -1),
		)
	);
}

/**
 * Print a TSRX node, or return `null` to let Prettier's estree printer print it.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @returns {Doc | null}
 */
function printTsrx(path, options, print) {
	const { node, parent } = path;
	if (node.type === 'Program' && node.tsrxRange) {
		return printRange(path, options, print, node.tsrxRange);
	}

	switch (node.tsrxType ?? node.type) {
		// A range that can't be formatted keeps its text (`range.js`).
		case 'TSRXRangeText':
			return replaceEndOfLine(options.originalText.slice(node.start, node.end));

		case 'BlockStatement':
			return node.tsrxCodeBlock
				? ['@', /** @type {Doc} */ (estree.print(path, asTypeScript(options), print))]
				: null;

		case 'ExpressionStatement':
			return node.tsrxOutput ? print('expression') : null;

		// With embedded formatting off, Prettier doesn't call `embed()`, and a
		// `<style>` or `<script>` body is printed as written.
		case 'JSXStyleElement':
			return node.tsrxRawText === undefined ? null : printRawTextAsWritten(path, options, print);

		case 'JSXElement':
		case 'JSXFragment':
			if (node.tsrxRawText !== undefined && isRawScriptElement(node)) {
				return printRawTextAsWritten(path, options, print);
			}
			if (!node.tsrxPrintsChildren) return null;
			return printElement(path, options, printJsxElementInternal(path, options, print));

		case 'JSXExpressionContainer':
			if (node.tsrxComment) {
				// A comment between children, laid out as `{/* … *\/}` and printed
				// without the braces, like any comment: a line comment ends its line,
				// and a JSDoc-style block comment is re-indented.
				const comment = node.tsrxComment;
				const printed = /** @type {NonNullable<Printer<Node>['printComment']>} */ (
					estree.printComment
				)(/** @type {AstPath<Node>} */ (/** @type {unknown} */ ({ node: comment })), options);
				return comment.type === 'Line' ? [printed, breakParent] : printed;
			}
			return isCommentedTagName(path) ? printTagNameComments(path, options, print) : null;

		case 'JSXIdentifier':
		case 'JSXMemberExpression':
		case 'JSXNamespacedName':
			return isCommentedTagName(path) ? printTagNameComments(path, options, print) : null;

		case 'JSXAttribute':
			// A shorthand (`{name}`) is its value, printed as Prettier prints the
			// braces of `name={name}`
			return node.shorthand ? print('value') : null;

		case 'IfStatement':
			return node.tsrxElseIf ? printIf(path, options, print, 'if') : null;

		case 'JSXIfExpression':
			return printIf(path, options, print, '@if');

		// `@catch (error, reset)`, which Prettier can't print: a `catch` has one
		// parameter. Its parentheses break as Prettier's `printCatchClause` breaks
		// them around a parameter with a comment by it, a parameter on each line.
		case 'CatchClause': {
			if (!node.resetParam) return null;
			const params = [print('param'), ',', line, print('resetParam')];
			return [
				'catch ',
				[node.param, node.resetParam].some((param) => hasParameterComment(param, options))
					? ['(', indent([softline, ...params]), softline, ') ']
					: ['(', print('param'), ', ', print('resetParam'), ') '],
				print('body'),
			];
		}

		case 'JSXForExpression':
			return printFor(path, options, print);

		case 'JSXSwitchExpression':
			return [
				group(['@switch (', indent([softline, print('discriminant')]), softline, ')']),
				' {',
				node.cases.length > 0
					? indent([
							hardline,
							join(
								hardline,
								path.map(
									({ node: switchCase, isLast }) => [
										print(),
										!isLast &&
										isNextLineEmpty(options.originalText, /** @type {Node} */ (switchCase).end)
											? hardline
											: '',
									],
									'cases',
								),
							),
						])
					: // A comment in an empty body, as in Prettier's `switch` (#835)
						printDanglingComments(node, options),
				hardline,
				'}',
			];

		case 'SwitchCase':
			if (parent?.tsrxType !== 'JSXSwitchExpression') return null;
			return [
				node.test ? ['@case ', print('test'), ':'] : '@default:',
				' ',
				print(['consequent', 0]),
			];

		case 'JSXTryExpression':
			return asStatement(node, () => [
				'@try ',
				print('block'),
				node.pending ? [' @pending ', print('pending')] : '',
				// A comment before `@catch` is the clause's, as in Prettier's
				// `try`, and goes before the `@`.
				node.handler
					? [
							' ',
							path.call((handler) => printOwnComments(handler, options, ['@', print()]), 'handler'),
						]
					: '',
			]);
	}

	return null;
}

/**
 * Whether a `catch` parameter has a comment that breaks its parentheses, as in
 * Prettier's `printCatchClause`: a line comment, or a block comment with a line
 * break on its outer side.
 * @param {Node} param
 * @param {ParserOptions<Node>} options
 * @returns {boolean}
 */
function hasParameterComment(param, options) {
	return /** @type {Node[]} */ (param.comments ?? []).some(
		(comment) =>
			comment.type !== 'Block' ||
			(comment.leading && hasNewline(options.originalText, options.locEnd(comment))) ||
			(comment.trailing &&
				hasNewline(options.originalText, options.locStart(comment), { backwards: true })),
	);
}

/**
 * `@if (test) { … } @else …`, with the head laid out like Prettier's `if`.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @param {string} keyword
 * @returns {Doc}
 */
function printIf(path, options, print, keyword) {
	const { node } = path;
	/** @type {Doc[]} */
	const parts = [
		group([
			keyword,
			' (',
			group([indent([softline, asStatement(node, () => print('test'))]), softline]),
			')',
		]),
		' ',
		asStatement(node, () => print('consequent')),
	];
	if (!node.alternate) return parts;
	parts.push(
		printBeforeBranch(node, options),
		'@else ',
		asStatement(node, () => print('alternate')),
	);
	return parts;
}

/**
 * What goes between a directive's `}` and its next branch (`@else`, `@empty`):
 * a space, or the comments written there, laid out as Prettier's `if` prints a
 * comment before `else` (a dangling comment of the `if`).
 * @param {Node} node
 * @param {ParserOptions<Node>} options
 * @returns {Doc}
 */
function printBeforeBranch(node, options) {
	const text = options.originalText;
	const dangling = /** @type {Node[]} */ (node.comments ?? []).filter(
		(comment) => !comment.leading && !comment.trailing,
	);
	if (dangling.length === 0) return ' ';
	const first = /** @type {Node} */ (dangling[0]);
	const last = /** @type {Node} */ (dangling.at(-1));
	return [
		isPreviousLineEmpty(text, first.start)
			? [hardline, hardline]
			: hasNewline(text, first.start, { backwards: true })
				? hardline
				: ' ',
		join(
			hardline,
			dangling.map((comment) => printCommentNode(comment, options)),
		),
		last.type === 'Line' || hasNewline(text, last.end) ? hardline : ' ',
	];
}

/**
 * `@for (head; index i; key k) { … } @empty { … }`. The head is laid out like
 * Prettier's `for`: a `for…of`/`for…in` head stays on one line, and a head with
 * several clauses breaks after each `;`.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @returns {Doc}
 */
function printFor(path, options, print) {
	const { node } = path;
	const clauses = asStatement(node, () => {
		/** @type {Doc[]} */
		const clauses =
			node.statementType === 'ForStatement'
				? [print('init'), print('test'), print('update')]
				: [
						[
							print('left'),
							node.statementType === 'ForOfStatement' ? ' of ' : ' in ',
							print('right'),
						],
					];
		if (node.index) clauses.push(['index ', print('index')]);
		if (node.key) clauses.push(['key ', print('key')]);
		return clauses;
	});
	const head =
		clauses.length === 1
			? clauses
			: group([indent([softline, join([';', line], clauses)]), softline]);
	return [
		group(['@for', node.await ? ' await' : '', ' (', head, ')']),
		' ',
		asStatement(node, () => print('body')),
		node.empty
			? [printBeforeBranch(node, options), '@empty ', asStatement(node, () => print('empty'))]
			: '',
	];
}

/**
 * Print a directive's children while the directive presents itself as its
 * statement (`IfStatement`, `ForOfStatement`, …), so Prettier lays them out as
 * it would inside that statement: a broken `if` test, a `for` declaration
 * without a semicolon, an empty body on two lines (`{`, `}`), except a
 * `@catch` body, which stays `{}` as a `catch` without `finally` does. An
 * `@else if` is an `IfStatement` already.
 * @template T
 * @param {Node} node
 * @param {() => T} callback
 * @returns {T}
 */
function asStatement(node, callback) {
	if (!node.statementType) return callback();
	const { type } = node;
	node.type = node.statementType;
	try {
		return callback();
	} finally {
		node.type = type;
	}
}

/**
 * A `<style>` or `<script>` element whose body is formatted as CSS or TypeScript.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @param {Doc} body
 * @returns {Doc}
 */
function printRawTextElement(path, options, print, body) {
	return printElement(path, options, [
		print('openingElement'),
		body ? [indent([hardline, body]), hardline] : '',
		print('closingElement'),
	]);
}

/**
 * A `<style>` or `<script>` element with its body as written.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @returns {Doc}
 */
function printRawTextAsWritten(path, options, print) {
	return printElement(path, options, [
		print('openingElement'),
		replaceEndOfLine(path.node.tsrxRawText),
		print('closingElement'),
	]);
}

/**
 * An element this plugin prints itself (one with comment children, a `<style>`
 * or a `<script>`), around it what Prettier's `printJsxElement` and `print`
 * add around every element: its own comments, then the layout parentheses, and
 * the parentheses `needsParens` asks for.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Doc} element
 * @returns {Doc}
 */
function printElement(path, options, element) {
	const needsParens = jsxNeedsParens(path);
	const printed = maybeWrapJsxElementInParens(
		path,
		printOwnComments(path, options, element),
		needsParens,
	);
	return needsParens ? ['(', printed, ')'] : printed;
}

/**
 * The `JSXElement` case of Prettier's `needsParens`, which Prettier doesn't
 * export. (Its checks on the parent give nothing else for an element in a
 * strict-mode module.)
 * @param {AstPath<Node>} path
 * @returns {boolean}
 */
function jsxNeedsParens(path) {
	const { key, parent } = path;
	if (!parent) return false;
	return (
		key === 'callee' ||
		(key === 'left' && parent.type === 'BinaryExpression' && parent.operator === '<') ||
		(!JSX_NO_PARENS_PARENTS.has(parent.type) &&
			!(key === 'declaration' && parent.type === 'ExportDefaultDeclaration'))
	);
}

/** Parents where an element needs no parentheses, from Prettier's `needsParens`. */
const JSX_NO_PARENS_PARENTS = new Set([
	'ArrayExpression',
	'ArrowFunctionExpression',
	'AssignmentExpression',
	'AssignmentPattern',
	'BinaryExpression',
	'ConditionalExpression',
	'ExpressionStatement',
	'JsExpressionRoot',
	'JSXAttribute',
	'JSXElement',
	'JSXExpressionContainer',
	'JSXFragment',
	'LogicalExpression',
	'CallExpression',
	'OptionalCallExpression',
	'NewExpression',
	'ObjectProperty',
	'Property',
	'ReturnStatement',
	'ThrowStatement',
	'TypeCastExpression',
	'VariableDeclarator',
	'YieldExpression',
	'MatchExpressionCase',
]);

/** Parents that never need parentheses around a multi-line JSX element. */
const NO_WRAP_PARENTS = new Set([
	'ArrayExpression',
	'JSXAttribute',
	'JSXElement',
	'JSXExpressionContainer',
	'JSXFragment',
	'ExpressionStatement',
	'NewExpression',
	'CallExpression',
	'OptionalCallExpression',
	'ConditionalExpression',
	'JsExpressionRoot',
	'MatchExpressionCase',
]);

/**
 * Prettier's `maybeWrapJsxElementInParens`: the parentheses of a multi-line
 * element, left out where `needsParens` already adds them.
 * @param {AstPath<Node>} path
 * @param {Doc} element
 * @param {boolean} [needsParens]
 * @returns {Doc}
 */
function maybeWrapJsxElementInParens(path, element, needsParens = false) {
	if (!path.parent || NO_WRAP_PARENTS.has(path.parent.type)) {
		return element;
	}
	const any = () => true;
	const isCall = (/** @type {Node} */ node) =>
		node.type === 'CallExpression' || node.type === 'OptionalCallExpression';
	const shouldBreak =
		path.match(
			any,
			(node, key) => key === 'body' && node.type === 'ArrowFunctionExpression',
			(node, key) => key === 'arguments' && isCall(node),
		) &&
		(path.match(
			any,
			any,
			any,
			(node, key) => key === 'expression' && node.type === 'JSXExpressionContainer',
		) ||
			path.match(
				any,
				any,
				any,
				(node, key) => key === 'expression' && node.type === 'ChainExpression',
				(node, key) => key === 'expression' && node.type === 'JSXExpressionContainer',
			));
	return group(
		[
			needsParens ? '' : ifBreak('('),
			indent([softline, element]),
			softline,
			needsParens ? '' : ifBreak(')'),
		],
		{ shouldBreak },
	);
}
