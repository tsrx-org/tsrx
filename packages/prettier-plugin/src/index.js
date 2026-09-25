/**
 * @import * as acorn from '@tsrx/core/types/acorn';
 * @import * as AST from '@tsrx/core/types/estree';
 * @import * as ESTreeJSX from '@tsrx/core/types/estree-jsx';
 * @import { Doc, AstPath, ParserOptions } from 'prettier';
 */

/**
 * Print function callback type.
 * Uses an intersection of two signatures:
 * 1. (path) => Doc — compatible with CallCallback/MapCallback for path.call/path.map
 * 2. (path, args) => Doc — used when passing context args via lambdas
 *
 * @typedef {((path: AstPath) => Doc) & ((path: AstPath, args: PrintArgs) => Doc)} PrintFn
 */

/** @typedef {Partial<Pick<ParserOptions, 'singleQuote' | 'jsxSingleQuote' | 'semi' | 'trailingComma' | 'useTabs' | 'tabWidth' | 'singleAttributePerLine' | 'bracketSameLine' | 'bracketSpacing' | 'arrowParens' | 'originalText' | 'printWidth'>> & { locStart: (node: AST.NodeWithLocation) => number, locEnd: (node: AST.NodeWithLocation) => number }} TsrxFormatOptions */

/**
 * Any node the parser may hang decorators off. The individual node types do not
 * declare the property, so reading it needs a cast.
 * @typedef {AST.Node & { decorators?: AST.Decorator[] }} MaybeDecoratedNode
 */

/** @typedef {{ isConditionalTest?: boolean, isNestedConditional?: boolean, suppressLeadingComments?: boolean, suppressExpressionLeadingComments?: boolean, suppressOwnParens?: boolean, isInlineContext?: boolean, isStatement?: boolean, isLogicalAndOr?: boolean, allowShorthandProperty?: boolean, isFirstChild?: boolean, noBreakInside?: boolean, expandLastArg?: boolean, expandFirstArg?: boolean, assignmentLayout?: AssignmentLayout, preferInlineSimpleUnionType?: boolean }} PrintArgs */

import { parseModule } from '@tsrx/core';
import { doc } from 'prettier';
import postcssPlugin from 'prettier/parser-postcss.js';

const { builders, utils } = doc;
const {
	join,
	line,
	softline,
	hardline,
	group,
	indent,
	ifBreak,
	fill,
	conditionalGroup,
	breakParent,
	indentIfBreak,
	lineSuffix,
	lineSuffixBoundary,
	align,
} = builders;
const { replaceEndOfLine, stripTrailingHardline, willBreak, canBreak, removeLines } = utils;

/** @type {import('prettier').Plugin['languages']} */
export const languages = [
	{
		name: 'tsrx',
		parsers: ['tsrx'],
		extensions: ['.tsrx'],
		vscodeLanguageIds: ['tsrx'],
	},
];

/** @type {import('prettier').Plugin['parsers']} */
export const parsers = {
	// Carry the embedded stylesheet parsers with the TSRX plugin so browser
	// consumers of prettier/standalone do not need to register PostCSS separately.
	...postcssPlugin.parsers,
	tsrx: {
		astFormat: 'tsrx-ast',
		/**
		 * @param {string} text
		 * @param {ParserOptions<AST.Node | AST.CSS.StyleSheet>} options
		 * @returns {AST.Program}
		 */
		parse(text, options) {
			return parseModule(text, options.filepath || 'PrettierPlugin.tsrx');
		},

		/**
		 * @param {AST.NodeWithLocation} node
		 * @returns {number}
		 */
		locStart(node) {
			return node.start;
		},

		/**
		 * @param {AST.NodeWithLocation} node
		 * @returns {number}
		 */
		locEnd(node) {
			return node.end;
		},
	},
};

/** @type {import('prettier').Plugin['printers']} */
export const printers = {
	...postcssPlugin.printers,
	'tsrx-ast': {
		/**
		 * @param {AstPath<AST.Node | AST.CSS.StyleSheet>} path
		 * @param {TsrxFormatOptions} options
		 * @param {PrintFn} print
		 * @param {PrintArgs} [args]
		 * @returns {Doc}
		 */
		print(path, options, print, args) {
			const node = path.node;
			const parts = printTsrxNode(node, path, options, print, args);
			// If printTsrxNode returns doc parts, return them directly
			// If it returns a string, wrap it for consistency
			// If it returns an array, concatenate it
			if (Array.isArray(parts)) {
				return parts;
			}
			return typeof parts === 'string' ? parts : parts;
		},
		/**
		 * @param {AstPath<AST.Node | AST.CSS.StyleSheet>} path
		 * @returns {((textToDoc: (text: string, options: object) => Promise<Doc>) => Promise<Doc>) | null}
		 */
		embed(path) {
			const node = path.node;

			// Handle StyleSheet nodes inside style tags
			if (node.type === 'StyleSheet' && node.source) {
				// Return async function that will be called by Prettier
				return async (textToDoc) => {
					try {
						// Format CSS using Prettier's textToDoc
						const body = await textToDoc(node.source, {
							parser: 'css',
						});

						// Return the formatted CSS
						// Note: printElement will wrap this in indent(), so we don't add indent here
						return body;
					} catch {
						// A stylesheet that doesn't parse (e.g. mid-edit code) is an expected
						// state, not an error: keep its authored lines and stay quiet.
						return replaceEndOfLine(node.source.trim());
					}
				};
			}

			// Raw-text `<script>` bodies: the parser mirrors the element's `content` as
			// a single JSXText child. Format it with Prettier's TypeScript parser (a
			// superset of JS, so plain bodies format identically) the same way <style>
			// bodies are formatted as CSS above.
			if (node.type === 'JSXText') {
				const parent = /** @type {AST.TSRXJSXElement | null} */ (path.getParentNode());
				if (isRawScriptElement(parent)) {
					return async (textToDoc) => {
						try {
							const body = await textToDoc(node.value, {
								parser: 'typescript',
							});
							// Drop the program's trailing hardline; printElement places the
							// closing tag on its own line already.
							return stripTrailingHardline(body);
						} catch {
							// A body that doesn't parse (e.g. mid-edit code) is an expected
							// state, not an error: keep it verbatim and stay quiet.
							return replaceEndOfLine(node.value);
						}
					};
				}
			}

			return null;
		},
		/**
		 * @param {AST.Node & Record<string, unknown>} node
		 * @returns {string[]}
		 */
		getVisitorKeys(node) {
			// Exclude metadata and raw text properties that shouldn't be traversed
			// The css property is specifically excluded so embed() can handle it
			const excludedKeys = new Set([
				'start',
				'end',
				'loc',
				'metadata',
				'css', // Handled by embed()
				'raw',
				'regex',
				'content', // Handled by embed() for <script> tags
			]);

			const keys = Object.keys(node).filter((key) => {
				if (excludedKeys.has(key)) {
					return false;
				}
				return typeof node[key] === 'object' && node[key] !== null;
			});

			return keys;
		},
	},
};

/**
 * Raw-text `<script>` element: the parser stores the verbatim JS/TS body on
 * `content` and mirrors it as a single JSXText child. Checking the tag name
 * alongside `content` matches the other raw-aware consumers (the target
 * transforms, the compiler's script regions).
 * @param {AST.TSRXJSXElement | AST.JSXStyleElement | null | undefined} node
 * @returns {boolean}
 */
function isRawScriptElement(node) {
	return (
		node?.type === 'JSXElement' &&
		node.openingElement?.name?.type === 'JSXIdentifier' &&
		node.openingElement.name.name === 'script' &&
		typeof node.content === 'string'
	);
}

/**
 * Format a string literal according to Prettier options
 * @param {string | number | bigint | boolean | RegExp | null | undefined} value - value to format
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {string} - The formatted string literal with quotes
 */
function formatStringLiteral(value, options) {
	if (typeof value === 'bigint') {
		// `JSON.stringify` throws on BigInt; a BigInt literal is its decimal
		// digits plus the `n` suffix.
		return `${value}n`;
	}

	if (typeof value !== 'string') {
		return JSON.stringify(value);
	}

	const quote = options.singleQuote ? "'" : '"';
	const escapedValue = value
		.replace(/\\/g, '\\\\')
		.replace(new RegExp(quote, 'g'), '\\' + quote)
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t')
		// A lone surrogate has no UTF-8 encoding: written raw, saving the file
		// turns it into U+FFFD.
		.replace(
			/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
			(surrogate) => '\\u' + surrogate.charCodeAt(0).toString(16),
		);

	return quote + escapedValue + quote;
}

/**
 * Whether `raw` is the source text of a quoted string literal.
 * @param {unknown} raw
 * @returns {raw is string}
 */
function isQuotedStringRaw(raw) {
	return (
		typeof raw === 'string' &&
		raw.length >= 2 &&
		(raw[0] === '"' || raw[0] === "'") &&
		raw[raw.length - 1] === raw[0]
	);
}

/**
 * Print a string literal from its source text, changing only the quotes the
 * way Prettier does. Reprinting the cooked value would drop the author's
 * escapes, and an escaped lone surrogate (`'\ud800'`) cannot be written back
 * as a raw character. Literals without source text fall back to the value.
 * @param {AST.Literal} node - The literal
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {string} - The formatted string literal with quotes
 */
function printStringLiteral(node, options) {
	const raw = node.raw;
	if (typeof node.value !== 'string' || !isQuotedStringRaw(raw)) {
		return formatStringLiteral(node.value, options);
	}

	const quote = options.singleQuote ? "'" : '"';
	const otherQuote = quote === '"' ? "'" : '"';
	const content = raw.slice(1, -1).replace(
		/\\(.)|(["'])/gs,
		/**
		 * @param {string} match
		 * @param {string | undefined} escaped
		 * @param {string | undefined} bareQuote
		 */
		(match, escaped, bareQuote) => {
			if (escaped !== undefined) {
				// `\'` inside double quotes no longer needs its backslash.
				return escaped === otherQuote ? escaped : match;
			}
			return bareQuote === quote ? '\\' + quote : /** @type {string} */ (bareQuote);
		},
	);

	return quote + content + quote;
}

/**
 * Normalize a numeric literal the way Prettier's core printer does: keep the
 * author's radix, separators, and exponent, but lowercase the notation and drop
 * redundant zeroes. Reprinting `value` instead would rewrite the source
 * (`0xff` -> `255`, `1_000` -> `1000`).
 * @param {string} raw - The literal exactly as written in the source
 * @returns {string} - The normalized literal
 */
function formatNumericLiteral(raw) {
	return (
		raw
			.toLowerCase()
			// Remove unnecessary plus and zeroes from scientific notation.
			.replace(/^([+-]?[\d.]+e)(?:\+|(-))?0*(\d)/, '$1$2$3')
			// Remove unnecessary scientific notation (1x).
			.replace(/^([+-]?[\d.]+)e[+-]?0+$/, '$1')
			// Make sure numbers always start with a digit.
			.replace(/^([+-])?\./, '$10.')
			// Remove extraneous trailing decimal zeroes.
			.replace(/(\.\d+?)0+(?=e|$)/, '$1')
			// Remove trailing dot.
			.replace(/\.(?=e|$)/, '')
	);
}

/**
 * Add semicolon based on options.semi setting
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {string} - Semicolon or empty string
 */
function semi(options) {
	return options.semi !== false ? ';' : '';
}

/**
 * Check if a node was originally on a single line in source
 * @param {AST.Node} node - The AST node to check
 * @returns {boolean} - True if the node was on a single line
 */
function wasOriginallySingleLine(node) {
	if (!node || !node.loc || !node.loc.start || !node.loc.end) {
		return false;
	}

	return node.loc.start.line === node.loc.end.line;
}

/**
 * Check if a node has any comments (leading, trailing, or inner)
 * @param {AST.Node & AST.NodeWithMaybeComments} node - The AST node to check
 * @returns {boolean} - True if the node has comments
 */
function hasComment(node) {
	return !!(node.leadingComments || node.trailingComments || node.innerComments);
}

/**
 * Check whether a comment is a `prettier-ignore` directive.
 * @param {AST.Comment | undefined} comment - The comment to check
 * @returns {boolean} - True if the comment reads exactly `prettier-ignore`
 */
function isPrettierIgnoreComment(comment) {
	if (!comment || (comment.type !== 'Line' && comment.type !== 'Block')) {
		return false;
	}
	return comment.value.trim() === 'prettier-ignore';
}

/**
 * Check whether a node is immediately preceded by a `prettier-ignore` directive.
 * Only the last leading comment counts, matching Prettier core.
 * @param {AST.Node & AST.NodeWithMaybeComments} node - The AST node to check
 * @returns {boolean} - True if the node should be printed verbatim
 */
function hasPrettierIgnore(node) {
	const comments = node.leadingComments;
	if (!comments || comments.length === 0) {
		return false;
	}
	return isPrettierIgnoreComment(comments[comments.length - 1]);
}

/**
 * @param {AST.FunctionDeclaration | AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction} node - The function node
 * @returns {Array<AST.Pattern | AST.Parameter>} - Array of parameter patterns
 */
function getFunctionParameters(node) {
	/** @type {(AST.Pattern | AST.Parameter)[]} */
	const parameters = [];

	if (node.params) {
		parameters.push(...node.params);
	}

	return parameters;
}

/**
 * Iterate over function parameters with path callbacks.
 * TypeScript/TSRX functions can have additional `this` and `rest` parameters.
 * @param {AstPath<AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction | AST.FunctionDeclaration>} path - The function path
 * @param {(paramPath: AstPath<AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction | AST.FunctionDeclaration>, index: number) => void} iteratee - Callback for each parameter
 * @returns {void}
 */
function iterateFunctionParametersPath(path, iteratee) {
	/** @type {AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction | AST.FunctionDeclaration} */
	const node = path.node;
	let index = 0;
	/** @type {(paramPath: AstPath) => void} */
	const callback = (paramPath) => iteratee(paramPath, index++);

	if (node.params) {
		path.each(callback, 'params');
	}
}

// Operator precedence (higher number = binds tighter). `??` binds loosest,
// matching Prettier's table.
/** @type {Record<string, number>} */
const PRECEDENCE = {
	'??': 1,
	'||': 2,
	'&&': 3,
	'|': 4,
	'^': 5,
	'&': 6,
	'==': 7,
	'!=': 7,
	'===': 7,
	'!==': 7,
	'<': 8,
	'<=': 8,
	'>': 8,
	'>=': 8,
	in: 8,
	instanceof: 8,
	'<<': 9,
	'>>': 9,
	'>>>': 9,
	'+': 10,
	'-': 10,
	'*': 11,
	'/': 11,
	'%': 11,
	'**': 12,
};

const EQUALITY_OPERATORS = new Set(['==', '!=', '===', '!==']);
const MULTIPLICATIVE_OPERATORS = new Set(['*', '/', '%']);
const BITSHIFT_OPERATORS = new Set(['<<', '>>', '>>>']);
const BITWISE_OPERATORS = new Set(['|', '^', '&', ...BITSHIFT_OPERATORS]);

/**
 * Get operator precedence for binary/logical expressions
 * @param {string} operator - The operator string
 * @returns {number} - Precedence level (higher = binds tighter)
 */
function getPrecedence(operator) {
	return PRECEDENCE[operator] || 0;
}

/**
 * Whether a binary operand that shares its parent's precedence reads the same
 * without parentheses (Prettier's `shouldFlatten`). `a + b - c` flattens;
 * `(a * b) % c` and `(a == b) == c` keep their grouping visible.
 * @param {string} parentOperator - The parent's operator
 * @param {string} nodeOperator - The operand's operator
 * @returns {boolean}
 */
function shouldFlatten(parentOperator, nodeOperator) {
	if (getPrecedence(nodeOperator) !== getPrecedence(parentOperator)) {
		return false;
	}
	// `**` is right-associative
	if (parentOperator === '**') {
		return false;
	}
	if (EQUALITY_OPERATORS.has(parentOperator) && EQUALITY_OPERATORS.has(nodeOperator)) {
		return false;
	}
	if (
		(nodeOperator === '%' && MULTIPLICATIVE_OPERATORS.has(parentOperator)) ||
		(parentOperator === '%' && MULTIPLICATIVE_OPERATORS.has(nodeOperator))
	) {
		return false;
	}
	if (
		nodeOperator !== parentOperator &&
		MULTIPLICATIVE_OPERATORS.has(nodeOperator) &&
		MULTIPLICATIVE_OPERATORS.has(parentOperator)
	) {
		return false;
	}
	if (BITSHIFT_OPERATORS.has(parentOperator) && BITSHIFT_OPERATORS.has(nodeOperator)) {
		return false;
	}
	return true;
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isCastExpression(node) {
	return node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression';
}

/**
 * Look through `as`, `satisfies`, and `<T>` casts, as Prettier's
 * couldExpandArg does, so `f({ ... } as T)` expands like `f({ ... })`.
 * @param {AST.Node} node
 * @returns {AST.Node}
 */
function skipArgumentCasts(node) {
	while (isCastExpression(node) || node.type === 'TSTypeAssertion') {
		node = /** @type {AST.TSAsExpression} */ (node).expression;
	}
	return node;
}

/**
 * Check whether a class's superclass expression prints parenthesized.
 * `extends` only takes a left-hand-side expression, so anything that binds
 * looser no longer parses without its parens: `class A extends B || C {}` is
 * a syntax error. Like Prettier, `new`, object literal and tagged template
 * superclasses are wrapped for readability too. Sequence expressions always
 * print their own parens.
 * @param {AST.Node} expression - The superclass expression
 * @returns {boolean} - True if parentheses are printed
 */
function superClassNeedsParens(expression) {
	switch (expression.type) {
		case 'ArrowFunctionExpression':
		case 'AssignmentExpression':
		case 'AwaitExpression':
		case 'BinaryExpression':
		case 'ConditionalExpression':
		case 'LogicalExpression':
		case 'NewExpression':
		case 'ObjectExpression':
		case 'TaggedTemplateExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'UnaryExpression':
		case 'UpdateExpression':
		case 'YieldExpression':
			return true;
		case 'ClassExpression':
			// `extends @dec class {}` does not parse; the decorator needs the parens
			return getDecorators(expression).length > 0;
		default:
			return false;
	}
}

/**
 * Whether a comment is a JSDoc type cast. Like Prettier's `babel` parser, any
 * block comment carrying `@type` or `@satisfies` counts.
 * @param {AST.Comment} comment
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
 * The parentheses of a parenthesized node that complete JSDoc type casts:
 * `/** @type {T} *\/ (value)` only casts `value` with them. Casts stack, one
 * pair each (`/** @type {A} *\/ (/** @type {B} *\/ (value))`), and the other
 * pairs are dropped like any redundant parentheses. A cast comment sits right
 * before its opening paren, so the parser attaches it to the node itself or,
 * for the outermost pair, to an ancestor that starts at that paren
 * (`/** @type {T} *\/ (node).start` hangs it on the member expression).
 * The node's leading comments split around the pairs: `ahead` print before
 * the outermost one, and `inside[i]` right after the opening paren of pair `i`
 * (outermost first).
 * @param {AstPath} path - The path to the parenthesized node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {{ ahead: AST.Comment[], inside: AST.Comment[][] } | null} - null
 * when no pair is a cast
 */
function getTypeCastParens(path, options) {
	const node = /** @type {AST.Node & AST.NodeWithLocation} */ (path.node);
	const parenStart = node.metadata?.paren_start;
	const text = options.originalText;
	if (typeof parenStart !== 'number' || typeof text !== 'string') {
		return null;
	}

	// The node's opening parens. Only whitespace and comments sit between them.
	/** @type {number[]} */
	const parens = [];
	for (let index = parenStart; index < node.start;) {
		if (text.startsWith('/*', index)) {
			const end = text.indexOf('*/', index + 2);
			index = end < 0 ? node.start : end + 2;
		} else if (text.startsWith('//', index)) {
			const end = text.slice(index).search(/[\n\r\u2028\u2029]/);
			index = end < 0 ? node.start : index + end;
		} else {
			if (text.charAt(index) === '(') {
				parens.push(index);
			}
			index++;
		}
	}

	/** @type {AST.Comment[]} */
	const castComments = [];
	for (let level = -1; ; level++) {
		const candidate = /** @type {(AST.Node & AST.NodeWithLocation) | null} */ (
			level < 0 ? node : path.getParentNode(level)
		);
		if (!candidate || (level >= 0 && candidate.start < parenStart)) {
			break;
		}
		const comments = /** @type {AST.NodeWithMaybeComments} */ (candidate).leadingComments;
		castComments.push(...(comments ?? []).filter(isTypeCastComment));
	}
	const castParens = parens.filter((paren) =>
		castComments.some((comment) => {
			const commentEnd = /** @type {AST.NodeWithLocation} */ (comment).end;
			return commentEnd <= paren && !text.slice(commentEnd, paren).trim();
		}),
	);
	if (castParens.length === 0) {
		return null;
	}

	const comments = /** @type {AST.NodeWithMaybeComments} */ (node).leadingComments ?? [];
	/**
	 * @param {number} from
	 * @param {number} to
	 */
	const commentsBetween = (from, to) =>
		comments.filter((comment) => {
			const commentStart = /** @type {AST.NodeWithLocation} */ (comment).start;
			return commentStart >= from && commentStart < to;
		});
	return {
		ahead: commentsBetween(-Infinity, castParens[0]),
		inside: castParens.map((paren, index) =>
			commentsBetween(paren, castParens[index + 1] ?? node.start),
		),
	};
}

/**
 * The key of the child a node's printed output starts with, when that child
 * is an expression printed without a leading token of the node's own.
 * @param {AST.Node} node
 * @returns {string | null}
 */
function getLeftmostChildKey(node) {
	switch (node.type) {
		case 'AssignmentExpression':
		case 'BinaryExpression':
		case 'LogicalExpression':
			return 'left';
		case 'MemberExpression':
			return 'object';
		case 'CallExpression':
			return 'callee';
		case 'TaggedTemplateExpression':
			return 'tag';
		case 'ConditionalExpression':
			return 'test';
		case 'UpdateExpression':
			return node.prefix ? null : 'argument';
		case 'ChainExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSNonNullExpression':
		case 'TSInstantiationExpression':
			return 'expression';
		default:
			return null;
	}
}

/**
 * Whether an object literal, function or class expression would be the first
 * token of a context that reads it differently: a statement (`{` opens a
 * block, `function`/`class` a declaration), an arrow body (`{` opens a block
 * body), an `export default` (`function`/`class` start a declaration), or a
 * superclass (TypeScript reads the `{` of `extends {}.Base {}` as the class
 * body).
 * @param {AstPath} path - The path to the object, function or class expression
 * @returns {boolean}
 */
function startsAmbiguousHead(path) {
	const node = /** @type {AST.Node} */ (path.node);
	let child = node;
	for (let level = 0; ; level++) {
		const parent = /** @type {AST.Node | null} */ (path.getParentNode(level));
		if (!parent) {
			return false;
		}
		switch (parent.type) {
			case 'ExpressionStatement':
				return true;
			case 'ArrowFunctionExpression':
				return node.type === 'ObjectExpression' && parent.body === child;
			case 'ExportDefaultDeclaration':
				// The declaration itself is `printExportDefaultDeclaration`'s to wrap
				return node.type !== 'ObjectExpression' && level > 0;
			case 'ClassDeclaration':
			case 'ClassExpression':
				// The superclass itself is `printClassDeclaration`'s to wrap
				return node.type === 'ObjectExpression' && parent.superClass === child && level > 0;
		}
		const key = getLeftmostChildKey(parent);
		if (!key || /** @type {Record<string, unknown>} */ (parent)[key] !== child) {
			return false;
		}
		// An operand that prints its own parens already moves the head off the start
		if (
			level > 0 &&
			nodeNeedsParens(
				child,
				key,
				parent,
				/** @type {AST.Node | null} */ (path.getParentNode(level + 1)),
			)
		) {
			return false;
		}
		child = parent;
	}
}

/**
 * Whether the node sits anywhere inside a `for` statement's initializer,
 * where an unparenthesized `in` would be read as a for-in loop.
 * @param {AstPath} path
 * @returns {boolean}
 */
function isInForStatementInit(path) {
	let child = /** @type {AST.Node} */ (path.node);
	for (let level = 0; ; level++) {
		const parent = /** @type {AST.Node | null} */ (path.getParentNode(level));
		if (!parent) {
			return false;
		}
		if (parent.type === 'ForStatement' && parent.init === child) {
			return true;
		}
		child = parent;
	}
}

/**
 * Whether a `new` callee contains a call, which would otherwise take the
 * `new` expression's arguments: `new (a().b)()` is not `new a().b()`.
 * @param {AST.Node} node - The `new` callee
 * @returns {boolean}
 */
function newCalleeContainsCall(node) {
	/** @type {AST.Node | null} */
	let current = node;
	while (current) {
		switch (current.type) {
			case 'CallExpression':
			case 'ImportExpression':
				return true;
			case 'MemberExpression':
				current = current.object;
				break;
			case 'TaggedTemplateExpression':
				current = current.tag;
				break;
			case 'TSNonNullExpression':
				current = current.expression;
				break;
			default:
				return false;
		}
	}
	return false;
}

/**
 * Whether a decorator expression needs parentheses. Without them a decorator
 * only takes a dotted name, optionally called once: `@a.b` and `@a.b()`.
 * @param {AST.Node} node - The decorator expression
 * @returns {boolean}
 */
function decoratorExpressionNeedsParens(node) {
	let hasCall = false;
	let hasMember = false;
	/** @type {AST.Node} */
	let current = node;
	while (true) {
		switch (current.type) {
			case 'Identifier':
				return false;
			case 'MemberExpression':
				if (current.computed) {
					return true;
				}
				hasMember = true;
				current = current.object;
				break;
			case 'CallExpression':
				if (hasMember || hasCall) {
					return true;
				}
				hasCall = true;
				current = current.callee;
				break;
			default:
				return true;
		}
	}
}

/**
 * The parent-relative part of {@link needsParens}: whether `node`, printed as
 * the `key` child of `parent`, needs parentheses to parse the same way or to
 * match Prettier's readability parentheses.
 * @param {AST.Node} node - The child node
 * @param {string | number | null} key - The child's key in `parent`
 * @param {AST.Node} parent - The parent node
 * @param {AST.Node | null} grandparent - The parent's parent
 * @returns {boolean}
 */
function nodeNeedsParens(node, key, parent, grandparent) {
	if (parent.type === 'Decorator' && key === 'expression') {
		return decoratorExpressionNeedsParens(node);
	}

	switch (node.type) {
		case 'Literal':
			// `1.toString()` does not parse
			return (
				key === 'object' && parent.type === 'MemberExpression' && typeof node.value === 'number'
			);

		case 'UpdateExpression':
		case 'UnaryExpression':
			if (node.type === 'UpdateExpression' && parent.type === 'UnaryExpression') {
				// `+(++a)`, not `+++a`
				return (
					node.prefix &&
					((node.operator === '++' && parent.operator === '+') ||
						(node.operator === '--' && parent.operator === '-'))
				);
			}
			switch (parent.type) {
				case 'UnaryExpression':
					// `-(-a)`, not `--a`
					return (
						node.type === 'UnaryExpression' &&
						node.operator === parent.operator &&
						(node.operator === '+' || node.operator === '-')
					);
				case 'MemberExpression':
					return key === 'object';
				case 'CallExpression':
				case 'NewExpression':
					return key === 'callee';
				case 'BinaryExpression':
					// `-a ** b` is a syntax error; `(!a) in b` reads as `!(a in b)` without them
					return (
						key === 'left' &&
						(parent.operator === '**' ||
							(node.type === 'UnaryExpression' &&
								(parent.operator === 'in' || parent.operator === 'instanceof')))
					);
				case 'TaggedTemplateExpression':
				case 'TSNonNullExpression':
				case 'TSInstantiationExpression':
					return true;
				default:
					return false;
			}

		case 'BinaryExpression':
		case 'LogicalExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
			switch (parent.type) {
				case 'TSAsExpression':
				case 'TSSatisfiesExpression':
					// `a as B as C` chains; anything looser than a cast is grouped
					return !isCastExpression(node);
				case 'ConditionalExpression':
					return (
						isCastExpression(node) || (node.type === 'LogicalExpression' && node.operator === '??')
					);
				case 'CallExpression':
				case 'NewExpression':
					return key === 'callee';
				case 'MemberExpression':
					return key === 'object';
				case 'AssignmentExpression':
				case 'AssignmentPattern':
					return key === 'left' && isCastExpression(node);
				case 'AwaitExpression':
				case 'JSXSpreadAttribute':
				case 'SpreadElement':
				case 'TaggedTemplateExpression':
				case 'TSInstantiationExpression':
				case 'TSNonNullExpression':
				case 'UnaryExpression':
				case 'UpdateExpression':
					return true;
				case 'LogicalExpression':
				case 'BinaryExpression': {
					if (node.type !== 'BinaryExpression' && node.type !== 'LogicalExpression') {
						return true;
					}
					if (node.type === 'LogicalExpression' && parent.type === 'LogicalExpression') {
						// `??` does not mix with `||` or `&&` without parentheses
						if ((node.operator === '??') !== (parent.operator === '??')) {
							return true;
						}
						// A chain of one logical operator evaluates the same however it
						// is grouped, so `a || (b || c)` flattens like Prettier does
						if (node.operator === parent.operator) {
							return false;
						}
					}
					const nodeOperator = node.operator;
					const parentOperator = parent.operator;
					const nodePrecedence = getPrecedence(nodeOperator);
					const parentPrecedence = getPrecedence(parentOperator);
					if (parentPrecedence > nodePrecedence) {
						return true;
					}
					if (key === 'right' && parentPrecedence === nodePrecedence) {
						return true;
					}
					if (parentPrecedence === nodePrecedence && !shouldFlatten(parentOperator, nodeOperator)) {
						return true;
					}
					if (parentPrecedence < nodePrecedence && nodeOperator === '%') {
						return parentOperator === '+' || parentOperator === '-';
					}
					return BITWISE_OPERATORS.has(parentOperator);
				}
				default:
					return false;
			}

		case 'SequenceExpression':
			// Prints its own parentheses
			return false;

		case 'YieldExpression':
		case 'AwaitExpression':
			if (node.type === 'YieldExpression' && parent.type === 'AwaitExpression') {
				return true;
			}
			switch (parent.type) {
				case 'BinaryExpression':
				case 'JSXSpreadAttribute':
				case 'LogicalExpression':
				case 'SpreadElement':
				case 'TaggedTemplateExpression':
				case 'TSAsExpression':
				case 'TSInstantiationExpression':
				case 'TSNonNullExpression':
				case 'TSSatisfiesExpression':
				case 'UnaryExpression':
					return true;
				case 'MemberExpression':
					return key === 'object';
				case 'CallExpression':
				case 'NewExpression':
					return key === 'callee';
				case 'ConditionalExpression':
					return key === 'test';
				default:
					return false;
			}

		case 'ConditionalExpression':
			switch (parent.type) {
				case 'AwaitExpression':
				case 'BinaryExpression':
				case 'JSXSpreadAttribute':
				case 'LogicalExpression':
				case 'SpreadElement':
				case 'TaggedTemplateExpression':
				case 'TSAsExpression':
				case 'TSInstantiationExpression':
				case 'TSNonNullExpression':
				case 'TSSatisfiesExpression':
				case 'UnaryExpression':
					return true;
				case 'CallExpression':
				case 'NewExpression':
					return key === 'callee';
				case 'MemberExpression':
					return key === 'object';
				case 'ConditionalExpression':
					// The ternary layout keeps a parenthesized nested branch inline, so
					// branch parens stay as written; a nested test always needs them.
					return key === 'test' || Boolean(node.metadata?.parenthesized);
				default:
					return false;
			}

		case 'FunctionExpression':
			switch (parent.type) {
				case 'CallExpression':
				case 'NewExpression':
					return key === 'callee';
				case 'TaggedTemplateExpression':
					return true;
				default:
					return false;
			}

		case 'ArrowFunctionExpression':
			switch (parent.type) {
				case 'CallExpression':
				case 'NewExpression':
					return key === 'callee';
				case 'MemberExpression':
					return key === 'object';
				case 'ConditionalExpression':
					return key === 'test';
				case 'AwaitExpression':
				case 'BinaryExpression':
				case 'LogicalExpression':
				case 'TaggedTemplateExpression':
				case 'TSAsExpression':
				case 'TSInstantiationExpression':
				case 'TSNonNullExpression':
				case 'TSSatisfiesExpression':
				case 'UnaryExpression':
					return true;
				default:
					return false;
			}

		case 'ClassExpression':
			if (key === 'callee' && parent.type === 'NewExpression') {
				return true;
			}
			// The decorators would otherwise decorate the whole operand chain
			return getDecorators(node).length > 0 && getLeftmostChildKey(parent) === key;

		case 'AssignmentExpression':
			switch (parent.type) {
				case 'ArrowFunctionExpression':
					return key === 'body';
				case 'ExpressionStatement':
					// `({ a } = obj);` would otherwise start with a block
					return node.left.type === 'ObjectPattern';
				case 'AssignmentExpression':
					return false;
				case 'ForStatement':
					return key !== 'init' && key !== 'update';
				case 'SequenceExpression':
					return !(
						grandparent?.type === 'ForStatement' &&
						(grandparent.init === parent || grandparent.update === parent)
					);
				case 'PropertyDefinition':
					return !(key === 'key' && parent.computed);
				default:
					return true;
			}

		case 'ChainExpression':
			// The parens end the chain: `(a?.b)()` calls even when `a` is nullish.
			// An optional continuation short-circuits either way.
			switch (parent.type) {
				case 'CallExpression':
					return key === 'callee' && !parent.optional;
				case 'MemberExpression':
					return key === 'object' && !parent.optional;
				case 'NewExpression':
					return key === 'callee';
				case 'TaggedTemplateExpression':
				case 'TSInstantiationExpression':
				case 'TSNonNullExpression':
					return true;
				default:
					return false;
			}

		case 'CallExpression':
		case 'ImportExpression':
		case 'MemberExpression':
		case 'TaggedTemplateExpression':
		case 'TSNonNullExpression':
			return key === 'callee' && parent.type === 'NewExpression' && newCalleeContainsCall(node);

		case 'TSInstantiationExpression':
			// TypeScript does not parse `a<T>.b`, `a<T>!` or `a<T><U>`, and
			// `(a<T>)<U>()` would otherwise print a second type argument list
			return (
				(key === 'object' && parent.type === 'MemberExpression') ||
				parent.type === 'TSNonNullExpression' ||
				parent.type === 'TSInstantiationExpression' ||
				((key === 'callee' || key === 'tag') &&
					Boolean(/** @type {{ typeArguments?: unknown }} */ (parent).typeArguments))
			);

		case 'JSXElement':
		case 'JSXFragment':
			return (
				key === 'callee' ||
				key === 'tag' ||
				(key === 'object' && parent.type === 'MemberExpression') ||
				parent.type === 'TSNonNullExpression' ||
				parent.type === 'TSInstantiationExpression' ||
				(key === 'left' && parent.type === 'BinaryExpression' && parent.operator === '<')
			);

		default:
			return false;
	}
}

/**
 * Whether the node at `path` prints inside parentheses. This follows
 * Prettier's `needs-parens`: the parentheses the grammar requires and the ones
 * Prettier adds for readability. Other parentheses in the source are dropped
 * unless they complete a JSDoc type cast (see {@link getTypeCastParens}).
 * Parents that lay out the parentheses themselves (class heritage,
 * `export default`, and `return` or `throw` with an own-line comment) own them.
 * @param {AstPath} path - The path to the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function needsParens(path, options) {
	const node = /** @type {AST.Node} */ (path.node);
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());
	if (!parent) {
		return false;
	}

	const key = path.key;
	if (
		(key === 'superClass' &&
			(parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression')) ||
		(key === 'declaration' && parent.type === 'ExportDefaultDeclaration')
	) {
		return false;
	}

	switch (node.type) {
		case 'ObjectExpression':
		case 'FunctionExpression':
		case 'ClassExpression':
			if (startsAmbiguousHead(path)) {
				return true;
			}
			break;
		case 'BinaryExpression':
			if (node.operator === 'in' && isInForStatementInit(path)) {
				return true;
			}
			break;
		case 'Identifier':
			// `for (async of x)` starts an async arrow
			return (
				node.name === 'async' && key === 'left' && parent.type === 'ForOfStatement' && !parent.await
			);
		case 'Literal': {
			// A string statement at the top of a body would become a directive
			const grandparent = /** @type {AST.Node | null} */ (path.getParentNode(1));
			if (
				typeof node.value === 'string' &&
				parent.type === 'ExpressionStatement' &&
				!isDirective(parent) &&
				(grandparent?.type === 'Program' || grandparent?.type === 'BlockStatement')
			) {
				return true;
			}
			break;
		}
	}

	return nodeNeedsParens(node, key, parent, /** @type {AST.Node | null} */ (path.getParentNode(1)));
}

/**
 * Whether a statement is a directive. The parser stores the directive's text,
 * which is empty for `"";`, so this checks for a string, not a truthy one.
 * @param {AST.Node | null} node
 * @returns {boolean}
 */
function isDirective(node) {
	return (
		node?.type === 'ExpressionStatement' &&
		typeof (/** @type {{ directive?: unknown }} */ (node).directive) === 'string'
	);
}

/**
 * Print a directive's string exactly as written, only swapping its quotes when
 * neither kind appears inside, like Prettier's `printDirective`. A directive is
 * its source text, not its value: `"use\x20strict"` enables nothing, while
 * the unescaped `"use strict"` makes the function strict.
 * @param {string} raw - The directive literal's source text
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {string}
 */
function printDirective(raw, options) {
	const content = raw.slice(1, -1);
	if (content.includes('"') || content.includes("'")) {
		return raw;
	}
	const quote = options.singleQuote ? "'" : '"';
	return quote + content + quote;
}

/** Nodes whose `body` is a list of statements. */
const STATEMENT_LIST_PARENTS = new Set([
	'Program',
	'BlockStatement',
	'StaticBlock',
	'TSModuleBlock',
	'JSXCodeBlock',
]);

/**
 * Whether the statement at `path` needs a leading `;` when semicolons are
 * omitted (`semi: false`), like Prettier's `shouldPrintLeadingSemicolon`. A
 * statement that starts with `(`, `[`, `` ` ``, `+`, `-`, `/` or `<` would
 * otherwise continue the one before it: `a\n(b)()` calls `a`.
 * @param {AstPath} path - The path to the statement
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {string} [sourceText] - The statement's source, when `prettier-ignore`
 *   prints it verbatim with parentheses that may differ from the printed ones
 * @returns {boolean}
 */
function needsLeadingSemicolon(path, options, sourceText) {
	const node = /** @type {AST.Node} */ (path.node);
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());
	if (options.semi !== false || node.type !== 'ExpressionStatement' || !parent) {
		return false;
	}
	const inStatementList =
		(path.key === 'body' && STATEMENT_LIST_PARENTS.has(parent.type)) ||
		(path.key === 'consequent' && parent.type === 'SwitchCase');
	if (!inStatementList) {
		return false;
	}
	if (sourceText !== undefined) {
		return /^[([`/<+-]/.test(sourceText);
	}
	return path.call((expressionPath) => startsWithASIHazard(expressionPath, options), 'expression');
}

/**
 * Whether an expression prints starting with a token that continues the
 * previous line, following Prettier's `expressionStatementHasDanglingASIHazard`.
 * @param {AstPath} path - The path to the expression
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function startsWithASIHazard(path, options) {
	const node = /** @type {AST.Node} */ (path.node);
	switch (node.type) {
		case 'ArrayExpression':
		case 'ArrayPattern':
		case 'TemplateLiteral':
		case 'ParenthesizedExpression':
		case 'JSXElement':
		case 'JSXFragment':
		// Prints its own parentheses outside a `for` head
		case 'SequenceExpression':
			return true;
		case 'ArrowFunctionExpression':
			if (!printsArrowParamWithoutParens(node, options)) {
				return true;
			}
			break;
		case 'UnaryExpression':
			if (node.operator === '+' || node.operator === '-') {
				return true;
			}
			break;
		case 'Literal':
			if ('regex' in node && node.regex) {
				return true;
			}
			break;
	}

	if (getTypeCastParens(path, options) || needsParens(path, options)) {
		return true;
	}
	const key = getLeftmostChildKey(node);
	return key !== null && path.call((child) => startsWithASIHazard(child, options), key);
}

/**
 * Create a function that skips specified characters in text
 * @param {string | RegExp} characters - Characters to skip
 * @returns {(text: string, startIndex: number | false, options?: { backwards?: boolean }) => number | false}
 */
function createSkip(characters) {
	return (text, startIndex, options) => {
		const backwards = Boolean(options && options.backwards);

		if (startIndex === false) {
			return false;
		}

		const length = text.length;
		let cursor = startIndex;
		while (cursor >= 0 && cursor < length) {
			const character = text.charAt(cursor);
			if (characters instanceof RegExp) {
				if (!characters.test(character)) {
					return cursor;
				}
			} else if (!characters.includes(character)) {
				return cursor;
			}
			cursor = backwards ? cursor - 1 : cursor + 1;
		}

		if (cursor === -1 || cursor === length) {
			return cursor;
		}

		return false;
	};
}

const skipSpaces = createSkip(' \t');
const skipToLineEnd = createSkip(',; \t');
const skipEverythingButNewLine = createSkip(/[^\n\r\u2028\u2029]/u);

/**
 * Check if a character is a newline
 * @param {string} character - Single character to check
 * @returns {boolean}
 */
function isCharNewLine(character) {
	return (
		character === '\n' || character === '\r' || character === '\u2028' || character === '\u2029'
	);
}

/**
 * Check if a character is whitespace (space or tab)
 * @param {string} character - Single character to check
 * @returns {boolean}
 */
function isCharSpace(character) {
	return character === ' ' || character === '\t';
}

/**
 * Skip over an inline comment (/* ... * /)
 * @param {string} text - Source text
 * @param {number | false} startIndex - Starting position
 * @returns {number | false} - Position after comment or original position
 */
function skipInlineComment(text, startIndex) {
	if (startIndex === false) {
		return false;
	}

	if (text.charAt(startIndex) === '/' && text.charAt(startIndex + 1) === '*') {
		for (let i = startIndex + 2; i < text.length; i++) {
			if (text.charAt(i) === '*' && text.charAt(i + 1) === '/') {
				return i + 2;
			}
		}
	}

	return startIndex;
}

/**
 * Skip over a newline character
 * @param {string} text - Source text
 * @param {number | false} startIndex - Starting position
 * @param {{ backwards?: boolean }} [options] - Direction options
 * @returns {number | false} - Position after newline or original position
 */
function skipNewline(text, startIndex, options) {
	const backwards = Boolean(options && options.backwards);
	if (startIndex === false) {
		return false;
	}

	const character = text.charAt(startIndex);
	if (backwards) {
		if (text.charAt(startIndex - 1) === '\r' && character === '\n') {
			return startIndex - 2;
		}
		if (isCharNewLine(character)) {
			return startIndex - 1;
		}
	} else {
		if (character === '\r' && text.charAt(startIndex + 1) === '\n') {
			return startIndex + 2;
		}
		if (isCharNewLine(character)) {
			return startIndex + 1;
		}
	}

	return startIndex;
}

/**
 * Skip over a trailing comment (// ...)
 * @param {string} text - Source text
 * @param {number | false} startIndex - Starting position
 * @returns {number | false} - Position after comment or original position
 */
function skipTrailingComment(text, startIndex) {
	if (startIndex === false) {
		return false;
	}

	if (text.charAt(startIndex) === '/' && text.charAt(startIndex + 1) === '/') {
		return skipEverythingButNewLine(text, startIndex);
	}

	return startIndex;
}

/**
 * Check if a node is a RegExp literal
 * @param {AST.Node} node - The AST node
 * @returns {boolean}
 */
function isRegExpLiteral(node) {
	return node && node.type === 'Literal' && !!(/** @type {AST.RegExpLiteral} */ (node).regex);
}

/**
 * Check if a comment is followed by a paren on the same line
 * @param {AST.Comment} comment - The comment node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isCommentFollowedBySameLineParen(comment, options) {
	if (!comment || !options || typeof options.originalText !== 'string') {
		return false;
	}

	const text = options.originalText;
	let cursor = /** @type {AST.NodeWithLocation} */ (comment).end;
	while (cursor < text.length) {
		const character = text.charAt(cursor);
		if (character === '(') {
			return true;
		}
		if (isCharNewLine(character) || !isCharSpace(character)) {
			return false;
		}
		cursor++;
	}

	return false;
}

/**
 * Check if there is a newline at the given position
 * @param {string} text - Source text
 * @param {number} startIndex - Starting position
 * @param {{ backwards?: boolean }} [options] - Direction options
 * @returns {boolean}
 */
function hasNewline(text, startIndex, options) {
	const idx = skipSpaces(text, options && options.backwards ? startIndex - 1 : startIndex, options);
	const idx2 = skipNewline(text, idx, options);
	return idx !== idx2;
}

/**
 * Check if the next line after a node is empty
 * @param {AST.Node | AST.Comment} node - The AST node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isNextLineEmpty(node, options) {
	if (!node || !options || !options.originalText) {
		return false;
	}

	return isNextLineEmptyAfterIndex(
		options.originalText,
		options.locEnd(/** @type {AST.NodeWithLocation} */ (node)),
	);
}

/**
 * Check if the line after the one containing `startIndex` is empty, skipping
 * the rest of that line's separators and comments
 * @param {string} text - Source text
 * @param {number} startIndex - Position to start from
 * @returns {boolean}
 */
function isNextLineEmptyAfterIndex(text, startIndex) {
	/** @type {number | false} */
	let index = startIndex;

	let previousIndex = null;
	while (index !== previousIndex) {
		previousIndex = index;
		index = skipToLineEnd(text, index);
		index = skipInlineComment(text, index);
		index = skipSpaces(text, index);
	}

	index = skipTrailingComment(text, index);
	index = skipNewline(text, index);
	return index !== false && hasNewline(text, index);
}

/**
 * Check if the line before the one containing `startIndex` is empty, like
 * Prettier's `isPreviousLineEmpty`
 * @param {string} text - Source text
 * @param {number} startIndex - Position to start from
 * @returns {boolean}
 */
function isPreviousLineEmpty(text, startIndex) {
	let index = skipSpaces(text, startIndex - 1, { backwards: true });
	index = skipNewline(text, index, { backwards: true });
	index = skipSpaces(text, index, { backwards: true });
	return index !== skipNewline(text, index, { backwards: true });
}

/**
 * Check if a comment ends its line and the next line is empty, as Prettier
 * checks after a leading comment
 * @param {string} text - Source text
 * @param {AST.Comment} comment - The comment
 * @returns {boolean}
 */
function isLineAfterCommentEmpty(text, comment) {
	const index = skipNewline(
		text,
		skipSpaces(text, /** @type {AST.NodeWithLocation} */ (comment).end),
	);
	return index !== false && hasNewline(text, index);
}

/**
 * Check if a function has a rest parameter
 * @param {AST.FunctionDeclaration | AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction} node - The function node
 * @returns {boolean}
 */
function hasRestParameter(node) {
	return (
		!!node.params &&
		node.params.length > 0 &&
		node.params[node.params.length - 1].type === 'RestElement'
	);
}

/**
 * Determine if a trailing comma should be printed based on options. Like
 * Prettier, `es5` prints only the commas ES5 allows (level `es5`), and `all`
 * also prints them after arguments and parameters (level `all`).
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {'es5' | 'all'} [level='es5'] - Comma level to check
 * @returns {boolean}
 */
function shouldPrintComma(options, level = 'es5') {
	switch (options.trailingComma) {
		case 'es5':
			return level === 'es5';
		case 'all':
			return true;
		default:
			return false;
	}
}

/**
 * Print an object, method, or class field key
 * @param {AST.Property | AST.MethodDefinition | AST.PropertyDefinition} node - The property or method node
 * @param {AstPath<AST.Property | AST.MethodDefinition | AST.PropertyDefinition>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printKey(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	if (node.computed) {
		// computed are never converted to identifiers
		parts.push('[', path.call(print, 'key'), ']');
		return parts;
	}

	if (node.key.type === 'Literal' && typeof node.key.value === 'string') {
		// Check if the key is a valid identifier that doesn't need quotes
		const key = node.key.value;
		const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);

		if (isValidIdentifier) {
			// Don't quote valid identifiers
			parts.push(key);
		} else {
			// Quote keys that need it (e.g., contain special characters)
			parts.push(printStringLiteral(node.key, options));
		}
	} else {
		parts.push(path.call(print, 'key'));
	}

	return parts;
}

/**
 * Read a node's decorator list, if it has one.
 * @param {AST.Node | null | undefined} node - The AST node
 * @returns {AST.Decorator[]} The decorators, or an empty array
 */
function getDecorators(node) {
	const decorators = /** @type {MaybeDecoratedNode | null | undefined} */ (node)?.decorators;
	return Array.isArray(decorators) ? decorators : [];
}

/**
 * Whether an ancestor prints this node's decorators, so the node must not print
 * them again. Two positions hoist decorators out of the node that owns them:
 *
 * - `@dec export class A {}` and `export @dec class A {}` produce identical
 *   ASTs, so the export printer emits them above the `export` keyword.
 * - A parameter property's decorators live on the inner parameter, but belong
 *   before the modifiers: `@inject private readonly x: Foo`.
 *
 * A parenthesized default export is not hoisted: its decorators apply to the
 * expression inside the parens, and lifting them above `export default` would
 * both change what they decorate and strand the parens.
 * @param {AST.Node} node - The AST node
 * @param {AstPath} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function decoratorsPrintedByParent(node, path, options) {
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());

	if (!parent) {
		return false;
	}

	if (parent.type === 'ExportDefaultDeclaration') {
		return parent.declaration === node && !isParenthesizedDefaultExport(parent, options);
	}

	if (parent.type === 'ExportNamedDeclaration') {
		return parent.declaration === node;
	}

	if (parent.type === 'TSParameterProperty') {
		return /** @type {AST.Node} */ (/** @type {unknown} */ (parent.parameter)) === node;
	}

	return false;
}

/**
 * Whether a node is a class member, whose decorators may sit either on their
 * own line or inline with the member.
 * @param {AST.Node} node - The AST node
 * @returns {boolean}
 */
function isClassMember(node) {
	return node.type === 'PropertyDefinition' || node.type === 'MethodDefinition';
}

/**
 * Whether a class member's decorators must each go on their own line, which is
 * how they were written when any of them is followed by a newline.
 * @param {AST.Node} node - The decorated node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function shouldBreakDecorators(node, options) {
	const text = options.originalText;

	if (typeof text !== 'string') {
		return false;
	}

	return getDecorators(node).some(
		(decorator) => typeof decorator.end === 'number' && hasNewline(text, decorator.end),
	);
}

/**
 * Print a decorator list as a prefix for the node it decorates, including the
 * separator that follows the last decorator.
 *
 * Classes always put each decorator on its own line. A class member keeps the
 * lines it was written with, and when it was written inline the decorators get
 * their own group, so a decorator too long to share the member's line moves to
 * its own line rather than breaking apart. Everywhere else — parameters, most
 * notably — decorators stay inline.
 * @param {AST.Node} node - The decorated node
 * @param {AstPath} path - The AST path, positioned at the decorated node
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]} The prefix parts, or an empty array when there are none
 */
function printDecorators(node, path, options, print) {
	if (getDecorators(node).length === 0) {
		return [];
	}

	const printed = /** @type {Doc[]} */ (path.map(print, 'decorators'));
	const isClass = node.type === 'ClassDeclaration' || node.type === 'ClassExpression';

	if (isClass || (isClassMember(node) && shouldBreakDecorators(node, options))) {
		return [join(hardline, printed), hardline];
	}

	if (isClassMember(node)) {
		return [group([join(line, printed), line])];
	}

	return [join(' ', printed), ' '];
}

/**
 * Print the decorators of an exported declaration, which belong above the
 * `export` keyword rather than on the declaration itself. A parenthesized
 * default export keeps its decorators inside the parens, so it prints none
 * here — see {@link decoratorsPrintedByParent}.
 * @param {AST.ExportNamedDeclaration | AST.ExportDefaultDeclaration} node - The export node
 * @param {AstPath} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]} The prefix parts, or an empty array when there are none
 */
function printDeclarationDecorators(node, path, options, print) {
	const declaration = /** @type {AST.Node | null | undefined} */ (node.declaration);

	if (getDecorators(declaration).length === 0) {
		return [];
	}

	if (
		node.type === 'ExportDefaultDeclaration' &&
		isParenthesizedDefaultExport(/** @type {AST.ExportDefaultDeclaration} */ (node), options)
	) {
		return [];
	}

	return /** @type {Doc[]} */ (
		path.call(
			(declarationPath) =>
				printDecorators(/** @type {AST.Node} */ (declaration), declarationPath, options, print),
			'declaration',
		)
	);
}

/**
 * Print leading comments that come before a node, or before the next
 * parenthesis of the node's type casts (see {@link printTypeCastParens}).
 * @param {AST.Node | AST.CSS.StyleSheet} node - The node the comments lead
 * @param {AST.Comment[]} comments - The comments, in source order
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {boolean | undefined} isInlineContext - Whether block comments stay on the line
 * @param {boolean} [semicolonBeforeLast] - Print the statement's leading `;`
 *   right before the last comment, a JSDoc cast that must touch its `(`
 * @returns {Doc[]}
 */
function printLeadingComments(node, comments, options, isInlineContext, semicolonBeforeLast) {
	const text = /** @type {string} */ (options.originalText);
	/** @type {Doc[]} */
	const parts = [];
	for (let i = 0; i < comments.length; i++) {
		const comment = comments[i];
		const nextComment = comments[i + 1];
		const isLastComment = i === comments.length - 1;

		if (comment.type === 'Line') {
			parts.push('//' + comment.value);
			parts.push(hardline);

			// Preserve a blank line before the next comment or the node. Like
			// Prettier, only the line right after the comment counts, so a line
			// holding a `;` that isn't printed is not a blank line.
			if ((nextComment || node.type !== 'JSXText') && isLineAfterCommentEmpty(text, comment)) {
				parts.push(hardline);
			}
		} else if (comment.type === 'Block') {
			if (isLastComment && semicolonBeforeLast) {
				parts.push(';');
			}
			parts.push('/*' + comment.value + '*/');

			// Check if comment and node are on the same line (for inline JSDoc comments)
			const isCommentInlineWithParen =
				isLastComment && isCommentFollowedBySameLineParen(comment, options);
			const isCommentOnSameLine =
				isLastComment && comment.loc && node.loc && comment.loc.end.line === node.loc.start.line;
			const shouldKeepOnSameLine = isCommentOnSameLine || isCommentInlineWithParen;

			if (!isInlineContext && !shouldKeepOnSameLine) {
				parts.push(hardline);

				// Preserve a blank line before the next comment or the node
				if (isLineAfterCommentEmpty(text, comment)) {
					parts.push(hardline);
				}
			} else {
				parts.push(' ');
			}
		}
	}
	return parts;
}

/**
 * Wrap a node's printed content in the parentheses of its type casts, with the
 * comments that sit inside each pair: `/** @type {A} *\/ (/** @type {B} *\/ (node))`.
 * Like Prettier, a pair breaks inside unless it hugs a literal.
 * @param {AST.Node} node - The node
 * @param {{ inside: AST.Comment[][] }} typeCastParens - See {@link getTypeCastParens}
 * @param {Doc} nodeContent - The node's printed content
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintArgs | undefined} args - The node's print arguments
 * @returns {Doc}
 */
function printTypeCastParens(node, typeCastParens, nodeContent, options, args) {
	// A parent that prints the node's leading comments prints all of them ahead
	// of the outermost pair, so the inner pairs lose their casts
	const inside = args?.suppressLeadingComments ? [[]] : typeCastParens.inside;
	let printed = nodeContent;
	for (let index = inside.length - 1; index >= 0; index--) {
		const comments = inside[index];
		const hug =
			comments.length === 0 &&
			index === inside.length - 1 &&
			(node.type === 'ObjectExpression' || node.type === 'ArrayExpression');
		const inner = [
			...printLeadingComments(node, comments, options, args?.isInlineContext),
			printed,
		];
		printed = hug ? ['(', inner, ')'] : group(['(', indent([softline, inner]), softline, ')']);
	}
	return printed;
}

/**
 * Combine already-printed leading comment parts, a node's printed body, and its
 * trailing comments into the final Doc returned by {@link printTsrxNode}.
 * @param {AST.Node} node - The AST node
 * @param {Doc[]} parts - Leading-comment parts already collected for the node
 * @param {Doc[] | Doc} nodeContent - The printed body of the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc[] | Doc}
 */
function finishTsrxNode(node, parts, nodeContent, options) {
	// Handle trailing comments
	if (node.trailingComments) {
		const text = /** @type {string} */ (options.originalText);
		const trailingParts = [];

		for (let i = 0; i < node.trailingComments.length; i++) {
			const comment = node.trailingComments[i];
			const commentStart = /** @type {AST.NodeWithLocation} */ (comment).start;
			// Like Prettier, a comment stays on the line it shares with code, even
			// a `;` that isn't printed
			const isInlineComment = !hasNewline(text, commentStart, { backwards: true });

			const commentDoc =
				comment.type === 'Line' ? '//' + comment.value : '/*' + comment.value + '*/';

			if (isInlineComment) {
				if (comment.type === 'Line') {
					trailingParts.push(lineSuffix([' ', commentDoc]));
					trailingParts.push(breakParent);
				} else {
					trailingParts.push(' ' + commentDoc);
				}
			} else {
				const refs = [];
				refs.push(hardline);

				if (isPreviousLineEmpty(text, commentStart)) {
					refs.push(hardline);
				}

				refs.push(commentDoc);
				trailingParts.push(lineSuffix(refs));
			}
		}

		if (trailingParts.length > 0) {
			parts.push(nodeContent);
			parts.push(...trailingParts);
			return parts;
		}
	} // Return with or without leading comments
	if (parts.length > 0) {
		// Don't add blank line between leading comments and node
		// because they're meant to be attached together
		parts.push(nodeContent);
		return parts;
	}

	return nodeContent;
}

/**
 * Main print function for TSRX AST nodes
 * @param {AST.Node | AST.CSS.StyleSheet} node - The AST node to print
 * @param {AstPath} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {PrintArgs} [args] - Additional context arguments
 * @returns {Doc[] | Doc}
 */
function printTsrxNode(node, path, options, print, args) {
	if (!node || typeof node !== 'object') {
		return String(node || '');
	}

	/** @type {Doc[]} */
	const parts = [];

	const isInlineContext = args && args.isInlineContext;
	const suppressLeadingComments = args && args.suppressLeadingComments;
	// A cast's comments print between its parentheses, not ahead of the node
	const typeCastParens = getTypeCastParens(path, options);
	// Whether a `;` that starts the statement (see `needsLeadingSemicolon`)
	// went out ahead of its comments
	let leadingSemicolonPrinted = false;

	// Handle leading comments
	if (!suppressLeadingComments) {
		const comments = typeCastParens ? typeCastParens.ahead : (node.leadingComments ?? []);
		const lastComment = comments.at(-1);
		// A JSDoc cast must stay right before the parenthesis it casts
		leadingSemicolonPrinted = Boolean(
			lastComment &&
			isTypeCastComment(lastComment) &&
			isCommentFollowedBySameLineParen(lastComment, options) &&
			needsLeadingSemicolon(path, options),
		);
		parts.push(
			...printLeadingComments(node, comments, options, isInlineContext, leadingSemicolonPrinted),
		);
	}

	// Handle inner comments (for nodes with no children to attach to)
	const innerCommentParts = [];
	const innerComments = /** @type {AST.NodeWithMaybeComments} */ (node).innerComments;
	if (innerComments) {
		for (const comment of innerComments) {
			if (comment.type === 'Line') {
				innerCommentParts.push('//' + comment.value);
			} else if (comment.type === 'Block') {
				innerCommentParts.push('/*' + comment.value + '*/');
			}
		}
	}

	// A `prettier-ignore` directive keeps the node's original source verbatim.
	const commentNode = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (node);
	const ignoreStart = /** @type {AST.NodeWithLocation} */ (node).start;
	const ignoreEnd = /** @type {AST.NodeWithLocation} */ (node).end;
	if (
		hasPrettierIgnore(commentNode) &&
		typeof options.originalText === 'string' &&
		typeof ignoreStart === 'number' &&
		typeof ignoreEnd === 'number'
	) {
		const ignoredText = options.originalText.slice(ignoreStart, ignoreEnd);
		/** @type {Doc} */
		let ignored = replaceEndOfLine(ignoredText);
		// The node's span excludes its own parentheses, so put back any it had
		if (typeCastParens) {
			ignored = printTypeCastParens(commentNode, typeCastParens, ignored, options, args);
		} else if (commentNode.metadata?.parenthesized && !args?.suppressOwnParens) {
			ignored = ['(', ignored, ')'];
		}
		// The previous statement may have lost the `;` that ended it
		if (!leadingSemicolonPrinted && needsLeadingSemicolon(path, options, ignoredText)) {
			ignored = [';', ignored];
		}
		return finishTsrxNode(commentNode, parts, ignored, options);
	}

	/** @type {Doc[] | Doc} */
	let nodeContent;

	switch (node.type) {
		case 'Program': {
			// Handle the body statements properly with whitespace preservation
			const statements = [];
			const printedIndexes = getPrintedStatementIndexes(node.body);
			for (let n = 0; n < printedIndexes.length; n++) {
				const i = printedIndexes[n];
				statements.push(path.call(print, 'body', i));

				// Add spacing between top-level statements based on original formatting
				if (n < printedIndexes.length - 1) {
					const currentStmt = node.body[i];
					const nextStmt = node.body[printedIndexes[n + 1]];

					// Only add spacing when explicitly needed
					if (shouldAddBlankLine(currentStmt, nextStmt, options)) {
						statements.push([line, line]); // blank line
					} else {
						statements.push(line); // single line break
					}
				}
			}

			// Prettier always adds a trailing newline to files
			// Add it unless the code is completely empty
			if (statements.length > 0) {
				nodeContent = [...statements, hardline];
			} else if (node.innerComments?.length) {
				// The parser keeps a comment-only file's comments on the program. Each
				// comment's docs start with a line break, which the first one drops.
				nodeContent = [...printElementBodyComments(node.innerComments).slice(1), hardline];
			} else {
				nodeContent = statements;
			}
			break;
		}

		case 'ImportDeclaration':
			nodeContent = printImportDeclaration(node, path, options, print);
			break;

		case 'TSImportEqualsDeclaration':
			nodeContent = printTSImportEqualsDeclaration(node, path, options, print);
			break;

		case 'TSExternalModuleReference':
			nodeContent = ['require(', path.call(print, 'expression'), ')'];
			break;

		case 'TSExportAssignment':
			nodeContent = ['export = ', path.call(print, 'expression'), semi(options)];
			break;

		case 'TSNamespaceExportDeclaration':
			nodeContent = ['export as namespace ', path.call(print, 'id'), semi(options)];
			break;

		case 'ExportNamedDeclaration':
			nodeContent = printExportNamedDeclaration(node, path, options, print);
			break;

		case 'ExportAllDeclaration':
			nodeContent = printExportAllDeclaration(node, path, options, print);
			break;

		case 'ImportSpecifier':
		case 'ExportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier':
			nodeContent = printModuleSpecifier(node, path, print);
			break;

		case 'ExportDefaultDeclaration':
			nodeContent = printExportDefaultDeclaration(node, path, options, print);
			break;

		case 'FunctionDeclaration':
			nodeContent = printFunctionDeclaration(node, path, options, print);
			break;

		case 'TSDeclareFunction':
			nodeContent = printTSDeclareFunction(node, path, options, print);
			break;

		case 'IfStatement':
			nodeContent = printIfStatement(node, path, options, print);
			break;
		case 'JSXIfExpression':
			nodeContent = [
				'@',
				printIfStatement(
					/** @type {AST.IfStatement} */ (/** @type {unknown} */ (node)),
					path,
					options,
					print,
					true,
				),
			];
			break;

		case 'ForOfStatement':
			nodeContent = printForOfStatement(node, path, options, print);
			break;
		case 'JSXForExpression':
			if (node.statementType === 'ForInStatement') {
				nodeContent = [
					'@',
					printForInStatement(
						/** @type {AST.ForInStatement} */ (/** @type {unknown} */ (node)),
						path,
						options,
						print,
					),
				];
			} else if (node.statementType === 'ForStatement') {
				nodeContent = [
					'@',
					printForStatement(
						/** @type {AST.ForStatement} */ (/** @type {unknown} */ (node)),
						path,
						options,
						print,
					),
				];
			} else {
				nodeContent = [
					'@',
					printForOfStatement(
						/** @type {AST.ForOfStatement} */ (/** @type {unknown} */ (node)),
						path,
						options,
						print,
						true,
					),
				];
			}
			break;

		case 'ForStatement':
			nodeContent = printForStatement(node, path, options, print);
			break;

		case 'ForInStatement':
			nodeContent = printForInStatement(node, path, options, print);
			break;

		case 'WhileStatement':
			nodeContent = printWhileStatement(node, path, options, print);
			break;

		case 'DoWhileStatement':
			nodeContent = printDoWhileStatement(node, path, options, print);
			break;

		case 'ClassDeclaration':
		case 'ClassExpression':
			nodeContent = printClassDeclaration(node, path, options, print);
			break;

		case 'TryStatement':
			nodeContent = printTryStatement(node, path, options, print);
			break;
		case 'JSXTryExpression':
			nodeContent = [
				'@',
				printTryStatement(
					/** @type {AST.TryStatement} */ (/** @type {unknown} */ (node)),
					path,
					options,
					print,
					true,
				),
			];
			break;

		case 'ArrayExpression':
			nodeContent = printArrayExpression(node, path, options, print);
			break;

		case 'ObjectExpression':
			nodeContent = printObjectExpression(node, path, options, print);
			break;

		case 'ClassBody':
			nodeContent = printClassBody(node, path, options, print);
			break;

		case 'PropertyDefinition':
			nodeContent = printPropertyDefinition(node, path, options, print);
			break;

		case 'MethodDefinition':
			nodeContent = printMethodDefinition(node, path, options, print);
			break;

		case 'PrivateIdentifier':
			nodeContent = '#' + node.name;
			break;

		case 'AssignmentExpression':
			nodeContent = printAssignment(
				path,
				options,
				print,
				path.call(print, 'left'),
				[' ', node.operator],
				'right',
			);
			break;

		case 'MemberExpression':
			nodeContent = printMemberExpression(node, path, options, print);
			break;

		case 'MetaProperty':
			// Prints import.meta, new.target, etc.
			nodeContent = [path.call(print, 'meta'), '.', path.call(print, 'property')];
			break;

		case 'Super':
			nodeContent = 'super';
			break;

		case 'ThisExpression':
			nodeContent = 'this';
			break;

		case 'ChainExpression':
			nodeContent = path.call(print, 'expression');
			break;

		case 'ImportExpression': {
			const importExpression =
				/** @type {AST.ImportExpression & { phase?: 'defer' | null, arguments?: AST.Expression[] }} */ (
					node
				);
			/** @type {Doc[]} */
			const parts = [
				importExpression.phase === 'defer' ? 'import.defer(' : 'import(',
				path.call(print, 'source'),
			];
			if (node.options) {
				parts.push(', ', path.call(print, 'options'));
			} else if (importExpression.arguments?.length) {
				parts.push(', ', path.call(print, 'arguments', 0));
			}
			parts.push(')');
			nodeContent = parts;
			break;
		}

		case 'CallExpression': {
			/** @type {Doc[]} */
			const parts = [];
			parts.push(path.call(print, 'callee'));

			if (node.optional) {
				parts.push('?.');
			}

			// Add TypeScript generics if present
			if (node.typeArguments) {
				parts.push(path.call(print, 'typeArguments'));
			}

			const argsDoc = printCallArguments(path, options, print);
			parts.push(argsDoc);

			// Like Prettier, a call on a call groups its argument lists, so the
			// arguments of a long curried call break first
			// (see `isLongCurriedCallExpression`)
			nodeContent = node.callee.type === 'CallExpression' ? group(parts) : parts;
			break;
		}

		case 'AwaitExpression': {
			/** @type {Doc[]} */
			const parts = ['await ', path.call(print, 'argument')];
			nodeContent = parts;
			break;
		}

		case 'StyleSheet': {
			// StyleSheet nodes inside <style> elements. When CSS is empty/whitespace-only,
			// return empty string so the element collapses to <style></style>.
			// Non-empty stylesheets are normally handled by embed() using textToDoc with the CSS parser.
			if (!node.source || !node.source.trim()) {
				nodeContent = '';
			} else {
				// Preserve authored lines when embedded-language formatting is disabled.
				nodeContent = replaceEndOfLine(node.source.trim());
			}
			break;
		}

		case 'UnaryExpression':
			nodeContent = printUnaryExpression(node, path, options, print);
			break;

		case 'YieldExpression':
			nodeContent = printYieldExpression(node, path, options, print);
			break;

		case 'TSAsExpression': {
			const typeAnnotation = path.call(
				(typePath) => print(typePath, { preferInlineSimpleUnionType: true }),
				'typeAnnotation',
			);
			const operand = path.call(print, 'expression');
			nodeContent =
				node.typeAnnotation.type !== 'TSTypeLiteral' && willBreak(typeAnnotation)
					? [operand, ' as', indent([line, typeAnnotation])]
					: [operand, ' as ', typeAnnotation];
			break;
		}

		case 'TSSatisfiesExpression': {
			const typeAnnotation = path.call(
				(typePath) => print(typePath, { preferInlineSimpleUnionType: true }),
				'typeAnnotation',
			);
			const operand = path.call(print, 'expression');
			nodeContent =
				node.typeAnnotation.type !== 'TSTypeLiteral' && willBreak(typeAnnotation)
					? [operand, ' satisfies', indent([line, typeAnnotation])]
					: [operand, ' satisfies ', typeAnnotation];
			break;
		}

		case 'TSNonNullExpression':
			nodeContent = [path.call(print, 'expression'), '!'];
			break;

		case 'TSInstantiationExpression': {
			// Explicit type instantiation: foo<Type>, identity<string>
			nodeContent = [path.call(print, 'expression'), path.call(print, 'typeArguments')];
			break;
		}

		case 'JSXExpressionContainer': {
			nodeContent = ['{', path.call(print, 'expression'), '}'];
			break;
		}

		case 'NewExpression':
			nodeContent = printNewExpression(node, path, options, print);
			break;
		case 'TemplateLiteral':
			nodeContent = printTemplateLiteral(node, path, options, print);
			break;

		case 'TaggedTemplateExpression':
			nodeContent = printTaggedTemplateExpression(node, path, options, print);
			break;

		case 'ThrowStatement':
			nodeContent = printThrowStatement(node, path, options, print);
			break;

		case 'TSInterfaceDeclaration':
			nodeContent = printTSInterfaceDeclaration(node, path, options, print);
			break;

		case 'TSTypeAliasDeclaration':
			nodeContent = printTSTypeAliasDeclaration(node, path, options, print);
			break;

		case 'TSEnumDeclaration':
			nodeContent = printTSEnumDeclaration(node, path, options, print);
			break;

		case 'TSTypeParameterDeclaration':
			nodeContent = printTSTypeParameterDeclaration(node, path, options, print);
			break;

		case 'TSTypeParameter':
			nodeContent = printTSTypeParameter(node, path, options, print);
			break;

		case 'TSTypeParameterInstantiation':
			nodeContent = printTSTypeParameterInstantiation(node, path, options, print);
			break;

		case 'TSSymbolKeyword':
			nodeContent = 'symbol';
			break;

		case 'TSAnyKeyword':
			nodeContent = 'any';
			break;

		case 'TSUnknownKeyword':
			nodeContent = 'unknown';
			break;

		case 'TSNeverKeyword':
			nodeContent = 'never';
			break;

		case 'TSVoidKeyword':
			nodeContent = 'void';
			break;

		case 'TSUndefinedKeyword':
			nodeContent = 'undefined';
			break;

		case 'TSNullKeyword':
			nodeContent = 'null';
			break;

		case 'TSNumberKeyword':
			nodeContent = 'number';
			break;

		case 'TSBigIntKeyword':
			nodeContent = 'bigint';
			break;

		case 'TSObjectKeyword':
			nodeContent = 'object';
			break;

		case 'TSBooleanKeyword':
			nodeContent = 'boolean';
			break;

		case 'TSStringKeyword':
			nodeContent = 'string';
			break;

		case 'TSThisType':
			nodeContent = 'this';
			break;

		case 'EmptyStatement':
			nodeContent = '';
			break;

		case 'TSInterfaceBody':
			nodeContent = printTSInterfaceBody(node, path, options, print);
			break;

		case 'SwitchStatement':
			nodeContent = printSwitchStatement(node, path, options, print);
			break;
		case 'JSXSwitchExpression':
			nodeContent = printJSXSwitchExpression(
				/** @type {AST.SwitchStatement} */ (/** @type {unknown} */ (node)),
				path,
				options,
				print,
			);
			break;

		case 'SwitchCase':
			nodeContent = printSwitchCase(node, path, options, print);
			break;

		case 'BreakStatement':
			nodeContent = printBreakStatement(node, path, options, print);
			break;

		case 'ContinueStatement':
			nodeContent = printContinueStatement(node, path, options, print);
			break;

		case 'LabeledStatement':
			nodeContent = printLabeledStatement(node, path, options, print);
			break;

		case 'DebuggerStatement':
			nodeContent = printDebuggerStatement(node, path, options);
			break;

		case 'SequenceExpression':
			nodeContent = printSequenceExpression(node, path, options, print, args);
			break;

		case 'SpreadElement':
			nodeContent = ['...', path.call(print, 'argument')];
			break;
		case 'RestElement': {
			/** @type {Doc[]} */
			const parts = ['...', path.call(print, 'argument')];
			if (node.typeAnnotation) {
				parts.push(': ', path.call(print, 'typeAnnotation'));
			}
			nodeContent = parts;
			break;
		}
		case 'VariableDeclaration':
			nodeContent = printVariableDeclaration(node, path, options, print);
			break;

		case 'ExpressionStatement':
			nodeContent = [
				!leadingSemicolonPrinted && needsLeadingSemicolon(path, options) ? ';' : '',
				path.call(print, 'expression'),
				semi(options),
			];
			break;
		case 'Identifier': {
			// Simple case - just return the name directly like Prettier core
			const parent = path.getParentNode();
			// The definite-assignment assertion (`let x!: T`) lives on the declarator
			const definiteMarker =
				parent && parent.type === 'VariableDeclarator' && parent.id === node && parent.definite
					? '!'
					: '';
			if (node.typeAnnotation) {
				const optionalMarker = node.optional ? '?' : '';
				nodeContent = [
					node.name,
					definiteMarker,
					optionalMarker,
					': ',
					path.call(print, 'typeAnnotation'),
				];
			} else {
				nodeContent = definiteMarker ? [node.name, definiteMarker] : node.name;
			}
			break;
		}
		case 'Literal': {
			// Handle regex literals specially
			const node_typed = /** @type {AST.RegExpLiteral} */ (node);
			const bigint_typed = /** @type {AST.BigIntLiteral} */ (node);
			if (node_typed.regex) {
				// Regex literal: use the raw representation
				nodeContent = node_typed.raw || `/${node_typed.regex.pattern}/${node_typed.regex.flags}`;
			} else if (typeof bigint_typed.bigint === 'string') {
				// BigInt literal: `bigint` is always decimal, so only `raw` keeps
				// the author's radix (`0xffn`).
				nodeContent = (bigint_typed.raw || `${bigint_typed.bigint}n`).toLowerCase();
			} else if (typeof node.value === 'number' && typeof node_typed.raw === 'string') {
				// Numeric literal: normalize, but never reprint from `value`.
				nodeContent = formatNumericLiteral(node_typed.raw);
			} else if (typeof node_typed.raw === 'string' && isDirective(path.getParentNode())) {
				nodeContent = printDirective(node_typed.raw, options);
			} else {
				// String, boolean, or null literal
				nodeContent = printStringLiteral(node, options);
			}
			break;
		}

		case 'ArrowFunctionExpression':
			nodeContent = printArrowFunction(node, path, options, print, args);
			break;

		case 'FunctionExpression':
			nodeContent = printFunctionExpression(node, path, options, print, args);
			break;

		case 'StaticBlock':
		case 'TSModuleBlock':
		case 'BlockStatement': {
			// Apply the same block formatting pattern throughout TSRX. A static
			// block is a block statement after its keyword.
			const open = node.type === 'StaticBlock' ? 'static {' : '{';
			const printedIndexes = getPrintedStatementIndexes(node.body ?? []);
			if (printedIndexes.length === 0) {
				// Handle innerComments for empty blocks
				if (innerCommentParts.length > 0) {
					const blockNode = /** @type {AST.BlockStatement} */ (node);
					// Check if we need to preserve blank lines between comments
					if (blockNode.innerComments && blockNode.innerComments.length > 0) {
						const commentDocs = [];
						const comments = blockNode.innerComments;

						for (let i = 0; i < comments.length; i++) {
							const comment = comments[i];
							const prevComment = i > 0 ? comments[i - 1] : null;

							// Check if there's a blank line before this comment
							const hasBlankLineBefore =
								prevComment && getBlankLinesBetweenNodes(prevComment, comment) > 0;

							/** @type {Doc | undefined} */
							let commentDoc;
							if (comment.type === 'Line') {
								commentDoc = '//' + comment.value;
							} else if (comment.type === 'Block') {
								commentDoc = '/*' + comment.value + '*/';
							}

							if (commentDoc !== undefined) {
								commentDocs.push({ doc: commentDoc, hasBlankLineBefore });
							}
						}

						// Build the content with proper spacing
						const contentParts = [];
						for (let i = 0; i < commentDocs.length; i++) {
							const { doc, hasBlankLineBefore } = commentDocs[i];

							if (i > 0) {
								// Add blank line if needed (two hardlines = one blank line)
								if (hasBlankLineBefore) {
									contentParts.push(hardline);
									contentParts.push(hardline);
								} else {
									contentParts.push(hardline);
								}
							}

							contentParts.push(doc);
						}

						nodeContent = group([open, indent([hardline, contentParts]), hardline, '}']);
						break;
					} else {
						// Fallback to simple join
						nodeContent = group([
							open,
							indent([hardline, join(hardline, innerCommentParts)]),
							hardline,
							'}',
						]);
						break;
					}
				}

				// Control flow statements (if, for, while, etc.) get expanded empty blocks
				// to match standard Prettier behavior. Functions/methods keep `{}`.
				const blockParent = path.getParentNode();
				const isControlFlow =
					blockParent &&
					(blockParent.type === 'IfStatement' ||
						blockParent.type === 'ForStatement' ||
						blockParent.type === 'ForInStatement' ||
						blockParent.type === 'ForOfStatement' ||
						blockParent.type === 'WhileStatement' ||
						blockParent.type === 'DoWhileStatement' ||
						blockParent.type === 'TryStatement' ||
						blockParent.type === 'CatchClause' ||
						blockParent.type === 'SwitchCase' ||
						blockParent.type === 'LabeledStatement' ||
						blockParent.type === 'JSXIfExpression' ||
						blockParent.type === 'JSXForExpression' ||
						blockParent.type === 'JSXTryExpression' ||
						blockParent.type === 'JSXSwitchExpression');

				if (isControlFlow) {
					nodeContent = [open, hardline, '}'];
				} else {
					nodeContent = [open, '}'];
				}
				break;
			}

			// Process statements and handle spacing using shouldAddBlankLine
			/** @type {Doc[]} */
			const statements = [];
			for (let n = 0; n < printedIndexes.length; n++) {
				const i = printedIndexes[n];
				statements.push(path.call(print, 'body', i));

				// Handle blank lines between statements
				if (n < printedIndexes.length - 1) {
					const currentStmt = node.body[i];
					const nextStmt = node.body[printedIndexes[n + 1]];

					if (shouldAddBlankLine(currentStmt, nextStmt, options)) {
						statements.push(hardline, hardline); // Blank line = two hardlines
					} else {
						statements.push(hardline); // Normal line break
					}
				}
			}

			// Use proper block statement pattern
			nodeContent = group([open, indent([hardline, statements]), hardline, '}']);
			break;
		}

		case 'TSModuleDeclaration': {
			const parent = path.getParentNode();
			/** @type {Doc[]} */
			const parts = [];
			// A dotted name (`namespace A.B { … }`) parses as nested declarations
			// whose body is the next name part, so only the outermost one prints
			// the keyword; repeating it gives the invalid `namespace A namespace B`.
			if (parent?.type !== 'TSModuleDeclaration' || parent.body !== node) {
				if (node.declare) {
					parts.push('declare ');
				}
				// `declare global` augments the global scope; printing it as
				// `declare module global` declares an unrelated module named `global`.
				if (node.kind !== 'global') {
					parts.push(node.kind, ' ');
				}
			}
			parts.push(path.call(print, 'id'));
			const body = /** @type {typeof node | typeof node.body} */ (
				/** @type {unknown} */ (node.body)
			);
			if (body?.type === 'TSModuleDeclaration') {
				parts.push('.', path.call(print, 'body'));
			} else if (body) {
				parts.push(' ', path.call(print, 'body'));
			} else {
				// Shorthand ambient module: `declare module 'name';`
				parts.push(semi(options));
			}
			nodeContent = parts;
			break;
		}

		case 'ReturnStatement': {
			/** @type {Doc[]} */
			const parts = ['return'];
			if (node.argument) {
				if (
					path.call((argumentPath) => getOwnLineCommentAhead(argumentPath, options), 'argument')
				) {
					// The comment prints on its own line, which would separate `return`
					// from its argument and trigger ASI — keep the argument in parens.
					// These parens replace any the argument would print for itself.
					parts.push(
						' (',
						indent([
							hardline,
							path.call(
								(argumentPath) => print(argumentPath, { suppressOwnParens: true }),
								'argument',
							),
						]),
						hardline,
						')',
					);
				} else {
					parts.push(' ');
					parts.push(path.call(print, 'argument'));
				}
			}
			parts.push(semi(options));
			nodeContent = parts;
			break;
		}

		case 'BinaryExpression': {
			// Check if we're in an assignment/declaration context where parent handles indentation
			const parent = path.getParentNode();
			const shouldNotIndent =
				parent &&
				(parent.type === 'VariableDeclarator' ||
					parent.type === 'AssignmentExpression' ||
					parent.type === 'AssignmentPattern' ||
					// Class fields and object properties indent their value
					// after the operator too (see `printAssignment`)
					parent.type === 'PropertyDefinition' ||
					parent.type === 'Property');

			let result;
			// Don't add indent if we're in a conditional test context
			if (args?.isConditionalTest) {
				result = group([
					path.call((childPath) => print(childPath, { isConditionalTest: true }), 'left'),
					' ',
					node.operator,
					[line, path.call((childPath) => print(childPath, { isConditionalTest: true }), 'right')],
				]);
			} else if (shouldNotIndent) {
				// In assignment context, don't add indent - parent will handle it
				result = group([
					path.call(print, 'left'),
					' ',
					node.operator,
					[line, path.call(print, 'right')],
				]);
			} else {
				result = group([
					path.call(print, 'left'),
					' ',
					node.operator,
					indent([line, path.call(print, 'right')]),
				]);
			}

			nodeContent = result;
			break;
		}
		case 'LogicalExpression': {
			let logicalResult;
			const rightIsNullLiteral = node.right.type === 'Literal' && node.right.value === null;
			const shouldKeepNullishFallbackInline =
				node.operator === '??' &&
				rightIsNullLiteral &&
				(node.left.type === 'CallExpression' ||
					node.left.type === 'ChainExpression' ||
					node.left.type === 'NewExpression');
			if (shouldKeepNullishFallbackInline) {
				logicalResult = group([
					path.call(print, 'left'),
					' ',
					node.operator,
					' ',
					path.call(print, 'right'),
				]);
			} else if (args?.isConditionalTest) {
				// Don't add indent if we're in a conditional test context
				logicalResult = group([
					path.call((childPath) => print(childPath, { isConditionalTest: true }), 'left'),
					' ',
					node.operator,
					[line, path.call((childPath) => print(childPath, { isConditionalTest: true }), 'right')],
				]);
			} else {
				// Like Prettier's `shouldIndentIfInlining`, the value of a declarator,
				// an assignment, a class field, or an object property is already
				// indented after the operator (see `printAssignment`)
				const parent = /** @type {AST.Node | null} */ (path.parent);
				const isIndentedByParent =
					!shouldInlineLogicalExpression(node) &&
					(parent?.type === 'VariableDeclarator' ||
						parent?.type === 'AssignmentExpression' ||
						parent?.type === 'PropertyDefinition' ||
						parent?.type === 'Property');
				const right = [line, path.call(print, 'right')];
				logicalResult = group([
					path.call(print, 'left'),
					' ',
					node.operator,
					isIndentedByParent ? right : indent(right),
				]);
			}

			nodeContent = logicalResult;
			break;
		}

		case 'ConditionalExpression': {
			// Use Prettier's grouping to handle line breaking when exceeding printWidth
			// For the test expression, if it's a LogicalExpression or BinaryExpression,
			// tell it not to add its own indentation since we're in a conditional context
			const testNeedsContext =
				node.test.type === 'LogicalExpression' || node.test.type === 'BinaryExpression';
			const testDoc = testNeedsContext
				? path.call((childPath) => print(childPath, { isConditionalTest: true }), 'test')
				: path.call(print, 'test');

			// Check if we have nested ternaries (but not if they're parenthesized, which keeps them inline)
			const hasUnparenthesizedNestedConditional =
				(node.consequent.type === 'ConditionalExpression' &&
					!node.consequent.metadata?.parenthesized) ||
				(node.alternate.type === 'ConditionalExpression' &&
					!node.alternate.metadata?.parenthesized);

			// If we have unparenthesized nested ternaries, tell the children they're nested
			const consequentDoc =
				hasUnparenthesizedNestedConditional &&
				node.consequent.type === 'ConditionalExpression' &&
				!node.consequent.metadata?.parenthesized
					? path.call((childPath) => print(childPath, { isNestedConditional: true }), 'consequent')
					: path.call(print, 'consequent');
			const alternateDoc =
				hasUnparenthesizedNestedConditional &&
				node.alternate.type === 'ConditionalExpression' &&
				!node.alternate.metadata?.parenthesized
					? path.call((childPath) => print(childPath, { isNestedConditional: true }), 'alternate')
					: path.call(print, 'alternate');

			// Check if the consequent or alternate will break
			const consequentBreaks = willBreak(consequentDoc);
			const alternateBreaks = willBreak(alternateDoc);

			// Helper to determine if a node type already handles its own indentation
			const hasOwnIndentation = (/** @type {string} */ nodeType) => {
				return nodeType === 'BinaryExpression' || nodeType === 'LogicalExpression';
			};

			let result;
			// If either branch breaks OR we have unparenthesized nested ternaries OR we're already nested, use multiline format
			if (
				consequentBreaks ||
				alternateBreaks ||
				hasUnparenthesizedNestedConditional ||
				args?.isNestedConditional
			) {
				// Only add extra indent if the expression doesn't handle its own indentation
				// AND it's not a nested conditional (which already gets indented by its parent)
				const shouldIndentConsequent =
					!hasOwnIndentation(node.consequent.type) &&
					node.consequent.type !== 'ConditionalExpression';
				const shouldIndentAlternate =
					!hasOwnIndentation(node.alternate.type) &&
					node.alternate.type !== 'ConditionalExpression';

				result = [
					testDoc,
					indent([line, '? ', shouldIndentConsequent ? indent(consequentDoc) : consequentDoc]),
					indent([line, ': ', shouldIndentAlternate ? indent(alternateDoc) : alternateDoc]),
				];
			} else {
				// Otherwise try inline first, then multiline if it doesn't fit
				const shouldIndentConsequent =
					!hasOwnIndentation(node.consequent.type) &&
					node.consequent.type !== 'ConditionalExpression';
				const shouldIndentAlternate =
					!hasOwnIndentation(node.alternate.type) &&
					node.alternate.type !== 'ConditionalExpression';

				result = conditionalGroup([
					// Try inline first
					[testDoc, ' ? ', consequentDoc, ' : ', alternateDoc],
					// If inline doesn't fit, use multiline
					[
						testDoc,
						indent([line, '? ', shouldIndentConsequent ? indent(consequentDoc) : consequentDoc]),
						indent([line, ': ', shouldIndentAlternate ? indent(alternateDoc) : alternateDoc]),
					],
				]);
			}

			nodeContent = result;
			break;
		}

		case 'UpdateExpression':
			if (node.prefix) {
				nodeContent = [node.operator, path.call(print, 'argument')];
			} else {
				nodeContent = [path.call(print, 'argument'), node.operator];
			}
			break;

		case 'TSArrayType': {
			/** @type {Doc[]} */
			const parts = [path.call(print, 'elementType'), '[]'];
			nodeContent = parts;
			break;
		}

		case 'MemberExpression':
			nodeContent = printMemberExpression(node, path, options, print);
			break;

		case 'ObjectPattern':
			nodeContent = printObjectPattern(node, path, options, print);
			break;

		case 'ArrayPattern':
			nodeContent = printArrayPattern(node, path, options, print);
			break;

		case 'Property':
			nodeContent = printProperty(node, path, options, print);
			break;

		case 'VariableDeclarator':
			nodeContent = printVariableDeclarator(node, path, options, print);
			break;

		case 'AssignmentPattern':
			nodeContent = printAssignmentPattern(node, path, options, print);
			break;

		case 'TSTypeAnnotation': {
			nodeContent = path.call(print, 'typeAnnotation');
			break;
		}

		case 'TSTypePredicate': {
			/** @type {Doc[]} */
			const predicateParts = [];
			if (node.asserts) predicateParts.push('asserts ');
			predicateParts.push(
				node.parameterName.type === 'TSThisType' ? 'this' : node.parameterName.name,
			);
			if (node.typeAnnotation) {
				predicateParts.push(' is ', path.call(print, 'typeAnnotation'));
			}
			nodeContent = predicateParts;
			break;
		}

		case 'TSTypeLiteral':
			nodeContent = printTSTypeLiteral(node, path, options, print);
			break;

		case 'TSPropertySignature':
			nodeContent = printTSPropertySignature(node, path, options, print);
			break;

		case 'TSMethodSignature':
			nodeContent = printTSMethodSignature(node, path, options, print);
			break;

		case 'TSCallSignatureDeclaration':
			nodeContent = printTSCallSignatureDeclaration(node, path, options, print);
			break;

		case 'TSConstructSignatureDeclaration':
			nodeContent = printTSConstructSignatureDeclaration(node, path, options, print);
			break;

		case 'TSEnumMember':
			nodeContent = printTSEnumMember(node, path, options, print);
			break;
		case 'TSLiteralType':
			nodeContent = path.call(print, 'literal');
			break;

		case 'TSUnionType': {
			nodeContent = printTSUnionType(node, path, print, args);
			break;
		}

		case 'TSIntersectionType': {
			const types = path.map(print, 'types');
			nodeContent = join(' & ', types);
			break;
		}

		case 'TSTypeReference':
			nodeContent = printTSTypeReference(node, path, options, print);
			break;

		case 'TSTypeOperator': {
			const operator = node.operator;
			const type = path.call(print, 'typeAnnotation');
			nodeContent = [operator, ' ', type];
			break;
		}

		case 'TSTypeQuery': {
			const expr = path.call(print, 'exprName');
			// `typeof fn<string>` is an instantiation expression: dropping the
			// arguments turns a specialized type back into the generic one.
			nodeContent = node.typeArguments
				? ['typeof ', expr, path.call(print, 'typeArguments')]
				: ['typeof ', expr];
			break;
		}

		case 'TSFunctionType': {
			/** @type {Doc[]} */
			const parts = [];

			if (node.typeParameters) {
				parts.push(path.call(print, 'typeParameters'));
			}

			// Handle parameters
			parts.push('(');
			if (node.parameters && node.parameters.length > 0) {
				const params = path.map(print, 'parameters');
				for (let i = 0; i < params.length; i++) {
					if (i > 0) parts.push(', ');
					parts.push(params[i]);
				}
			}
			parts.push(')');

			// Handle return type
			parts.push(' => ');
			if (node.typeAnnotation) {
				parts.push(path.call(print, 'typeAnnotation'));
			}

			nodeContent = parts;
			break;
		}

		case 'TSTupleType':
			nodeContent = printTSTupleType(node, path, options, print);
			break;

		case 'TSNamedTupleMember':
			nodeContent = printTSNamedTupleMember(node, path, options, print);
			break;

		case 'TSRestType':
			nodeContent = ['...', path.call(print, 'typeAnnotation')];
			break;

		case 'TSOptionalType':
			nodeContent = [path.call(print, 'typeAnnotation'), '?'];
			break;

		case 'TSIndexSignature':
			nodeContent = printTSIndexSignature(node, path, options, print);
			break;

		case 'TSConstructorType':
			nodeContent = printTSConstructorType(node, path, options, print);
			break;

		case 'TSConditionalType':
			nodeContent = printTSConditionalType(node, path, options, print);
			break;
		case 'TSInferType':
			nodeContent = ['infer ', path.call(print, 'typeParameter')];
			break;

		case 'TSMappedType':
			nodeContent = printTSMappedType(node, path, options, print);
			break;

		case 'TSQualifiedName':
			nodeContent = printTSQualifiedName(node, path, options, print);
			break;

		case 'TSImportType':
			nodeContent = printTSImportType(node, path, options, print);
			break;

		case 'TSIndexedAccessType':
			nodeContent = printTSIndexedAccessType(node, path, options, print);
			break;

		case 'TSParenthesizedType': {
			nodeContent = ['(', path.call(print, 'typeAnnotation'), ')'];
			break;
		}

		case 'TSParameterProperty': {
			// A constructor parameter property declares a class field. Losing
			// the modifiers loses the field, so this must not fall through to
			// the unknown-node path.
			/** @type {Doc[]} */
			const parts = [];

			// The parser hangs the decorators off the inner parameter, but they
			// are written before the modifiers: `@inject private readonly x: T`.
			const parameter = /** @type {AST.Node} */ (/** @type {unknown} */ (node.parameter));

			if (getDecorators(parameter).length > 0) {
				parts.push(
					.../** @type {Doc[]} */ (
						path.call(
							(parameterPath) => printDecorators(parameter, parameterPath, options, print),
							'parameter',
						)
					),
				);
			}

			if (node.accessibility) {
				parts.push(node.accessibility, ' ');
			}

			if (node.override) {
				parts.push('override ');
			}

			if (node.readonly) {
				parts.push('readonly ');
			}

			parts.push(path.call(print, 'parameter'));
			nodeContent = parts;
			break;
		}

		case 'TSExpressionWithTypeArguments': {
			/** @type {Doc[]} */
			const parts = [];
			parts.push(path.call(print, 'expression'));

			if (node.typeParameters) {
				parts.push(path.call(print, 'typeParameters'));
			}

			nodeContent = parts;
			break;
		}

		case 'JSXCodeBlock':
			nodeContent = printJSXCodeBlock(node, path, options, print);
			break;

		case 'JSXStyleElement':
			nodeContent = printJSXElement(node, path, options, print);
			break;

		case 'JSXElement':
			nodeContent = printJSXElement(/** @type {AST.TSRXJSXElement} */ (node), path, options, print);
			break;

		case 'JSXFragment':
			nodeContent = printJSXFragment(
				/** @type {AST.TSRXJSXFragment} */ (node),
				path,
				options,
				print,
			);
			break;

		case 'JSXText':
			nodeContent = printRawText(node.value);
			break;

		case 'JSXEmptyExpression':
			// JSXEmptyExpression represents the empty expression in {/* comment */}
			// The comments are attached as innerComments by the parser
			if (innerCommentParts.length > 0) {
				nodeContent = innerCommentParts;
			} else {
				nodeContent = '';
			}
			break;

		case 'JSXAttribute':
			nodeContent = printJSXAttribute(node, path, options, print);
			break;

		case 'JSXSpreadAttribute': {
			nodeContent = ['{...', path.call(print, 'argument'), '}'];
			break;
		}

		case 'Decorator':
			nodeContent = ['@', path.call(print, 'expression')];
			break;

		default:
			// An import attribute (`type: "json"` in `with { … }`) isn't in the AST
			// node union. It goes through `print` so its comments print.
			if (/** @type {string} */ (node.type) === 'ImportAttribute') {
				nodeContent = [path.call(print, 'key'), ': ', path.call(print, 'value')];
				break;
			}
			// Fallback for unknown node types
			console.warn('Unknown node type:', node.type);
			nodeContent = '/* Unknown: ' + node.type + ' */';
			break;
	}

	// Decorators have runtime effects, so every decorated node prints them —
	// unless an ancestor hoisted them out (see `decoratorsPrintedByParent`).
	const decorated = /** @type {AST.Node} */ (node);
	if (getDecorators(decorated).length > 0 && !decoratorsPrintedByParent(decorated, path, options)) {
		nodeContent = [...printDecorators(decorated, path, options, print), nodeContent];
	}

	// A cast's parens belong to the cast, so they print even where a parent
	// lays out the node's other parens (`suppressOwnParens`)
	if (typeCastParens) {
		nodeContent = printTypeCastParens(
			/** @type {AST.Node} */ (node),
			typeCastParens,
			nodeContent,
			options,
			args,
		);
	} else if (!args?.suppressOwnParens && needsParens(path, options)) {
		nodeContent = ['(', nodeContent, ')'];
	}

	return finishTsrxNode(/** @type {AST.Node} */ (node), parts, nodeContent, options);
}

/**
 * Print an import declaration
 * @param {AST.TSRXImportDeclaration} node - The import declaration node
 * @param {AstPath<AST.TSRXImportDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printImportDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = ['import'];
	if (node.phase === 'defer') {
		parts.push(' defer');
	} else if (node.importKind === 'type') {
		parts.push(' type');
	}

	parts.push(
		printModuleSpecifiers(path, options, print),
		printModuleSource(path, options, print),
		semi(options),
	);

	return parts;
}

/**
 * Print the specifier clause of an import or export, like Prettier's
 * printModuleSpecifiers: default and namespace specifiers first, then the named
 * ones in braces. The braces can break only when there is more than one named
 * specifier, a default or namespace specifier before them, or a comment on a
 * specifier, so a lone `{ a }` stays on the line.
 * @param {AstPath<AST.TSRXImportDeclaration | AST.ExportNamedDeclaration>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc}
 */
function printModuleSpecifiers(path, options, print) {
	const { node } = path;
	if (!shouldPrintModuleSpecifiers(node, options)) {
		return '';
	}

	const specifiers = /** @type {AST.Node[]} */ (node.specifiers);
	if (specifiers.length === 0) {
		return ' {}';
	}

	/** @type {Doc[]} */
	const standaloneSpecifiers = [];
	/** @type {Doc[]} */
	const groupedSpecifiers = [];
	path.each((specifierPath) => {
		const type = specifierPath.node.type;
		if (type === 'ImportDefaultSpecifier' || type === 'ImportNamespaceSpecifier') {
			standaloneSpecifiers.push(print(specifierPath));
		} else {
			groupedSpecifiers.push(print(specifierPath));
		}
	}, 'specifiers');

	/** @type {Doc[]} */
	const parts = [' ', join(', ', standaloneSpecifiers)];
	if (groupedSpecifiers.length > 0) {
		if (standaloneSpecifiers.length > 0) {
			parts.push(', ');
		}

		const space = options.bracketSpacing ? ' ' : '';
		const canBreak =
			groupedSpecifiers.length > 1 ||
			standaloneSpecifiers.length > 0 ||
			specifiers.some((specifier) => hasComment(specifier));
		parts.push(
			canBreak
				? group([
						'{',
						indent([
							options.bracketSpacing ? line : softline,
							join([',', line], groupedSpecifiers),
						]),
						ifBreak(shouldPrintComma(options) ? ',' : ''),
						options.bracketSpacing ? line : softline,
						'}',
					])
				: ['{', space, ...groupedSpecifiers, space, '}'],
		);
	}

	return parts;
}

/**
 * Whether an import or export prints a specifier clause. `import {} from "x"`
 * and `import "x"` parse to the same node, so, like Prettier, an import with no
 * specifiers keeps its braces when the source has `from` before the module
 * name. `import type` always has them: `import type "x"` is not TypeScript.
 * @param {AST.Node} node
 * @param {TsrxFormatOptions} options
 * @returns {boolean}
 */
function shouldPrintModuleSpecifiers(node, options) {
	if (
		node.type !== 'ImportDeclaration' ||
		node.specifiers.length > 0 ||
		node.importKind === 'type'
	) {
		return true;
	}

	const text = /** @type {string} */ (options.originalText);
	const source = /** @type {AST.NodeWithLocation} */ (/** @type {unknown} */ (node.source));
	const beforeSource = text.slice(
		options.locStart(/** @type {AST.NodeWithLocation} */ (node)),
		options.locStart(source),
	);
	return stripComments(beforeSource).trimEnd().endsWith('from');
}

/**
 * Print one import or export specifier: `a`, `type a`, `a as b`, `* as ns`, or
 * a default import. Like Prettier, `a as a` keeps its alias; only a specifier
 * written without `as` prints one name.
 * @param {AST.ImportSpecifier | AST.ExportSpecifier | AST.ImportDefaultSpecifier | AST.ImportNamespaceSpecifier} node
 * @param {AstPath<AST.ImportSpecifier | AST.ExportSpecifier | AST.ImportDefaultSpecifier | AST.ImportNamespaceSpecifier>} path
 * @param {PrintFn} print
 * @returns {Doc[]}
 */
function printModuleSpecifier(node, path, print) {
	if (node.type === 'ImportDefaultSpecifier') {
		return [path.call(print, 'local')];
	}
	if (node.type === 'ImportNamespaceSpecifier') {
		return ['* as ', path.call(print, 'local')];
	}

	const isImport = node.type === 'ImportSpecifier';
	const kind = isImport
		? /** @type {AST.ImportSpecifier} */ (node).importKind
		: /** @type {AST.ExportSpecifier} */ (node).exportKind;
	const leftKey = isImport ? 'imported' : 'local';
	const rightKey = isImport ? 'local' : 'exported';
	/** @type {Doc[]} */
	const parts = [kind === 'type' ? 'type ' : '', path.call(print, leftKey)];
	if (!isShorthandSpecifier(node)) {
		parts.push(' as ', path.call(print, rightKey));
	}
	return parts;
}

/**
 * Whether a specifier was written without `as`: both of its names are the same
 * source span. Prettier's isShorthandSpecifier.
 * @param {AST.ImportSpecifier | AST.ExportSpecifier} node
 * @returns {boolean}
 */
function isShorthandSpecifier(node) {
	const left = /** @type {AST.NodeWithLocation} */ (
		/** @type {unknown} */ (node.type === 'ImportSpecifier' ? node.imported : node.local)
	);
	const right = /** @type {AST.NodeWithLocation} */ (
		/** @type {unknown} */ (node.type === 'ImportSpecifier' ? node.local : node.exported)
	);
	return left === right || (left.start === right.start && left.end === right.end);
}

/**
 * Print the module an import or re-export loads, with `from` before it and its
 * import attributes after it: ` from "./data.json" with { type: "json" }`.
 * Dropping the attributes changes how the module loads, so every declaration
 * with a source prints them.
 * @param {AstPath<AST.TSRXImportDeclaration | AST.ExportNamedDeclaration | AST.ExportAllDeclaration>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc[]}
 */
function printModuleSource(path, options, print) {
	const { node } = path;
	if (!node.source) {
		return [];
	}

	/** @type {Doc[]} */
	const parts = [
		shouldPrintModuleSpecifiers(node, options) ? ' from ' : ' ',
		path.call(print, 'source'),
	];

	const attributeNodes = /** @type {AST.Node[] | undefined} */ (
		/** @type {any} */ (node).attributes ?? /** @type {any} */ (node).assertions
	);
	if (attributeNodes && attributeNodes.length > 0) {
		const attributes = path.map(
			print,
			/** @type {any} */ (/** @type {any} */ (node).attributes ? 'attributes' : 'assertions'),
		);
		// Like a commented specifier, a commented attribute lets the braces break,
		// so a line comment doesn't end up in front of the next attribute
		parts.push(
			' with ',
			attributeNodes.some((attribute) => hasComment(attribute))
				? group([
						'{',
						indent([line, join([',', line], attributes)]),
						ifBreak(shouldPrintComma(options) ? ',' : ''),
						line,
						'}',
					])
				: ['{ ', join(', ', attributes), ' }'],
		);
	}

	return parts;
}

/**
 * Print an import alias: `import A = Foo.Bar;` or `import fs = require("fs");`.
 * The alias is a runtime binding, so it must never fall through to the
 * unknown-node fallback. acorn-typescript flags `export import` with `isExport`
 * rather than wrapping it in an `ExportNamedDeclaration`.
 * @param {AST.TSImportEqualsDeclaration} node
 * @param {AstPath<AST.TSImportEqualsDeclaration>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc[]}
 */
function printTSImportEqualsDeclaration(node, path, options, print) {
	return [
		/** @type {{ isExport?: boolean }} */ (node).isExport ? 'export ' : '',
		'import ',
		node.importKind === 'type' ? 'type ' : '',
		path.call(print, 'id'),
		' = ',
		path.call(print, 'moduleReference'),
		semi(options),
	];
}

/**
 * Print an export named declaration
 * @param {AST.ExportNamedDeclaration} node - The export declaration node
 * @param {AstPath<AST.ExportNamedDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printExportNamedDeclaration(node, path, options, print) {
	if (node.declaration) {
		/** @type {Doc[]} */
		const parts = [];
		parts.push(...printDeclarationDecorators(node, path, options, print));
		parts.push('export ');
		parts.push(path.call(print, 'declaration'));
		return parts;
	}

	// `export {};` still marks the file as a module, and `export {} from "x"`
	// still loads `x`, so an empty list keeps its braces. A bare `export` would
	// export the next declaration or fail to parse at the end of the file.
	return [
		node.exportKind === 'type' ? 'export type' : 'export',
		printModuleSpecifiers(path, options, print),
		printModuleSource(path, options, print),
		semi(options),
	];
}

/**
 * Print a star re-export: `export * from "x";` or `export type * as ns from "x";`.
 * @param {AST.ExportAllDeclaration} node
 * @param {AstPath<AST.ExportAllDeclaration>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc[]}
 */
function printExportAllDeclaration(node, path, options, print) {
	return [
		/** @type {{ exportKind?: string }} */ (node).exportKind === 'type'
			? 'export type *'
			: 'export *',
		node.exported ? [' as ', path.call(print, 'exported')] : '',
		printModuleSource(path, options, print),
		semi(options),
	];
}

/**
 * Print a variable declaration
 * @param {AST.VariableDeclaration} node - The variable declaration node
 * @param {AstPath<AST.VariableDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printVariableDeclaration(node, path, options, print) {
	const kind = node.kind || 'let';

	// Don't add semicolon ONLY if this is part of a for loop header
	// - ForStatement: the init part
	// - ForOfStatement: the left part
	const parentNode = /** @type {AST.Node | null} */ (path.getParentNode());
	const isForLoopInit =
		(parentNode && parentNode.type === 'ForStatement' && parentNode.init === node) ||
		(parentNode && parentNode.type === 'ForOfStatement' && parentNode.left === node) ||
		(parentNode && parentNode.type === 'ForInStatement' && parentNode.left === node) ||
		(parentNode &&
			parentNode.type === 'JSXForExpression' &&
			(parentNode.statementType === 'ForStatement'
				? parentNode.init === node
				: parentNode.left === node));

	const printed = path.map(print, 'declarations');

	// Like Prettier, once any declarator has a value every declarator after the
	// first starts its own line; they share a line only in a `for` head or while
	// none has a value, and then only while they fit. The first declarator
	// indents with the rest whenever it can break next to them.
	const hasValue = node.declarations.some((declarator) => declarator.init);
	const firstVariable =
		printed.length === 1 && !hasComment(node.declarations[0]) ? printed[0] : indent(printed[0]);
	const rest = printed
		.slice(1)
		.map((declarator) => [',', hasValue && !isForLoopInit ? hardline : line, declarator]);

	// `declare` makes the binding ambient (no emit) — never a for-loop head
	const declarePrefix = node.declare && !isForLoopInit ? 'declare ' : '';

	return group([
		declarePrefix,
		kind,
		' ',
		firstVariable,
		indent(rest),
		isForLoopInit ? '' : semi(options),
	]);
}

/**
 * Print a function expression
 * @param {AST.FunctionExpression} node - The function expression node
 * @param {AstPath<AST.FunctionExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {PrintArgs} [args] - Additional context arguments
 * @returns {Doc[]}
 */
function printFunctionExpression(node, path, options, print, args) {
	/** @type {Doc[]} */
	const parts = [];

	// Like Prettier, a function hugged as the last call argument keeps its
	// parameters on the call's line when the call has other arguments or the
	// parameters are plain names
	const parent = /** @type {AST.Node | null} */ (path.parent);
	const shouldExpandParameters =
		Boolean(args?.expandLastArg) &&
		parent?.type === 'CallExpression' &&
		(parent.arguments.length > 1 ||
			getFunctionParameters(node).every(
				(parameter) => parameter.type === 'Identifier' && !parameter.typeAnnotation,
			));

	// Handle async functions
	if (node.async) {
		parts.push('async ');
	}

	parts.push('function');

	// Handle generator functions
	if (node.generator) {
		parts.push('*');
	}

	// Function name (if any)
	if (node.id) {
		parts.push(' ');
		parts.push(node.id.name);
	}

	// Add TypeScript generics if present
	if (node.typeParameters) {
		// Only add space if there's no function name
		if (!node.id) {
			parts.push(' ');
		}
		const typeParams = path.call(print, 'typeParameters');
		if (Array.isArray(typeParams)) {
			parts.push(...typeParams);
		} else {
			parts.push(typeParams);
		}
	} else if (!node.id) {
		// If no name and no type parameters, add space before params
		parts.push(' ');
	}

	// Print parameters and return type as a single group
	parts.push(printFunctionSignature(node, path, options, print, shouldExpandParameters));

	parts.push(' ');
	parts.push(path.call(print, 'body'));

	return parts;
}

/**
 * Whether an arrow function prints its single parameter without parentheses
 * (`x => x`), which `arrowParens: "avoid"` allows only when nothing but the
 * name is written: no type annotation, return type, or type parameters.
 * @param {AST.ArrowFunctionExpression} node - The arrow function node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function printsArrowParamWithoutParens(node, options) {
	return (
		options.arrowParens !== 'always' &&
		node.params?.length === 1 &&
		node.params[0].type === 'Identifier' &&
		!node.params[0].typeAnnotation &&
		!node.returnType &&
		!node.typeParameters
	);
}

/**
 * Thrown while a call hugs its first or last argument, when the argument's
 * parameters or return type would have to break. The call then prints every
 * argument on its own line instead (Prettier's `ArgExpansionBailout`).
 */
class ArgExpansionBailout extends Error {}

/**
 * Print an arrow function expression, porting Prettier's `printArrowFunction`.
 * A chain of arrows (`(a) => (b) => …`) prints its signatures together, and
 * the body either stays on the `=>` line or moves below it as a whole.
 * @param {AST.ArrowFunctionExpression} node - The arrow function node
 * @param {AstPath<AST.ArrowFunctionExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {PrintArgs} [args] - Additional context arguments
 * @returns {Doc}
 */
function printArrowFunction(node, path, options, print, args) {
	/** @type {Doc[]} */
	const signatureDocs = [];
	/** @type {Doc} */
	let bodyDoc = '';
	/** @type {Doc[]} */
	const bodyComments = [];
	let shouldBreakChain = false;
	const shouldPrintAsChain = !args?.expandLastArg && node.body.type === 'ArrowFunctionExpression';
	/** @type {AST.Node} */
	let functionBody = node.body;
	let bodyHasOwnLineComment = false;

	/** @param {AstPath} arrowPath */
	const rec = (arrowPath) => {
		const arrow = /** @type {AST.ArrowFunctionExpression} */ (arrowPath.node);
		const signatureDoc = printArrowFunctionSignature(arrowPath, options, print, args);
		if (signatureDocs.length === 0) {
			signatureDocs.push(signatureDoc);
		} else {
			// The chain prints the comments of the arrows inside it
			signatureDocs.push([
				printLeadingComments(arrow, arrow.leadingComments ?? [], options, false),
				signatureDoc,
			]);
			bodyComments.unshift(finishTsrxNode(arrow, [], '', options));
		}

		if (shouldPrintAsChain) {
			const parameters = getFunctionParameters(arrow);
			shouldBreakChain ||=
				(Boolean(arrow.returnType) && parameters.length > 0) ||
				Boolean(arrow.typeParameters) ||
				parameters.some((parameter) => parameter.type !== 'Identifier');
		}

		if (
			shouldPrintAsChain &&
			arrow.body.type === 'ArrowFunctionExpression' &&
			arrowPath.call((bodyPath) => canPrintInArrowChain(bodyPath, options), 'body')
		) {
			arrowPath.call(rec, 'body');
			return;
		}
		functionBody = arrow.body;
		bodyHasOwnLineComment =
			arrowPath.call((bodyPath) => getOwnLineCommentAhead(bodyPath, options), 'body') !== null;
		// An arrow body that is itself an arrow is printed as the last argument
		// of a call too
		bodyDoc =
			arrow.body.type === 'ArrowFunctionExpression'
				? arrowPath.call((bodyPath) => (args ? print(bodyPath, args) : print(bodyPath)), 'body')
				: arrowPath.call(print, 'body');
	};
	rec(path);

	// These bodies always stay on the `=>` line
	const shouldPutBodyOnSameLine =
		!bodyHasOwnLineComment &&
		(functionBody.type === 'SequenceExpression' ||
			mayBreakAfterShortPrefix(functionBody, options) ||
			(!shouldBreakChain && shouldAddParensIfNotBreak(functionBody)));

	const isCallee = path.key === 'callee' && isCallLikeExpression(path.parent);
	const chainGroupId = Symbol('arrow-chain');

	const signaturesDoc = printArrowFunctionSignatures(path, args, signatureDocs, shouldBreakChain);
	let shouldBreakSignatures = false;
	let shouldIndentSignatures = false;
	let shouldPrintSoftlineInIndent = false;
	if (shouldPrintAsChain && (isCallee || args?.assignmentLayout)) {
		shouldIndentSignatures = true;
		// A comment on the arrow already puts it on a line of its own
		shouldPrintSoftlineInIndent = !hasComment(node);
		shouldBreakSignatures =
			args?.assignmentLayout === 'chain-tail-arrow-chain' || (isCallee && !shouldPutBodyOnSameLine);
	}

	const signaturesGroup = group(
		shouldIndentSignatures
			? indent([shouldPrintSoftlineInIndent ? softline : '', signaturesDoc])
			: signaturesDoc,
		{ shouldBreak: shouldBreakSignatures, id: chainGroupId },
	);

	// A TSRX template stays on the `=>` line while it fits and otherwise
	// starts the line after it
	if (isTemplateExpression(functionBody) && !bodyHasOwnLineComment) {
		return conditionalGroup([
			group([signaturesGroup, ' => ', bodyDoc, bodyComments]),
			group([signaturesGroup, ' =>', indent([hardline, bodyDoc, bodyComments])]),
		]);
	}

	bodyDoc = printArrowFunctionBody(path, options, args, {
		bodyDoc,
		bodyComments,
		functionBody,
		shouldPutBodyOnSameLine,
	});

	return group([
		signaturesGroup,
		' =>',
		shouldPrintAsChain ? indentIfBreak(bodyDoc, { groupId: chainGroupId }) : group(bodyDoc),
		shouldPrintAsChain && isCallee ? ifBreak(softline, '', { groupId: chainGroupId }) : '',
	]);
}

/**
 * Whether an arrow that is the body of another arrow can print as part of its
 * chain, which prints the arrow's comments but not its type-cast parentheses
 * or its source kept by `prettier-ignore`.
 * @param {AstPath} path - The path to the inner arrow
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function canPrintInArrowChain(path, options) {
	const node = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (path.node);
	return (
		!hasPrettierIgnore(node) && !getTypeCastParens(path, options) && !needsParens(path, options)
	);
}

/**
 * Print an arrow function's `async`, type parameters, parameters, and return
 * type (Prettier's `printArrowFunctionSignature`). A hugged call argument
 * prints them without line breaks, or bails out when they must break.
 * @param {AstPath<AST.ArrowFunctionExpression>} path - The path to the arrow
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {PrintArgs} [args] - Additional context arguments
 * @returns {Doc}
 */
function printArrowFunctionSignature(path, options, print, args) {
	const node = path.node;
	/** @type {Doc[]} */
	const parts = [];

	if (node.async) {
		parts.push('async ');
	}

	if (printsArrowParamWithoutParens(node, options)) {
		parts.push(path.call(print, 'params', 0));
		return parts;
	}

	const shouldExpandParameters = Boolean(args?.expandLastArg || args?.expandFirstArg);
	/** @type {Doc} */
	let typeParametersDoc = node.typeParameters ? path.call(print, 'typeParameters') : '';
	/** @type {Doc} */
	let returnTypeDoc = node.returnType ? [': ', path.call(print, 'returnType')] : '';
	if (shouldExpandParameters) {
		if (willBreak(returnTypeDoc)) {
			throw new ArgExpansionBailout();
		}
		returnTypeDoc = group(removeLines(returnTypeDoc));
		if (getFunctionParameters(node).length > 0 && !isDecoratedFunction(path)) {
			if (willBreak(typeParametersDoc)) {
				throw new ArgExpansionBailout();
			}
			typeParametersDoc = removeLines(typeParametersDoc);
		}
	}

	parts.push(
		group([
			typeParametersDoc,
			printFunctionParameters(path, options, print, shouldExpandParameters),
			returnTypeDoc,
		]),
	);
	return parts;
}

/**
 * Join the signatures of an arrow chain (Prettier's
 * `printArrowFunctionSignatures`). In a call argument or a binary operand, the
 * first signature leads and the rest indent below it; as a callee or an
 * assigned value, the chain moves as a whole; anywhere else it indents.
 * @param {AstPath<AST.ArrowFunctionExpression>} path - The path to the first arrow
 * @param {PrintArgs | undefined} args - Additional context arguments
 * @param {Doc[]} signatureDocs - The printed signatures
 * @param {boolean} shouldBreak - Whether the chain always breaks
 * @returns {Doc}
 */
function printArrowFunctionSignatures(path, args, signatureDocs, shouldBreak) {
	if (signatureDocs.length === 1) {
		return signatureDocs[0];
	}

	const { parent, key } = path;
	if ((key !== 'callee' && isCallLikeExpression(parent)) || (parent && isBinaryish(parent))) {
		return group(
			[signatureDocs[0], ' =>', indent([line, join([' =>', line], signatureDocs.slice(1))])],
			{ shouldBreak },
		);
	}

	if ((key === 'callee' && isCallLikeExpression(parent)) || args?.assignmentLayout) {
		return group(join([' =>', line], signatureDocs), { shouldBreak });
	}

	return group(indent(join([' =>', line], signatureDocs)), { shouldBreak });
}

/**
 * Print what follows an arrow's `=>` (Prettier's `printArrowFunctionBody`).
 * A body that can break right after a short prefix, like an object or a
 * block, stays on the `=>` line; any other body moves to the next line as a
 * whole when it doesn't fit. A conditional body prints in parentheses only
 * while it stays on the `=>` line. As a hugged last argument, the arrow also
 * prints the call's trailing comma and the line before its `)`.
 * @param {AstPath<AST.ArrowFunctionExpression>} path - The path to the arrow
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintArgs | undefined} args - Additional context arguments
 * @param {{ bodyDoc: Doc, bodyComments: Doc[], functionBody: AST.Node, shouldPutBodyOnSameLine: boolean }} body - The printed body and its layout
 * @returns {Doc}
 */
function printArrowFunctionBody(
	path,
	options,
	args,
	{ bodyDoc, bodyComments, functionBody, shouldPutBodyOnSameLine },
) {
	const node = path.node;
	const parent = /** @type {AST.Node | null} */ (path.parent);
	const trailingComma = args?.expandLastArg && shouldPrintComma(options, 'all') ? ifBreak(',') : '';
	const trailingSpace =
		(args?.expandLastArg || parent?.type === 'JSXExpressionContainer') && !hasComment(node)
			? softline
			: '';

	if (shouldPutBodyOnSameLine && shouldAddParensIfNotBreak(functionBody)) {
		return [
			' ',
			group([
				ifBreak('', '('),
				indent([softline, bodyDoc]),
				ifBreak('', ')'),
				trailingComma,
				trailingSpace,
			]),
			bodyComments,
		];
	}

	return shouldPutBodyOnSameLine
		? [' ', bodyDoc, bodyComments]
		: [indent([line, bodyDoc, bodyComments]), trailingComma, trailingSpace];
}

/**
 * Prettier's `mayBreakAfterShortPrefix`: an arrow body that stays on the `=>`
 * line because it can break right after its first token.
 * @param {AST.Node} functionBody - The arrow body
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function mayBreakAfterShortPrefix(functionBody, options) {
	return (
		functionBody.type === 'ArrayExpression' ||
		functionBody.type === 'ObjectExpression' ||
		functionBody.type === 'ArrowFunctionExpression' ||
		isBlockBody(functionBody) ||
		isTemplateExpression(functionBody) ||
		isTemplateOnItsOwnLine(functionBody, /** @type {string} */ (options.originalText))
	);
}

/**
 * Prettier's `shouldAddParensIfNotBreak`: a conditional arrow body prints in
 * parentheses while it fits, so `a => a ? b : c` doesn't read as `a <= a`.
 * One that starts with an object literal has parentheses around the object
 * already.
 * @param {AST.Node} node - The arrow body
 * @returns {boolean}
 */
function shouldAddParensIfNotBreak(node) {
	if (node.type !== 'ConditionalExpression') {
		return false;
	}
	/** @type {AST.Node} */
	let head = node;
	for (let key = getLeftmostChildKey(head); key; key = getLeftmostChildKey(head)) {
		head = /** @type {Record<string, any>} */ (head)[key];
	}
	return head.type !== 'ObjectExpression';
}

/**
 * Prettier's `isDecoratedFunction`: a block-bodied arrow that is the only
 * argument of a call on a call, as in `const f = decorator(a)((…) => { … })`.
 * Its parameters may break while it stays hugged.
 * @param {AstPath} path - The path to the arrow
 * @returns {boolean}
 */
function isDecoratedFunction(path) {
	return path.match(
		(/** @type {AST.Node} */ node) =>
			node.type === 'ArrowFunctionExpression' && node.body.type === 'BlockStatement',
		(/** @type {AST.Node} */ node, /** @type {string | null} */ name) => {
			if (
				node.type === 'CallExpression' &&
				name === 'arguments' &&
				node.arguments.length === 1 &&
				node.callee.type === 'CallExpression'
			) {
				const decorator = node.callee.callee;
				return (
					decorator.type === 'Identifier' ||
					(decorator.type === 'MemberExpression' &&
						!decorator.computed &&
						decorator.object.type === 'Identifier' &&
						decorator.property.type === 'Identifier')
				);
			}
			return false;
		},
		(/** @type {AST.Node} */ node, /** @type {string | null} */ name) =>
			(node.type === 'VariableDeclarator' && name === 'init') ||
			(node.type === 'ExportDefaultDeclaration' && name === 'declaration') ||
			(node.type === 'TSExportAssignment' && name === 'expression') ||
			(node.type === 'AssignmentExpression' &&
				name === 'right' &&
				node.left.type === 'MemberExpression' &&
				node.left.object.type === 'Identifier' &&
				node.left.object.name === 'module' &&
				node.left.property.type === 'Identifier' &&
				node.left.property.name === 'exports'),
		(/** @type {AST.Node} */ node) =>
			node.type !== 'VariableDeclaration' ||
			(node.kind === 'const' && node.declarations.length === 1),
	);
}

/**
 * @param {AST.Node | null} node
 * @returns {boolean}
 */
function isCallLikeExpression(node) {
	return (
		!!node &&
		(node.type === 'CallExpression' ||
			node.type === 'NewExpression' ||
			node.type === 'ImportExpression')
	);
}

/**
 * Check whether an expression is one of TSRX's template expression wrappers.
 * @param {AST.Node} node - The node to check
 * @returns {boolean}
 */
function isTemplateExpression(node) {
	return node.type === 'JSXElement' || node.type === 'JSXFragment';
}

/**
 * Remove line and block comments from a span of source text.
 * @param {string} text - Source text
 * @returns {string} - The text with every comment replaced by nothing
 */
function stripComments(text) {
	let result = '';

	for (let i = 0; i < text.length; i++) {
		if (text.charAt(i) === '/' && text.charAt(i + 1) === '*') {
			const close = text.indexOf('*/', i + 2);
			i = close === -1 ? text.length : close + 1;
			continue;
		}
		if (text.charAt(i) === '/' && text.charAt(i + 1) === '/') {
			while (i < text.length && !isCharNewLine(text.charAt(i))) {
				i++;
			}
			continue;
		}
		result += text.charAt(i);
	}

	return result;
}

/**
 * Check whether `export default` wraps its declaration in parentheses.
 *
 * The parens are load-bearing for a named class or function expression:
 * `export default (class Named {})` binds `Named` only inside the class body,
 * while `export default class Named {}` binds it module-wide. Dropping them
 * silently turns the expression into a declaration.
 *
 * The node type alone cannot tell the two apart. Node spans exclude the
 * parens, and a decorated `export default @dec class Named {}` also parses as
 * a ClassExpression even though it is a declaration, so the source text
 * between the keyword and the declaration has to be consulted.
 *
 * @param {AST.TSRXExportDefaultDeclaration} node - The export default node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isParenthesizedDefaultExport(node, options) {
	const declaration = node.declaration;

	if (
		!declaration ||
		(declaration.type !== 'ClassExpression' && declaration.type !== 'FunctionExpression')
	) {
		return false;
	}

	const text = options.originalText;

	if (typeof text !== 'string') {
		return false;
	}

	const start = options.locStart(/** @type {AST.NodeWithLocation} */ (node));
	const end = options.locStart(/** @type {AST.NodeWithLocation} */ (declaration));

	if (!(start < end)) {
		return false;
	}

	// Only the keyword, whitespace, comments and opening parens can appear
	// here, so a trailing `(` after stripping comments means the declaration
	// was parenthesized.
	return stripComments(text.slice(start, end)).trimEnd().endsWith('(');
}

/**
 * Whether an `export default` takes a statement terminator.
 *
 * The grammar admits two shapes after the keyword. A HoistableDeclaration,
 * ClassDeclaration or TypeScript declaration form is a *declaration* and ends
 * at its closing brace. Everything else is an AssignmentExpression, which is a
 * *statement* and needs a `;`.
 *
 * Omitting it is an ASI hazard rather than a cosmetic slip: the next line is
 * swallowed into the exported expression whenever it starts with `(`, `[`,
 * a template literal, `+`, `-`, or `/`. `export default foo;` followed by
 * `(function () {})();` silently becomes the single call
 * `export default foo(function () {})();`.
 *
 * The node type alone cannot decide this. A decorated
 * `export default @dec class Named {}` parses as a ClassExpression but is
 * still a declaration, so the two expression node types defer to
 * {@link isParenthesizedDefaultExport}, which reads the source.
 *
 * @param {AST.TSRXExportDefaultDeclaration} node - The export default node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function defaultExportNeedsSemicolon(node, options) {
	const declaration = node.declaration;

	if (!declaration) {
		return false;
	}

	switch (declaration.type) {
		case 'FunctionDeclaration':
		case 'ClassDeclaration':
		case 'TSDeclareFunction':
		case 'TSInterfaceDeclaration':
			return false;
		case 'ClassExpression':
		case 'FunctionExpression':
			return isParenthesizedDefaultExport(node, options);
		default:
			return true;
	}
}

/**
 * Print an export default declaration
 * @param {AST.ExportDefaultDeclaration} node - The export default node
 * @param {AstPath<AST.ExportDefaultDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printExportDefaultDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push(...printDeclarationDecorators(node, path, options, print));
	parts.push('export default ');

	// Declaration forms end at their closing brace; expression forms are
	// statements and terminate.
	const terminator = defaultExportNeedsSemicolon(node, options) ? semi(options) : '';

	if (isParenthesizedDefaultExport(node, options)) {
		// An expression export, not a declaration: it keeps its parens.
		const declaration = path.call(print, 'declaration');

		if (getDecorators(/** @type {AST.Node} */ (node.declaration)).length > 0) {
			// The decorators stay inside the parens, each on its own line, so
			// the whole expression is indented to keep them off column zero.
			parts.push('(', indent([hardline, declaration]), hardline, ')', terminator);
			return parts;
		}

		parts.push('(', declaration, ')', terminator);
		return parts;
	}

	parts.push(path.call(print, 'declaration'), terminator);
	return parts;
}

/**
 * Check if the only function parameter should be hugged (no extra parens)
 * @param {AST.FunctionDeclaration | AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction} node - The function node
 * @returns {boolean}
 */
function shouldHugTheOnlyFunctionParameter(node) {
	if (!node) {
		return false;
	}
	const parameters = getFunctionParameters(node);
	if (parameters.length !== 1) {
		return false;
	}
	const [parameter] = parameters;
	return (
		!hasComment(parameter) &&
		(parameter.type === 'ObjectPattern' ||
			parameter.type === 'ArrayPattern' ||
			(parameter.type === 'Identifier' &&
				!!parameter.typeAnnotation &&
				parameter.typeAnnotation.type === 'TSTypeAnnotation' &&
				isHuggableParameterType(parameter.typeAnnotation.typeAnnotation)))
	);
}

/**
 * Check if a type node is an object-like type (object literal or mapped type)
 * @param {AST.Node | undefined} node - The type node
 * @returns {boolean}
 */
function isObjectType(node) {
	return !!node && (node.type === 'TSTypeLiteral' || node.type === 'TSMappedType');
}

/**
 * Check if a parameter's type annotation should keep the parameter hugged.
 * Object-like types hug like vanilla prettier; additionally a type reference
 * wrapping a single object type (`props: Props<{ ... }>`) hugs, since that is
 * the common TSRX component-props shape. Other references, like a plain
 * `initialState: State`, leave the parameter list free to break.
 * @param {AST.Node | undefined} node - The type node
 * @returns {boolean}
 */
function isHuggableParameterType(node) {
	if (isObjectType(node)) {
		return true;
	}
	if (node?.type === 'TSIntersectionType') {
		const types = /** @type {AST.TSIntersectionType} */ (node).types;
		return types?.length > 0 && isHuggableParameterType(types[types.length - 1]);
	}
	if (node?.type === 'TSTypeReference') {
		const typeArguments =
			/** @type {AST.TSTypeReference & { typeParameters?: AST.TSTypeParameterInstantiation }} */ (
				node
			).typeArguments ??
			/** @type {AST.TSTypeReference & { typeParameters?: AST.TSTypeParameterInstantiation }} */ (
				node
			).typeParameters;
		return typeArguments?.params?.length === 1 && isObjectType(typeArguments.params[0]);
	}
	return false;
}

/**
 * Print function parameters with proper formatting
 * @param {AstPath<AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction | AST.FunctionDeclaration>} path - The function path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [shouldExpandParameters] - Whether the function is a hugged
 * call argument, which keeps its parameters on one line
 * @returns {Doc[]}
 */
function printFunctionParameters(path, options, print, shouldExpandParameters = false) {
	const functionNode = path.node;
	const parameters = getFunctionParameters(functionNode);

	if (parameters.length === 0) {
		return ['(', ')'];
	}

	// Like Prettier, a test call's function keeps its parameters on one line
	const isParametersInTestCall = isTestCall(/** @type {AST.Node | null} */ (path.parent));
	const shouldHugParameters = shouldHugTheOnlyFunctionParameter(functionNode);
	/** @type {Doc[]} */
	const printed = [];

	iterateFunctionParametersPath(path, (parameterPath, index) => {
		const isLastParameter = index === parameters.length - 1;

		printed.push(print(parameterPath));

		if (!isLastParameter) {
			printed.push(',');
			if (isParametersInTestCall || shouldHugParameters) {
				printed.push(' ');
			} else if (isNextLineEmpty(parameters[index], options)) {
				printed.push(hardline, hardline);
			} else {
				printed.push(line);
			}
		}
	});

	// Like Prettier, a hugged first or last call argument keeps its parameters
	// on the call's line: breaking them would read worse than putting the
	// whole function on a line of its own
	if (shouldExpandParameters && !isDecoratedFunction(path)) {
		if (willBreak(printed)) {
			throw new ArgExpansionBailout();
		}
		return [group(['(', removeLines(printed), ')'])];
	}

	const hasNotParameterDecorator = parameters.every(
		(node) =>
			!(/** @type {AST.Identifier} */ (node).decorators) ||
			/** @type {AST.Identifier} */ (node).decorators.length === 0,
	);

	if ((shouldHugParameters && hasNotParameterDecorator) || isParametersInTestCall) {
		return ['(', ...printed, ')'];
	}

	return [
		'(',
		indent([softline, ...printed]),
		ifBreak(shouldPrintComma(options, 'all') && !hasRestParameter(functionNode) ? ',' : ''),
		softline,
		')',
	];
}

/**
 * Check whether the parameter list should be grouped separately from the return
 * type, so a breaking return type does not force the parameters to break too.
 * @param {AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction | AST.FunctionDeclaration} functionNode - The function node
 * @param {Doc} returnTypeDoc - The printed return type
 * @returns {boolean}
 */
function shouldGroupFunctionParameters(functionNode, returnTypeDoc) {
	const returnTypeNode = functionNode.returnType?.typeAnnotation;
	const typeParameters = functionNode.typeParameters?.params;
	if (typeParameters) {
		if (typeParameters.length > 1) {
			return false;
		}
		if (typeParameters.length === 1) {
			const typeParameter = typeParameters[0];
			if (typeParameter.constraint || typeParameter.default) {
				return false;
			}
		}
	}
	return (
		getFunctionParameters(functionNode).length === 1 &&
		(isObjectType(returnTypeNode) || willBreak(returnTypeDoc))
	);
}

/**
 * Print function parameters together with the return type as a single group, so
 * the fitter breaks the parameter list before type arguments nested in the
 * return type, matching vanilla prettier's signature layout.
 * @param {AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction | AST.FunctionDeclaration} node - The function node
 * @param {AstPath<AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction | AST.FunctionDeclaration>} path - The function path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [shouldExpandParameters] - Whether the function is a hugged
 * call argument, which keeps its parameters on one line
 * @returns {Doc}
 */
function printFunctionSignature(node, path, options, print, shouldExpandParameters = false) {
	const paramsPart = printFunctionParameters(path, options, print, shouldExpandParameters);
	if (!node.returnType) {
		return group(paramsPart);
	}
	/** @type {Doc[]} */
	const returnTypeDoc = [': ', path.call(print, 'returnType')];
	if (shouldGroupFunctionParameters(node, returnTypeDoc)) {
		return group([group(paramsPart), ...returnTypeDoc]);
	}
	return group([...paramsPart, ...returnTypeDoc]);
}

/**
 * Check if a node is a block-like function (function expression or arrow with block body)
 * @param {AST.Node} node - The AST node
 * @returns {boolean}
 */
function isBlockLikeFunction(node) {
	if (!node) {
		return false;
	}
	if (node.type === 'FunctionExpression') {
		return true;
	}
	if (node.type === 'ArrowFunctionExpression') {
		return isBlockBody(node.body);
	}
	return false;
}

/**
 * Whether an arrow body is a block: `{ … }`, or a TSRX `@{ … }` code block.
 * @param {AST.Node} body - The arrow body
 * @returns {boolean}
 */
function isBlockBody(body) {
	return body.type === 'BlockStatement' || body.type === 'JSXCodeBlock';
}

/**
 * Print call or new expression arguments, porting Prettier's
 * `printCallArguments`. A React hook call keeps its callback and dependency
 * array on the call's line, a leading function argument or an expandable last
 * argument hugs the parentheses, and anything else breaks every argument onto
 * its own line.
 * @param {AstPath<AST.CallExpression | AST.NewExpression>} path - The call or new expression path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printCallArguments(path, options, print) {
	const { node } = path;
	const parent = /** @type {AST.Node | null} */ (path.parent);
	const args = node.arguments || [];

	if (args.length === 0) {
		return '()';
	}

	const lastArgIndex = args.length - 1;
	/**
	 * Print options for an argument: block comments stay on the line of any
	 * argument but a block-like function
	 * @param {number} index
	 * @param {PrintArgs} [extra]
	 * @returns {PrintArgs | undefined}
	 */
	const argumentPrintArgs = (index, extra) =>
		isBlockLikeFunction(args[index]) ? extra : { isInlineContext: true, ...extra };
	/**
	 * @param {number} index
	 * @param {PrintArgs} [extra]
	 * @returns {Doc}
	 */
	const printArgument = (index, extra) =>
		path.call(
			(argumentPath) => {
				const printArgs = argumentPrintArgs(index, extra);
				return printArgs ? print(argumentPath, printArgs) : print(argumentPath);
			},
			'arguments',
			index,
		);

	// Like Prettier's `printCallExpression`, a test call, a `require` of one
	// module, an AMD module definition, and a call on one template literal that
	// starts on its line keep their arguments on the call's line
	if (
		(args.length === 1 &&
			isTemplateOnItsOwnLine(args[0], /** @type {string} */ (options.originalText))) ||
		isSimpleModuleImport(node) ||
		isCommonsJsOrAmdModuleDefinition(path) ||
		isTestCall(node, parent)
	) {
		return [
			'(',
			join(
				', ',
				args.map((_, index) => printArgument(index)),
			),
			')',
		];
	}

	// useEffect(() => { ... }, [foo, bar, baz])
	// useImperativeHandle(ref, () => { ... }, [foo, bar, baz])
	if (isReactHookCallWithDepsArray(args)) {
		return [
			'(',
			join(
				', ',
				args.map((_, index) => printArgument(index)),
			),
			')',
		];
	}

	let anyArgEmptyLine = false;
	/** @type {Doc[]} */
	const printedArguments = [];
	for (let index = 0; index < args.length; index++) {
		/** @type {Doc} */
		let argDoc = printArgument(index);
		if (index === lastArgIndex) {
			// The last argument takes no separator
		} else if (isNextLineEmpty(args[index], options)) {
			anyArgEmptyLine = true;
			argDoc = [argDoc, ',', hardline, hardline];
		} else {
			argDoc = [argDoc, ',', line];
		}
		printedArguments.push(argDoc);
	}

	const trailingComma = shouldPrintComma(options, 'all') ? ifBreak(',') : '';

	const allArgsBrokenOut = () =>
		group(['(', indent([line, ...printedArguments]), trailingComma, line, ')'], {
			shouldBreak: true,
		});

	if (anyArgEmptyLine || (parent?.type !== 'Decorator' && isFunctionCompositionArguments(args))) {
		return allArgsBrokenOut();
	}

	if (shouldExpandFirstArg(args)) {
		const tailArgs = printedArguments.slice(1);
		if (tailArgs.some(willBreak)) {
			return allArgsBrokenOut();
		}
		/** @type {Doc} */
		let firstArg;
		try {
			firstArg = printArgument(0, { expandFirstArg: true });
		} catch (error) {
			if (error instanceof ArgExpansionBailout) {
				return allArgsBrokenOut();
			}
			throw error;
		}

		// A hugged argument that breaks breaks the groups around the call too:
		// a break inside a conditionalGroup doesn't propagate
		if (willBreak(firstArg)) {
			return [
				breakParent,
				conditionalGroup([
					['(', group(firstArg, { shouldBreak: true }), ', ', ...tailArgs, ')'],
					allArgsBrokenOut(),
				]),
			];
		}

		return conditionalGroup([
			['(', firstArg, ', ', ...tailArgs, ')'],
			['(', group(firstArg, { shouldBreak: true }), ', ', ...tailArgs, ')'],
			allArgsBrokenOut(),
		]);
	}

	if (shouldExpandLastArg(args, options)) {
		const headArgs = printedArguments.slice(0, -1);
		if (headArgs.some(willBreak)) {
			return allArgsBrokenOut();
		}
		/** @type {Doc} */
		let lastArg;
		try {
			lastArg = printArgument(lastArgIndex, { expandLastArg: true });
		} catch (error) {
			if (error instanceof ArgExpansionBailout) {
				return allArgsBrokenOut();
			}
			throw error;
		}

		if (willBreak(lastArg)) {
			return [
				breakParent,
				conditionalGroup([
					['(', ...headArgs, group(lastArg, { shouldBreak: true }), ')'],
					allArgsBrokenOut(),
				]),
			];
		}

		return conditionalGroup([
			['(', ...headArgs, lastArg, ')'],
			['(', ...headArgs, group(lastArg, { shouldBreak: true }), ')'],
			allArgsBrokenOut(),
		]);
	}

	const contents = ['(', indent([softline, ...printedArguments]), trailingComma, softline, ')'];
	if (isLongCurriedCallExpression(path)) {
		// Without a group of their own, these arguments break before the
		// arguments of the call on this call
		return contents;
	}

	return group(contents, {
		shouldBreak: printedArguments.some(willBreak) || anyArgEmptyLine,
	});
}

/**
 * Whether a node is an identifier or a dotted member path (`a.b.c`, or
 * `import.meta.resolve`) that spells one of `paths`, like Prettier's
 * `isNodeMatches`.
 * @param {AST.Node} node
 * @param {string[]} paths
 * @returns {boolean}
 */
function isNodeMatches(node, paths) {
	return paths.some((path) => {
		const names = path.split('.');
		/** @type {AST.Node} */
		let current = node;
		for (let index = names.length - 1; index >= 0; index--) {
			const name = names[index];
			if (index === 0) {
				return current.type === 'Identifier' && current.name === name;
			}
			if (
				index === 1 &&
				current.type === 'MetaProperty' &&
				current.property.name === name &&
				current.meta.name === names[0]
			) {
				return true;
			}
			if (
				current.type !== 'MemberExpression' ||
				current.optional ||
				current.computed ||
				current.property.type !== 'Identifier' ||
				current.property.name !== name
			) {
				return false;
			}
			current = current.object;
		}
		return false;
	});
}

const TEST_CALL_CALLEES = [
	'it',
	'it.only',
	'it.skip',
	'describe',
	'describe.only',
	'describe.skip',
	'test',
	'test.only',
	'test.skip',
	'test.fixme',
	'test.step',
	'test.describe',
	'test.describe.only',
	'test.describe.skip',
	'test.describe.fixme',
	'test.describe.parallel',
	'test.describe.parallel.only',
	'test.describe.serial',
	'test.describe.serial.only',
	'skip',
	'xit',
	'xdescribe',
	'xtest',
	'fit',
	'fdescribe',
	'ftest',
];

/**
 * Prettier's `isTestCall`: `it("name", () => { … })` and the like, whose
 * arguments and parameters stay on the call's line.
 * @param {AST.Node | null | undefined} node
 * @param {AST.Node | null} [parent]
 * @returns {boolean}
 */
function isTestCall(node, parent) {
	if (node?.type !== 'CallExpression' || node.optional) {
		return false;
	}
	const args = node.arguments;
	/** @param {AST.Node} arg */
	const isAngularTestWrapper = (arg) =>
		arg.type === 'CallExpression' &&
		arg.callee.type === 'Identifier' &&
		['async', 'inject', 'fakeAsync', 'waitForAsync'].includes(arg.callee.name);
	/** @param {AST.Node} arg */
	const isFunction = (arg) =>
		arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression';

	if (args.length === 1) {
		if (isAngularTestWrapper(node) && isTestCall(parent)) {
			return isFunction(args[0]);
		}
		const { callee } = node;
		if (
			callee.type === 'Identifier' &&
			['beforeEach', 'beforeAll', 'afterEach', 'afterAll'].includes(callee.name)
		) {
			return isAngularTestWrapper(args[0]);
		}
	} else if (
		(args.length === 2 || args.length === 3) &&
		(args[0].type === 'TemplateLiteral' || isStringLiteral(args[0])) &&
		isNodeMatches(node.callee, TEST_CALL_CALLEES)
	) {
		// it("name", () => { ... }, 2500)
		if (args[2] && !isNumericLiteral(args[2])) {
			return false;
		}
		return (
			(args.length === 2
				? isFunction(args[1])
				: isBlockLikeFunction(args[1]) &&
					getFunctionParameters(
						/** @type {AST.ArrowFunctionExpression | AST.FunctionExpression} */ (args[1]),
					).length <= 1) || isAngularTestWrapper(args[1])
		);
	}
	return false;
}

/**
 * Prettier's `isSimpleModuleImport`: `require("…")`, `require.resolve("…")`,
 * and the like with one string argument.
 * @param {AST.CallExpression | AST.NewExpression} node
 * @returns {boolean}
 */
function isSimpleModuleImport(node) {
	return (
		node.type === 'CallExpression' &&
		!node.optional &&
		isNodeMatches(node.callee, [
			'require',
			'require.resolve',
			'require.resolve.paths',
			'import.meta.resolve',
		]) &&
		node.arguments.length === 1 &&
		isStringLiteral(node.arguments[0]) &&
		!hasComment(node.arguments[0])
	);
}

/**
 * Prettier's `isCommonsJsOrAmdModuleDefinition`: an AMD `require([…], …)`
 * call, or a `define(…)` statement.
 * @param {AstPath<AST.CallExpression | AST.NewExpression>} path
 * @returns {boolean}
 */
function isCommonsJsOrAmdModuleDefinition(path) {
	const { node } = path;
	if (node.type !== 'CallExpression' || node.optional || node.callee.type !== 'Identifier') {
		return false;
	}
	const args = node.arguments;
	if (node.callee.name === 'require') {
		return (
			((args.length === 1 && isStringLiteral(args[0])) || args.length > 1) && !hasComment(args[0])
		);
	}
	if (
		node.callee.name === 'define' &&
		/** @type {AST.Node | null} */ (path.parent)?.type === 'ExpressionStatement'
	) {
		return (
			args.length === 1 ||
			(args.length === 2 && args[0].type === 'ArrayExpression') ||
			(args.length === 3 && isStringLiteral(args[0]) && args[1].type === 'ArrayExpression')
		);
	}
	return false;
}

/**
 * Prettier's `isFunctionCompositionArguments`: arguments with more than one
 * function, or a function inside a call argument next to another argument, as
 * in `source.pipe(map((x) => x + x), filter((x) => x > 1))`, print one per
 * line.
 * @param {AST.Node[]} args - The call arguments
 * @returns {boolean}
 */
function isFunctionCompositionArguments(args) {
	if (args.length <= 1) {
		return false;
	}
	let count = 0;
	for (const arg of args) {
		if (arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression') {
			count += 1;
			if (count > 1) {
				return true;
			}
		} else {
			const inner = stripChainElementWrappers(arg);
			if (
				inner.type === 'CallExpression' &&
				inner.arguments.some(
					(childArg) =>
						childArg.type === 'FunctionExpression' || childArg.type === 'ArrowFunctionExpression',
				)
			) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Prettier's `isLongCurriedCallExpression`: the callee call of `connect(a, b,
 * c)(d)`, which has more arguments than the call on it.
 * @param {AstPath} path - The path to the call
 * @returns {boolean}
 */
function isLongCurriedCallExpression(path) {
	const { node, parent, key } = path;
	return (
		key === 'callee' &&
		node.type === 'CallExpression' &&
		parent?.type === 'CallExpression' &&
		parent.arguments.length > 0 &&
		node.arguments.length > parent.arguments.length
	);
}

/**
 * Skip the `ChainExpression` and non-null wrappers around a chain element.
 * @param {AST.Node} node
 * @returns {AST.Node}
 */
function stripChainElementWrappers(node) {
	while (node.type === 'ChainExpression' || node.type === 'TSNonNullExpression') {
		node = node.expression;
	}
	return node;
}

/**
 * Prettier's `couldExpandArg`: an argument that can break right after its
 * first token, so a call can keep it on its own line: a non-empty object or
 * array literal (also inside a cast), a function, or an arrow whose body can.
 * @param {AST.Node} arg - The argument
 * @param {boolean} [arrowChainRecursion] - Whether `arg` is the body of an arrow
 * @returns {boolean}
 */
function couldExpandArg(arg, arrowChainRecursion = false) {
	if (arg.type === 'ObjectExpression' && (arg.properties.length > 0 || hasComment(arg))) {
		return true;
	}

	if (arg.type === 'ArrayExpression' && (arg.elements.length > 0 || hasComment(arg))) {
		return true;
	}

	if (
		(isCastExpression(arg) || arg.type === 'TSTypeAssertion') &&
		couldExpandArg(/** @type {AST.TSAsExpression} */ (arg).expression)
	) {
		return true;
	}

	if (arg.type === 'FunctionExpression') {
		return true;
	}

	if (arg.type === 'ArrowFunctionExpression') {
		const { body } = arg;
		if (isBlockBody(body) || body.type === 'ObjectExpression' || body.type === 'ArrayExpression') {
			return true;
		}

		if (body.type === 'ArrowFunctionExpression' && couldExpandArg(body, true)) {
			return true;
		}

		if (!arrowChainRecursion) {
			if (body.type === 'ConditionalExpression') {
				return true;
			}
			if (stripChainElementWrappers(body).type === 'CallExpression') {
				return true;
			}
		}
	}

	return false;
}

/**
 * Prettier's `shouldExpandLastArg`: whether the last argument hugs the
 * parentheses.
 * @param {AST.Node[]} args - The call arguments
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function shouldExpandLastArg(args, options) {
	const lastArg = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (args[args.length - 1]);
	const penultimateArg = args.length > 1 ? args[args.length - 2] : null;
	return (
		!lastArg.leadingComments?.length &&
		!lastArg.trailingComments?.length &&
		couldExpandArg(lastArg) &&
		// If the last two arguments are of the same type, disallow last element expansion
		(!penultimateArg || penultimateArg.type !== lastArg.type) &&
		// useMemo(() => func(), [foo, bar, baz])
		(args.length !== 2 ||
			penultimateArg?.type !== 'ArrowFunctionExpression' ||
			lastArg.type !== 'ArrayExpression') &&
		!(
			args.length > 1 &&
			lastArg.type === 'ArrayExpression' &&
			isConciselyPrintedArray(lastArg, options)
		)
	);
}

/**
 * Prettier's `shouldExpandFirstArg`: a function followed by one short argument
 * that can't expand, as in `setTimeout(() => { … }, 500)`, hugs the
 * parentheses.
 * @param {AST.Node[]} args - The call arguments
 * @returns {boolean}
 */
function shouldExpandFirstArg(args) {
	if (args.length !== 2) {
		return false;
	}
	const [firstArg, secondArg] = args;
	return (
		!hasComment(firstArg) &&
		(firstArg.type === 'FunctionExpression' ||
			(firstArg.type === 'ArrowFunctionExpression' && isBlockBody(firstArg.body))) &&
		secondArg.type !== 'FunctionExpression' &&
		secondArg.type !== 'ArrowFunctionExpression' &&
		secondArg.type !== 'ConditionalExpression' &&
		isHopefullyShortCallArgument(secondArg) &&
		!couldExpandArg(secondArg)
	);
}

/**
 * Prettier's `isHopefullyShortCallArgument`: an argument after a hugged first
 * argument that likely stays short.
 * @param {AST.Node} node - The argument
 * @returns {boolean}
 */
function isHopefullyShortCallArgument(node) {
	if (isCastExpression(node)) {
		const cast = /** @type {AST.TSAsExpression} */ (node);
		/** @type {AST.Node} */
		let typeAnnotation = cast.typeAnnotation;
		if (typeAnnotation.type === 'TSArrayType') {
			typeAnnotation = typeAnnotation.elementType;
			if (typeAnnotation.type === 'TSArrayType') {
				typeAnnotation = typeAnnotation.elementType;
			}
		}
		const typeArgs = getTypeReferenceArguments(typeAnnotation);
		if (typeArgs?.length === 1) {
			typeAnnotation = typeArgs[0];
		}
		return isSimpleType(typeAnnotation) && isSimpleCallArgument(cast.expression, 1);
	}

	if (isCallLikeExpression(node) && getCallArgumentCount(node) > 1) {
		return false;
	}

	if (isBinaryish(node)) {
		return isSimpleCallArgument(node.left, 1) && isSimpleCallArgument(node.right, 1);
	}

	return isRegExpLiteral(node) || isSimpleCallArgument(node);
}

/**
 * The number of arguments of a call, `new`, or `import()`.
 * @param {AST.Node} node
 * @returns {number}
 */
function getCallArgumentCount(node) {
	if (node.type === 'ImportExpression') {
		return node.options ? 2 : 1;
	}
	return /** @type {AST.CallExpression} */ (node).arguments.length;
}

/**
 * Prettier's `isSimpleType`: a keyword type, a literal type, or a type
 * reference without type arguments.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isSimpleType(node) {
	return (
		(node.type.startsWith('TS') && node.type.endsWith('Keyword')) ||
		node.type === 'TSThisType' ||
		node.type === 'TSLiteralType' ||
		/** @type {string} */ (node.type) === 'TSTemplateLiteralType' ||
		(node.type === 'TSTypeReference' && getTypeReferenceArguments(node) === undefined)
	);
}

/**
 * Prettier's `isSimpleCallArgument`: a literal, a name, or a short object,
 * array, template, member, or call made of those, up to `depth` levels deep.
 * @param {AST.Node} node
 * @param {number} [depth]
 * @returns {boolean}
 */
function isSimpleCallArgument(node, depth = 2) {
	if (depth <= 0) {
		return false;
	}

	const isChildSimple = (/** @type {AST.Node | null} */ child) =>
		child === null || isSimpleCallArgument(child, depth - 1);

	node = stripChainElementWrappers(node);

	if (isRegExpLiteral(node)) {
		return /** @type {AST.RegExpLiteral} */ (node).regex.pattern.length <= 5;
	}

	if (
		node.type === 'Literal' ||
		node.type === 'Identifier' ||
		node.type === 'ThisExpression' ||
		node.type === 'Super' ||
		node.type === 'PrivateIdentifier'
	) {
		return true;
	}

	if (node.type === 'TemplateLiteral') {
		return (
			node.quasis.every((element) => !element.value.raw.includes('\n')) &&
			node.expressions.every(isChildSimple)
		);
	}

	if (node.type === 'ObjectExpression') {
		return node.properties.every(
			(property) =>
				property.type === 'Property' &&
				!property.computed &&
				(property.shorthand || (property.value && isChildSimple(property.value))),
		);
	}

	if (node.type === 'ArrayExpression') {
		return node.elements.every(isChildSimple);
	}

	if (isCallLikeExpression(node)) {
		if (node.type === 'ImportExpression') {
			return isChildSimple(node.source) && (!node.options || isChildSimple(node.options));
		}
		const call = /** @type {AST.CallExpression} */ (node);
		return (
			isSimpleCallArgument(call.callee, depth) &&
			call.arguments.length <= depth &&
			call.arguments.every(isChildSimple)
		);
	}

	if (node.type === 'MemberExpression') {
		return isSimpleCallArgument(node.object, depth) && isSimpleCallArgument(node.property, depth);
	}

	if (
		(node.type === 'UnaryExpression' && ['!', '-', '+', '~'].includes(node.operator)) ||
		node.type === 'UpdateExpression'
	) {
		return isSimpleCallArgument(node.argument, depth);
	}

	return false;
}

/**
 * Prettier's `isReactHookCallWithDepsArray`: a parameterless block-bodied
 * arrow followed by a dependency array, after at most one identifier. The call
 * keeps both on its line and lets the array break by itself.
 * @param {AST.Node[]} args - The call arguments
 * @returns {boolean}
 */
function isReactHookCallWithDepsArray(args) {
	/** @param {number} baseIndex */
	const isValidHookCallbackAndDepsFormat = (baseIndex) => {
		const maybeArrowFunction = args[baseIndex];
		const maybeDepsArray = args[baseIndex + 1];
		return (
			maybeArrowFunction.type === 'ArrowFunctionExpression' &&
			getFunctionParameters(maybeArrowFunction).length === 0 &&
			maybeArrowFunction.body.type === 'BlockStatement' &&
			maybeDepsArray.type === 'ArrayExpression' &&
			args.every((arg) => !hasComment(arg))
		);
	};
	if (args.length === 2) {
		return isValidHookCallbackAndDepsFormat(0);
	}
	if (args.length === 3) {
		return args[0].type === 'Identifier' && isValidHookCallbackAndDepsFormat(1);
	}
	return false;
}

/**
 * Print TSDeclareFunction (TypeScript function overload declaration)
 * These are function signatures without bodies, ending with semicolon
 * @param {AST.TSDeclareFunction} node - The TS function declaration node
 * @param {AstPath<AST.TSDeclareFunction>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSDeclareFunction(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// Handle declare modifier for ambient declarations
	if (node.declare) {
		parts.push('declare ');
	}

	// Handle async functions
	if (node.async) {
		parts.push('async ');
	}

	parts.push('function');

	// Handle generator functions
	if (node.generator) {
		parts.push('*');
	}

	// Handle function name (may be null for anonymous default exports)
	if (node.id) {
		parts.push(' ');
		parts.push(node.id.name);
	}

	// Add TypeScript generics if present
	if (node.typeParameters) {
		const typeParams = path.call(print, 'typeParameters');
		if (Array.isArray(typeParams)) {
			parts.push(...typeParams);
		} else {
			parts.push(typeParams);
		}
	}

	// Print parameters and return type as a single group
	parts.push(printFunctionSignature(node, path, options, print));

	// TSDeclareFunction ends with semicolon, no body
	parts.push(';');

	return parts;
}

/**
 * Print a function declaration
 * @param {AST.FunctionDeclaration} node - The function declaration node
 * @param {AstPath<AST.FunctionDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printFunctionDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// Handle async functions
	if (node.async) {
		parts.push('async ');
	}

	parts.push('function');

	// Handle generator functions
	if (node.generator) {
		parts.push('*');
	}

	parts.push(' ');

	// `export default function () {}` is an anonymous FunctionDeclaration, the
	// one position where the name is optional. The space stays either way, so
	// the parameter list is not glued to the keyword.
	if (node.id) {
		parts.push(node.id.name);
	}

	// Add TypeScript generics if present
	if (node.typeParameters) {
		const typeParams = path.call(print, 'typeParameters');
		if (Array.isArray(typeParams)) {
			parts.push(...typeParams);
		} else {
			parts.push(typeParams);
		}
	}

	// Print parameters and return type as a single group
	parts.push(printFunctionSignature(node, path, options, print));

	parts.push(' ');
	parts.push(path.call(print, 'body'));

	return parts;
}

/**
 * Extract and print leading comments from a node before a control flow statement keyword
 * @param {AST.Node} node - The node that may have leading comments
 * @returns {Doc[]} - Array of doc parts for the comments
 */
function extractAndPrintLeadingComments(node) {
	const leadingComments = node && node.leadingComments;
	/** @type {Doc[]} */
	const parts = [];

	if (leadingComments && leadingComments.length > 0) {
		for (let i = 0; i < leadingComments.length; i++) {
			const comment = leadingComments[i];
			const nextComment = leadingComments[i + 1];

			if (comment.type === 'Line') {
				parts.push('//' + comment.value);
				parts.push(hardline);

				// Check if there should be blank lines between comments
				if (nextComment) {
					const blankLinesBetween = getBlankLinesBetweenNodes(comment, nextComment);
					if (blankLinesBetween > 0) {
						parts.push(hardline);
					}
				}
			} else if (comment.type === 'Block') {
				parts.push('/*' + comment.value + '*/');
				parts.push(hardline);

				// Check if there should be blank lines between comments
				if (nextComment) {
					const blankLinesBetween = getBlankLinesBetweenNodes(comment, nextComment);
					if (blankLinesBetween > 0) {
						parts.push(hardline);
					}
				}
			}
		}
	}

	return parts;
}

/**
 * Print a loop, `if` or label body after its header. An empty statement body
 * prints as `;` against the header, as Prettier does: printing nothing would
 * make the next statement the body.
 * @param {AST.Statement} body - The body statement
 * @param {Doc} bodyDoc - The printed body
 * @returns {Doc}
 */
function printClause(body, bodyDoc) {
	return body.type === 'EmptyStatement' ? [bodyDoc, ';'] : [' ', bodyDoc];
}

/**
 * Print an if statement
 * @param {AST.IfStatement} node - The if statement node
 * @param {AstPath<AST.IfStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [directive]
 * @returns {Doc[]}
 */
function printIfStatement(node, path, options, print, directive = false) {
	// Extract leading comments from test node to print them before 'if' keyword
	const testNode = node.test;

	// Print test without its leading comments (they'll be printed before 'if')
	const test = path.call((testPath) => print(testPath, { suppressLeadingComments: true }), 'test');
	const consequent = path.call(print, 'consequent');

	// Use group to allow breaking the test when it doesn't fit
	const testDoc = group(['if (', indent([softline, test]), softline, ')']);

	// Check if consequent is a block statement or another if statement
	const consequentIsBlock = node.consequent.type === 'BlockStatement';
	const consequentIsIf = node.consequent.type === 'IfStatement';

	/** @type {Doc[]} */
	const parts = [];

	// Print leading comments from test node before 'if' keyword
	parts.push(...extractAndPrintLeadingComments(testNode));

	parts.push(testDoc);

	// Handle the consequent
	if (consequentIsIf) {
		// For nested if statements, add a line break and indent
		parts.push(indent([hardline, consequent]));
	} else {
		parts.push(printClause(node.consequent, consequent));
	}

	// Handle the alternate
	if (node.alternate) {
		// If consequent is not a block, add a hardline before else
		if (!consequentIsBlock) {
			parts.push(hardline);
		} else {
			parts.push(' ');
		}

		parts.push(directive ? '@else' : 'else');
		if (directive && node.alternate.type === 'IfStatement') {
			parts.push(
				' ',
				path.call(
					(alternatePath) =>
						printIfStatement(
							/** @type {AST.IfStatement} */ (alternatePath.node),
							/** @type {AstPath<AST.IfStatement>} */ (alternatePath),
							options,
							print,
							true,
						),
					'alternate',
				),
			);
		} else {
			parts.push(printClause(node.alternate, path.call(print, 'alternate')));
		}
	}

	return parts;
}

/**
 * Print a for-in statement
 * @param {AST.ForInStatement} node - The for-in statement node
 * @param {AstPath<AST.ForInStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printForInStatement(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('for (');
	parts.push(path.call(print, 'left'));
	parts.push(' in ');
	parts.push(path.call(print, 'right'));

	parts.push(')', printClause(node.body, path.call(print, 'body')));

	return parts;
}

/**
 * Print a for-of statement (with TSRX index/key extensions)
 * @param {AST.ForOfStatement} node - The for-of statement node
 * @param {AstPath<AST.ForOfStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [directive]
 * @returns {Doc[]}
 */
function printForOfStatement(node, path, options, print, directive = false) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('for (');
	parts.push(path.call(print, 'left'));
	parts.push(' of ');
	parts.push(path.call(print, 'right'));

	// Handle TSRX-specific index syntax
	if (node.index) {
		parts.push('; index ');
		parts.push(path.call(print, 'index'));
	}

	if (node.key) {
		parts.push('; key ');
		parts.push(path.call(print, 'key'));
	}

	parts.push(')', printClause(node.body, path.call(print, 'body')));
	if (node.empty) {
		parts.push(directive ? ' @empty ' : ' empty ');
		parts.push(path.call(print, 'empty'));
	}

	return parts;
}

/**
 * Print a for statement
 * @param {AST.ForStatement} node - The for statement node
 * @param {AstPath<AST.ForStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printForStatement(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('for (');

	// Handle init part
	if (node.init) {
		parts.push(path.call(print, 'init'));
	}
	parts.push(';');

	// Handle test part
	if (node.test) {
		parts.push(' ');
		parts.push(path.call(print, 'test'));
	}
	parts.push(';');

	// Handle update part
	if (node.update) {
		parts.push(' ');
		parts.push(path.call(print, 'update'));
	}

	parts.push(')', printClause(node.body, path.call(print, 'body')));

	return parts;
}

/**
 * Print a while statement
 * @param {AST.WhileStatement} node - The while statement node
 * @param {AstPath<AST.WhileStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printWhileStatement(node, path, options, print) {
	// Extract leading comments from test node to print them before 'while' keyword
	const testNode = node.test;

	// Print test without its leading comments (they'll be printed before 'while')
	const test = path.call((testPath) => print(testPath, { suppressLeadingComments: true }), 'test');

	/** @type {Doc[]} */
	const parts = [];

	// Print leading comments from test node before 'while' keyword
	parts.push(...extractAndPrintLeadingComments(testNode));

	parts.push('while (');
	parts.push(test);
	parts.push(')', printClause(node.body, path.call(print, 'body')));

	return parts;
}

/**
 * Print a do-while statement
 * @param {AST.DoWhileStatement} node - The do-while statement node
 * @param {AstPath<AST.DoWhileStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printDoWhileStatement(node, path, options, print) {
	// Extract leading comments from test node to print them before 'while' keyword
	const testNode = node.test;

	// Print test without its leading comments (they'll be printed before 'while')
	const test = path.call((testPath) => print(testPath, { suppressLeadingComments: true }), 'test');

	/** @type {Doc[]} */
	const parts = [];
	parts.push('do', printClause(node.body, path.call(print, 'body')));
	// Like Prettier, only a block body keeps `while` on its closing line
	parts.push(node.body.type === 'BlockStatement' ? ' ' : hardline);

	// Print leading comments from test node before 'while' keyword
	parts.push(...extractAndPrintLeadingComments(testNode));

	parts.push('while (');
	parts.push(test);
	parts.push(')');
	parts.push(semi(options));

	return parts;
}

/**
 * Print an object expression
 * @param {AST.ObjectExpression} node - The object expression node
 * @param {AstPath<AST.ObjectExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printObjectExpression(node, path, options, print) {
	const open_brace = '{';
	const close_brace = '}';
	const skip_offset = 1;
	const closing_offset = 1;

	if (!node.properties || node.properties.length === 0) {
		return open_brace + close_brace;
	}

	// Check if there are blank lines between any properties
	let hasBlankLinesBetweenProperties = false;
	for (let i = 0; i < node.properties.length - 1; i++) {
		const current = node.properties[i];
		const next = node.properties[i + 1];
		if (current && next && getBlankLinesBetweenNodes(current, next) > 0) {
			hasBlankLinesBetweenProperties = true;
			break;
		}
	}

	// Check if object was originally multi-line
	let isOriginallyMultiLine = false;
	if (node.loc && node.loc.start && node.loc.end) {
		isOriginallyMultiLine = node.loc.start.line !== node.loc.end.line;
	}

	// Also check for blank lines at edges (after { or before })
	// If the original code has blank lines anywhere in the object, format multi-line
	let hasAnyBlankLines = hasBlankLinesBetweenProperties;
	if (!hasAnyBlankLines && node.properties.length > 0 && options.originalText) {
		const firstProp = node.properties[0];
		const lastProp = node.properties[node.properties.length - 1];

		// Check for blank line after opening brace (before first property)
		if (firstProp && firstProp.loc && node.loc && node.loc.start) {
			hasAnyBlankLines =
				getBlankLinesBetweenPositions(
					/** @type {acorn.Position} */ (node.loc.start).offset(skip_offset),
					firstProp.loc.start,
				) > 0;
		}

		// Check for blank line before closing brace (after last property)
		if (!hasAnyBlankLines && lastProp && lastProp.loc && node.loc && node.loc.end) {
			hasAnyBlankLines =
				getBlankLinesBetweenPositions(
					lastProp.loc.end,
					/** @type {acorn.Position} */ (node.loc.end).offset(-closing_offset),
				) > 0; // Skip closing delimiter(s): either '}' or '})'.
		}
	}

	// Use AST builders and respect trailing commas
	const properties = path.map(print, 'properties');
	const shouldUseTrailingComma = options.trailingComma !== 'none' && properties.length > 0;

	// For objects that were originally inline (single-line) and don't have blank lines,
	// allow inline formatting if it fits printWidth
	// This handles cases like `const T0: t17 = { x: 1 };` staying inline when it fits
	// The group() will automatically break to multi-line if it doesn't fit
	if (!hasAnyBlankLines && !isOriginallyMultiLine) {
		const separator = [',', line];
		const propertyDoc = join(separator, properties);
		const spacing = options.bracketSpacing === false ? softline : line;
		const trailingDoc = shouldUseTrailingComma ? ifBreak(',', '') : '';

		return group([open_brace, indent([spacing, propertyDoc, trailingDoc]), spacing, close_brace]);
	}

	/** @type {Doc[]} */
	let content = [hardline];
	if (properties.length > 0) {
		// Build properties with blank line preservation
		/** @type {Doc[]} */
		const propertyParts = [];
		for (let i = 0; i < properties.length; i++) {
			if (i > 0) {
				propertyParts.push(',');

				// Check for blank lines between properties and preserve them
				// Need to account for trailing comments on previous property and
				// leading comments on current property
				const prevProp = node.properties[i - 1];
				const currentProp = node.properties[i];

				// Determine the source node (end of previous property or its trailing comments)
				/** @type {AST.Property | AST.SpreadElement | AST.Comment} */
				let sourceNode = prevProp;
				if (prevProp && prevProp.trailingComments && prevProp.trailingComments.length > 0) {
					sourceNode = prevProp.trailingComments[prevProp.trailingComments.length - 1];
				}

				// Determine the target node (start of current property or its leading comments)
				/** @type {AST.Property | AST.SpreadElement | AST.Comment} */
				let targetNode = currentProp;
				if (currentProp && currentProp.leadingComments && currentProp.leadingComments.length > 0) {
					targetNode = currentProp.leadingComments[0];
				}

				if (sourceNode && targetNode && getBlankLinesBetweenNodes(sourceNode, targetNode) > 0) {
					propertyParts.push(hardline);
					propertyParts.push(hardline); // Two hardlines = blank line
				} else {
					propertyParts.push(hardline);
				}
			}
			propertyParts.push(properties[i]);
		}

		content.push(...propertyParts);
		if (shouldUseTrailingComma) {
			content.push(',');
		}
		content.push(hardline);
	}

	return group([
		open_brace,
		indent(content.slice(0, -1)),
		content[content.length - 1],
		close_brace,
	]);
}

/**
 * Print a class declaration
 * @param {AST.ClassDeclaration | AST.ClassExpression} node - The class node
 * @param {AstPath<AST.ClassDeclaration | AST.ClassExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printClassDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// Ambient/abstract markers change what the class is, so they must survive
	if (node.declare) {
		parts.push('declare ');
	}

	if (node.abstract) {
		parts.push('abstract ');
	}

	parts.push('class');

	// Class name (optional for ClassExpression)
	if (node.id) {
		parts.push(' ');
		parts.push(node.id.name);
	}

	// Add TypeScript generics if present
	if (node.typeParameters) {
		const typeParams = path.call(print, 'typeParameters');
		if (Array.isArray(typeParams)) {
			parts.push(...typeParams);
		} else {
			parts.push(typeParams);
		}
	}

	if (node.superClass) {
		parts.push(' extends ');
		if (superClassNeedsParens(node.superClass)) {
			// The class owns these parens, so the superclass must not add its own
			const superClass = path.call(
				(superPath) => print(superPath, { suppressOwnParens: true }),
				'superClass',
			);
			if (getDecorators(node.superClass).length > 0) {
				// Each decorator prints on its own line, so the class is indented
				// inside the parens to keep them off column zero.
				parts.push('(', indent([hardline, superClass]), hardline, ')');
			} else {
				parts.push('(', superClass, ')');
			}
		} else {
			parts.push(path.call(print, 'superClass'));
		}
		if (node.superTypeParameters) {
			parts.push(path.call(print, 'superTypeParameters'));
		}
	}

	// Heritage type arguments and implements clauses are what TypeScript
	// checks the class against, so dropping them silently loses those checks
	if (node.implements && node.implements.length > 0) {
		parts.push(' implements ');
		parts.push(join(', ', path.map(print, 'implements')));
	}

	parts.push(' ');
	parts.push(path.call(print, 'body'));

	return parts;
}

/**
 * Print a try statement (with TSRX pending block extension)
 * @param {AST.TryStatement} node - The try statement node
 * @param {AstPath<AST.TryStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [directive=false] - Whether this is a JSX @try expression.
 * @returns {Doc[]}
 */
function printTryStatement(node, path, options, print, directive = false) {
	// Extract leading comments from block node to print them before 'try' keyword
	const blockNode = node.block;

	// Print block without its leading comments (they'll be printed before 'try')
	const block = path.call(
		(blockPath) => print(blockPath, { suppressLeadingComments: true }),
		'block',
	);

	/** @type {Doc[]} */
	const parts = [];

	// Print leading comments from block node before 'try' keyword
	parts.push(...extractAndPrintLeadingComments(blockNode));

	parts.push('try ');
	parts.push(block);

	if (node.pending) {
		parts.push(directive ? ' @pending ' : ' pending ');
		parts.push(path.call(print, 'pending'));
	}

	if (node.handler) {
		parts.push(directive ? ' @catch' : ' catch');
		if (node.handler.param) {
			parts.push(' (');
			parts.push(path.call(print, 'handler', 'param'));
			if (node.handler.resetParam) {
				parts.push(', ');
				parts.push(path.call(print, 'handler', 'resetParam'));
			}
			parts.push(')');
		}
		parts.push(' ');
		parts.push(path.call(print, 'handler', 'body'));
	}

	if (node.finalizer) {
		parts.push(' finally ');
		parts.push(path.call(print, 'finalizer'));
	}

	return parts;
}

/**
 * Print a class body
 * @param {AST.ClassBody} node - The class body node
 * @param {AstPath<AST.ClassBody>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printClassBody(node, path, options, print) {
	if (!node.body || node.body.length === 0) {
		return '{}';
	}

	const members = path.map(print, 'body');

	// Build content with proper blank line handling
	const contentParts = [];
	for (let i = 0; i < members.length; i++) {
		if (i > 0) {
			// Check if we should add a blank line between members
			const prevNode = node.body[i - 1];
			const currNode = node.body[i];
			if (shouldAddBlankLine(prevNode, currNode, options)) {
				contentParts.push(line);
			}
		}
		contentParts.push(line);
		contentParts.push(members[i]);
		if (options.semi === false && needsClassPropertySemicolon(node.body[i], node.body[i + 1])) {
			contentParts.push(';');
		}
	}

	// Without semicolons only a line break ends a field, an index signature or
	// a bodiless method, so a class with one before another member can't
	// collapse onto a single line
	const shouldBreak =
		options.semi === false &&
		node.body.some(
			(member, i) =>
				i < node.body.length - 1 &&
				member.type !== 'StaticBlock' &&
				!(member.type === 'MethodDefinition' && member.value.body),
		);

	return group(['{', indent(contentParts), line, '}'], { shouldBreak });
}

/**
 * Whether a class field printed without semicolons still needs one, because
 * the next member would otherwise continue its value or type (`x = a` then
 * `[k] = 1` reads as `x = a[k] = 1`) or a bare `static`, `get` or `set` field
 * would become that member's modifier. Mirrors Prettier's
 * shouldPrintSemicolonAfterClassProperty.
 * @param {AST.Node} node - The member just printed
 * @param {AST.Node | undefined} next - The member after it
 * @returns {boolean}
 */
function needsClassPropertySemicolon(node, next) {
	if (node.type !== 'PropertyDefinition' || !next) {
		return false;
	}

	// Only these keywords modify a member on the next line; `readonly`,
	// `declare`, `async` and the rest must share its line
	const name = getPrintedKeyName(node);
	if (
		!node.value &&
		!node.typeAnnotation &&
		(name === 'static' || name === 'get' || name === 'set')
	) {
		return true;
	}

	// Unless a modifier leads, its `[` would index the field's value
	if (next.type === 'TSIndexSignature') {
		return !next.static && !next.readonly;
	}

	// `static { ... }` starts with a keyword
	if (next.type !== 'PropertyDefinition' && next.type !== 'MethodDefinition') {
		return false;
	}

	// So does a member led by a modifier, and a keyword can't continue the field
	if (
		next.static ||
		next.accessibility ||
		next.abstract ||
		next.override ||
		(next.type === 'PropertyDefinition' && (next.readonly || next.declare || next.accessor)) ||
		(next.type === 'MethodDefinition' &&
			(next.value.async || next.kind === 'get' || next.kind === 'set'))
	) {
		return false;
	}

	// `in` and `instanceof` read as operators on the field's value
	const nextName = getPrintedKeyName(next);
	if (nextName === 'in' || nextName === 'instanceof') {
		return true;
	}

	// `[` indexes the field's value and `*` multiplies it
	return next.computed || (next.type === 'MethodDefinition' && next.value.generator === true);
}

/**
 * The name a class member's key prints as. printKey unquotes string keys that
 * are valid identifiers, so `"static"` prints as `static` and parses as one.
 * @param {AST.PropertyDefinition | AST.MethodDefinition} member - The class member
 * @returns {string | null} The name, or null for computed and non-name keys
 */
function getPrintedKeyName(member) {
	if (member.computed) {
		return null;
	}
	if (member.key.type === 'Identifier') {
		return member.key.name;
	}
	if (member.key.type === 'Literal' && typeof member.key.value === 'string') {
		return member.key.value;
	}
	return null;
}

/**
 * Print a class property definition
 * @param {AST.PropertyDefinition} node - The property definition node
 * @param {AstPath<AST.PropertyDefinition>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printPropertyDefinition(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// `declare` must lead the modifier list
	if (node.declare) {
		parts.push('declare ');
	}

	// Access modifiers (public, private, protected)
	if (node.accessibility) {
		parts.push(node.accessibility);
		parts.push(' ');
	}

	// Static keyword
	if (node.static) {
		parts.push('static ');
	}

	// Abstract / override keywords
	if (node.abstract) {
		parts.push('abstract ');
	}

	if (node.override) {
		parts.push('override ');
	}

	// Readonly keyword
	if (node.readonly) {
		parts.push('readonly ');
	}

	// `accessor` turns the field into a getter/setter pair — not decoration
	if (node.accessor) {
		parts.push('accessor ');
	}

	// Property name. Must go through printKey so a computed key keeps its
	// brackets — `[key] = 1` and `key = 1` name different fields.
	parts.push(...printKey(node, path, options, print));

	// Optional marker
	if (node.optional) {
		parts.push('?');
	}

	// Definite-assignment assertion (`value!: T`) — dropping it makes TS
	// report the field as unassigned under strictPropertyInitialization
	if (node.definite) {
		parts.push('!');
	}

	// Type annotation
	if (node.typeAnnotation) {
		parts.push(': ');
		parts.push(path.call(print, 'typeAnnotation'));
	}

	return [printAssignment(path, options, print, parts, ' =', 'value'), semi(options)];
}

/**
 * Print a method definition
 * @param {AST.MethodDefinition} node - The method definition node
 * @param {AstPath<AST.MethodDefinition>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printMethodDefinition(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// Access modifiers (public, private, protected)
	if (node.accessibility) {
		parts.push(node.accessibility);
		parts.push(' ');
	}

	// Static keyword
	if (node.static) {
		parts.push('static ');
	}

	// Abstract / override keywords
	if (node.abstract) {
		parts.push('abstract ');
	}

	if (node.override) {
		parts.push('override ');
	}

	// Method kind and name
	if (node.kind === 'constructor') {
		// skip as it's covered by the key
	} else if (node.kind === 'get') {
		parts.push('get ');
	} else if (node.kind === 'set') {
		parts.push('set ');
	}

	// Async keyword
	if (node.value && node.value.async) {
		parts.push('async ');
	}

	if (node.value.generator) {
		parts.push('*');
	}

	// the key is 'constructor' and we already handled that above
	parts.push(...printKey(node, path, options, print));

	// Optional marker — dropping it turns `onMount?()` into a required member
	if (node.optional) {
		parts.push('?');
	}

	// Add TypeScript generics if present (always on the method node, not on value)
	if (node.typeParameters) {
		const typeParams = path.call(print, 'typeParameters');
		if (Array.isArray(typeParams)) {
			parts.push(...typeParams);
		} else {
			parts.push(typeParams);
		}
	}

	// Parameters - use proper path.map for TypeScript support
	parts.push('(');
	if (node.value && node.value.params && node.value.params.length > 0) {
		const params = path.map(print, 'value', 'params');
		for (let i = 0; i < params.length; i++) {
			if (i > 0) parts.push(', ');
			parts.push(params[i]);
		}
	}
	parts.push(')');

	// Return type
	if (node.value && node.value.returnType) {
		parts.push(': ', path.call(print, 'value', 'returnType'));
	}

	// Method body. Bodiless members (abstract, declared, overload signatures)
	// terminate with a semicolon — inventing an empty body makes an abstract
	// method concrete.
	if (node.value && node.value.body) {
		parts.push(' ');
		parts.push(path.call(print, 'value', 'body'));
	} else {
		parts.push(semi(options));
	}

	return parts;
}

/**
 * Print a member expression (object.property or object[property])
 * @param {AST.MemberExpression} node - The member expression node
 * @param {AstPath<AST.MemberExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printMemberExpression(node, path, options, print) {
	const objectPart = path.call(print, 'object');
	const propertyPart = path.call(print, 'property');

	if (node.computed) {
		const openBracket = node.optional ? '?.[' : '[';
		return [objectPart, openBracket, propertyPart, ']'];
	}
	const separator = node.optional ? '?.' : '.';
	return [objectPart, separator, propertyPart];
}

/**
 * Print a unary expression
 * @param {AST.UnaryExpression} node - The unary expression node
 * @param {AstPath<AST.UnaryExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printUnaryExpression(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	if (node.prefix) {
		parts.push(node.operator);
		// Add space for word operators like 'void', 'typeof', 'delete'
		const needsSpace = /^[a-z]/.test(node.operator);
		if (needsSpace) {
			parts.push(' ');
		}
		parts.push(path.call(print, 'argument'));
	} else {
		parts.push(path.call(print, 'argument'), node.operator);
	}

	return parts;
}

/**
 * Print a yield expression
 * @param {AST.YieldExpression} node - The yield expression node
 * @param {AstPath<AST.YieldExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printYieldExpression(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('yield');

	if (node.delegate) {
		parts.push('*');
	}

	if (node.argument) {
		parts.push(' ');
		parts.push(path.call(print, 'argument'));
	}

	return parts;
}

/**
 * Print a new expression
 * @param {AST.NewExpression} node - The new expression node
 * @param {AstPath<AST.NewExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printNewExpression(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('new ');
	parts.push(path.call(print, 'callee'));

	if (node.typeArguments) {
		parts.push(path.call(print, 'typeArguments'));
	}

	parts.push(printCallArguments(path, options, print));

	return parts;
}

/**
 * Print a template literal
 * @param {AST.TemplateLiteral} node - The template literal node
 * @param {AstPath<AST.TemplateLiteral>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTemplateLiteral(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('`');

	for (let i = 0; i < node.expressions.length; i++) {
		parts.push(node.quasis[i].value.raw);

		const expression = node.expressions[i];
		const expressionDoc = path.call(print, 'expressions', i);

		// Check if the expression will break (e.g., ternary, binary, logical)
		const needsBreaking =
			expression.type === 'ConditionalExpression' ||
			expression.type === 'BinaryExpression' ||
			expression.type === 'LogicalExpression' ||
			willBreak(expressionDoc);

		if (needsBreaking) {
			// For expressions that break, use group with indent to format nicely
			parts.push(group(['${', indent([softline, expressionDoc]), softline, '}']));
		} else {
			// For simple expressions, keep them inline
			parts.push('${');
			parts.push(expressionDoc);
			parts.push('}');
		}
	}

	// Add the final quasi (text after the last expression)
	if (node.quasis.length > node.expressions.length) {
		parts.push(node.quasis[node.quasis.length - 1].value.raw);
	}

	parts.push('`');
	return parts;
}

/**
 * Print a tagged template expression
 * @param {AST.TaggedTemplateExpression} node - The tagged template node
 * @param {AstPath<AST.TaggedTemplateExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTaggedTemplateExpression(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push(path.call(print, 'tag'));
	// `sql<Row>` types the result; without the arguments TypeScript infers them
	if (node.typeArguments) {
		parts.push(path.call(print, 'typeArguments'));
	}
	parts.push(path.call(print, 'quasi'));
	return parts;
}

/**
 * Print a throw statement
 * @param {AST.ThrowStatement} node - The throw statement node
 * @param {AstPath<AST.ThrowStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printThrowStatement(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	if (path.call((argumentPath) => getOwnLineCommentAhead(argumentPath, options), 'argument')) {
		// Same ASI hazard as `return`: keep the argument attached via parens.
		// These parens replace any the argument would print for itself.
		parts.push(
			'throw (',
			indent([
				hardline,
				path.call((argumentPath) => print(argumentPath, { suppressOwnParens: true }), 'argument'),
			]),
			hardline,
			')',
		);
	} else {
		parts.push('throw ');
		parts.push(path.call(print, 'argument'));
	}
	parts.push(semi(options));
	return parts;
}

/**
 * Whether printTsrxNode ends a node's leading comments with a line break. It
 * does after a line comment, and after a block comment unless that is the last
 * comment and shares its line with the node or with a type cast's `(`.
 * @param {AST.Node} node - The node
 * @param {AST.Comment[]} comments - The comments printed ahead of the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function hasOwnLineLeadingComment(node, comments, options) {
	return comments.some((comment, index) => {
		if (comment.type === 'Line' || index < comments.length - 1) {
			return true;
		}
		const isOnNodeLine = comment.loc && node.loc && comment.loc.end.line === node.loc.start.line;
		return !isOnNodeLine && !isCommentFollowedBySameLineParen(comment, options);
	});
}

/**
 * The first comment printed ahead of the node at `path`, when the comments
 * printed ahead of it end with a line break. The leftmost operand's comments
 * print ahead of the node too (a comment inside the parentheses of
 * `(a || b)()` belongs to the callee), unless the node prints its own
 * parentheses or its source verbatim.
 * @param {AstPath} path - The path to the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {AST.Comment | null}
 */
function getOwnLineCommentAhead(path, options) {
	const node = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (path.node);
	const typeCastParens = getTypeCastParens(path, options);
	const comments = typeCastParens ? typeCastParens.ahead : (node.leadingComments ?? []);
	const firstComment = comments[0] ?? null;
	if (hasOwnLineLeadingComment(node, comments, options)) {
		return firstComment;
	}
	const key = getLeftmostChildKey(node);
	if (!key || hasPrettierIgnore(node) || typeCastParens || needsParens(path, options)) {
		return null;
	}
	const comment = path.call((childPath) => getOwnLineCommentAhead(childPath, options), key);
	return comment && (firstComment ?? comment);
}

/**
 * Print the value after an assignment-like operator (`=`, `:`) when the value
 * starts with a comment that ends its line, as Prettier does: a comment on the
 * operator's line stays there, one on its own line moves below the operator,
 * and the value indents under the operator instead of starting at column zero.
 * @param {AstPath} path - The path to the assignment-like node
 * @param {string} key - The property that holds the value
 * @param {Doc} valueDoc - The printed value, including its leading comments
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc | null} - The doc that follows the operator, or null when the
 * value starts with no such comment
 */
function printValueAfterLeadingComment(path, key, valueDoc, options) {
	const comment = path.call((valuePath) => getOwnLineCommentAhead(valuePath, options), key);
	if (!comment) {
		return null;
	}
	const commentStart = /** @type {AST.NodeWithLocation} */ (comment).start;
	if (hasNewline(options.originalText ?? '', commentStart, { backwards: true })) {
		return indent([hardline, valueDoc]);
	}
	return [' ', indent(valueDoc)];
}

/**
 * Print a TypeScript interface declaration
 * @param {AST.TSInterfaceDeclaration} node - The interface declaration node
 * @param {AstPath<AST.TSInterfaceDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSInterfaceDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	if (node.declare) {
		parts.push('declare ');
	}
	parts.push('interface ');
	parts.push(node.id.name);

	if (node.typeParameters) {
		parts.push(path.call(print, 'typeParameters'));
	}

	// Handle extends clause
	if (node.extends && node.extends.length > 0) {
		parts.push(' extends ');
		const extendsTypes = path.map(print, 'extends');
		parts.push(join(', ', extendsTypes));
	}

	parts.push(' ');
	parts.push(path.call(print, 'body'));

	return parts;
}

/**
 * Print a TypeScript interface body
 * @param {AST.TSInterfaceBody} node - The interface body node
 * @param {AstPath<AST.TSInterfaceBody>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printTSInterfaceBody(node, path, options, print) {
	if (!node.body || node.body.length === 0) {
		return printEmptyMemberList(node);
	}

	const members = path.map(print, 'body');

	// Add semicolons to all members
	const membersWithSemicolons = members.map((member) => [member, semi(options)]);

	return group(['{', indent([hardline, join(hardline, membersWithSemicolons)]), hardline, '}']);
}

/**
 * Print the braces of an empty interface body, type literal, or enum, with the
 * comments the parser keeps inside them as inner comments. Like Prettier, an
 * enum or type literal keeps a lone block comment on the line of its braces
 * when it fits. Otherwise each comment prints on its own line.
 * @param {AST.TSInterfaceBody | AST.TSTypeLiteral | AST.TSEnumDeclaration} node
 * @returns {Doc}
 */
function printEmptyMemberList(node) {
	const comments = node.innerComments ?? [];
	if (comments.length === 0) {
		return '{}';
	}
	if (node.type !== 'TSInterfaceBody' && comments.length === 1 && comments[0].type === 'Block') {
		return group(['{', indent([softline, '/*' + comments[0].value + '*/']), softline, '}']);
	}
	return ['{', indent(printElementBodyComments(comments)), hardline, '}'];
}

/**
 * Print a TypeScript type alias declaration
 * @param {AST.TSTypeAliasDeclaration} node - The type alias node
 * @param {AstPath<AST.TSTypeAliasDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printTSTypeAliasDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const head = [node.declare ? 'declare type ' : 'type ', node.id.name];

	if (node.typeParameters) {
		head.push(path.call(print, 'typeParameters'));
	}

	return [printAssignment(path, options, print, head, ' =', 'typeAnnotation'), semi(options)];
}

/**
 * Print a TypeScript union type
 * @param {AST.TSUnionType} node - The union node
 * @param {AstPath<AST.TSUnionType>} path - The AST path
 * @param {PrintFn} print - Print callback
 * @param {PrintArgs} [args] - Additional context arguments
 * @returns {Doc}
 */
function printTSUnionType(node, path, print, args) {
	const types = path.map(print, 'types');
	const inlineDoc = join(' | ', types);
	const multilineDoc = [
		'| ',
		join(
			[hardline, '| '],
			types.map((typeDoc) => align(2, typeDoc)),
		),
	];
	const shouldBreak = node.types.some(
		(typeNode, index) => !wasOriginallySingleLine(typeNode) || willBreak(types[index]),
	);

	if (args?.preferInlineSimpleUnionType && !types.some((typeDoc) => willBreak(typeDoc))) {
		return inlineDoc;
	}

	return shouldBreak ? group(multilineDoc) : conditionalGroup([inlineDoc, multilineDoc]);
}

/**
 * Print a TypeScript enum declaration
 * @param {AST.TSEnumDeclaration} node - The enum declaration node
 * @param {AstPath<AST.TSEnumDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSEnumDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	if (node.declare) {
		parts.push('declare ');
	}

	// Handle 'const enum' vs 'enum'
	if (node.const) {
		parts.push('const ');
	}

	parts.push('enum ');
	parts.push(node.id.name);
	parts.push(' ');

	// Print enum body
	if (!node.members || node.members.length === 0) {
		parts.push(printEmptyMemberList(node));
	} else {
		const members = path.map(print, 'members');
		const membersWithCommas = [];

		for (let i = 0; i < members.length; i++) {
			membersWithCommas.push(members[i]);
			if (i < members.length - 1) {
				membersWithCommas.push(',');
				membersWithCommas.push(hardline);
			}
		}

		parts.push(
			group([
				'{',
				indent([hardline, membersWithCommas]),
				options.trailingComma !== 'none' ? ',' : '',
				hardline,
				'}',
			]),
		);
	}

	return parts;
}

/**
 * Print a TypeScript enum member
 * @param {AST.TSEnumMember} node - The enum member node
 * @param {AstPath<AST.TSEnumMember>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSEnumMember(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// Print the key (id)
	if (node.id.type === 'Identifier') {
		parts.push(node.id.name);
	} else {
		// Handle computed or string literal keys
		parts.push(path.call(print, 'id'));
	}

	// Print the initializer if present
	if (node.initializer) {
		parts.push(' = ');
		parts.push(path.call(print, 'initializer'));
	}

	return parts;
}

/**
 * Print TypeScript type parameter declaration (<T, U extends V>)
 * @param {AST.TSTypeParameterDeclaration} node - The type parameter declaration node
 * @param {AstPath<AST.TSTypeParameterDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[] | Doc}
 */
function printTSTypeParameterDeclaration(node, path, options, print) {
	if (!node.params || node.params.length === 0) {
		return '';
	}
	const paramList = path.map(print, 'params');

	// In JSX-shaped files a lone `<T>` on an arrow function is ambiguous with a JSX
	// element, so a source-level trailing comma (`<T,>`) is syntactically meaningful
	// there. Keep single-param arrow generics flat and preserve that comma; breaking
	// them would add a trailing comma that flattens back on the next pass.
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());
	if (parent?.type === 'ArrowFunctionExpression' && node.params.length === 1) {
		const trailing = node.extra?.trailingComma !== undefined ? ',' : '';
		return ['<', paramList[0], trailing, '>'];
	}

	return group([
		'<',
		indent([softline, join([',', line], paramList), ifBreak(shouldPrintComma(options) ? ',' : '')]),
		softline,
		'>',
	]);
}

/**
 * Print a single TypeScript type parameter
 * @param {AST.TSTypeParameter} node - The type parameter node
 * @param {AstPath<AST.TSTypeParameter>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSTypeParameter(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	if (node.const) {
		parts.push('const ');
	}
	if (node.in) {
		parts.push('in ');
	}
	if (node.out) {
		parts.push('out ');
	}
	parts.push(node.name);

	if (node.constraint) {
		parts.push(' extends ');
		parts.push(path.call(print, 'constraint'));
	}

	if (node.default) {
		parts.push(' = ');
		parts.push(path.call(print, 'default'));
	}

	return parts;
}

/**
 * Print TypeScript type parameter instantiation (<string, number>)
 * @param {AST.TSTypeParameterInstantiation} node - The type parameter instantiation node
 * @param {AstPath<AST.TSTypeParameterInstantiation>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printTSTypeParameterInstantiation(node, path, options, print) {
	if (!node.params || node.params.length === 0) {
		return '';
	}

	const paramList = path.map(print, 'params');

	// Hug a lone object-type argument against the brackets: Foo<{ ... }>
	if (
		node.params.length === 1 &&
		isObjectType(node.params[0]) &&
		!hasComment(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (node.params[0]))
	) {
		return ['<', paramList[0], '>'];
	}

	// Check if any param has line breaks (e.g., contains object types)
	const hasBreakingParam = paramList.some((param) => willBreak(param));

	// If any param breaks, use the breaking version with proper indentation
	if (hasBreakingParam) {
		// Build breaking version: <\n  T,\n  U\n>
		const breakingParts = [];
		for (let i = 0; i < paramList.length; i++) {
			if (i > 0) breakingParts.push(',', hardline);
			breakingParts.push(paramList[i]);
		}
		return group(['<', indent([hardline, ...breakingParts]), hardline, '>']);
	}

	// Otherwise use group to allow natural breaking
	/** @type {Doc[]} */
	const parts = [];
	for (let i = 0; i < paramList.length; i++) {
		if (i > 0) parts.push(',', line);
		parts.push(paramList[i]);
	}

	return group(['<', indent([softline, ...parts]), softline, '>']);
}

/**
 * Print a switch statement
 * @param {AST.SwitchStatement} node - The switch statement node
 * @param {AstPath<AST.SwitchStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printSwitchStatement(node, path, options, print) {
	// Extract leading comments from discriminant node to print them before 'switch' keyword
	const discriminantNode = node.discriminant;

	// Print discriminant without its leading comments (they'll be printed before 'switch')
	const discriminant = path.call(
		(discriminantPath) => print(discriminantPath, { suppressLeadingComments: true }),
		'discriminant',
	);

	/** @type {Doc[]} */
	const parts = [];

	// Print leading comments from discriminant node before 'switch' keyword
	parts.push(...extractAndPrintLeadingComments(discriminantNode));

	const discriminantDoc = group(['switch (', indent([softline, discriminant]), softline, ')']);

	parts.push(discriminantDoc);

	const cases = [];
	for (let i = 0; i < node.cases.length; i++) {
		const caseDoc = [path.call(print, 'cases', i)];
		if (i < node.cases.length - 1 && isNextLineEmpty(node.cases[i], options)) {
			caseDoc.push(hardline);
		}
		cases.push(caseDoc);
	}

	const bodyDoc =
		cases.length > 0 ? [indent([hardline, join(hardline, cases)]), hardline] : hardline;

	parts.push(' {', bodyDoc, '}');

	return parts;
}

/**
 * Print a JSX switch expression. JSX switch cases use explicit template blocks:
 * `case value: { ... }`, unlike ordinary JavaScript switch cases.
 * @param {AST.SwitchStatement} node - The switch expression node
 * @param {AstPath<AST.SwitchStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printJSXSwitchExpression(node, path, options, print) {
	const discriminant = path.call(
		(discriminantPath) => print(discriminantPath, { suppressLeadingComments: true }),
		'discriminant',
	);

	/** @type {Doc[]} */
	const cases = [];
	for (let i = 0; i < node.cases.length; i++) {
		const caseDoc = [printJSXSwitchCase(node.cases[i], path, options, print, i)];
		if (i < node.cases.length - 1 && isNextLineEmpty(node.cases[i], options)) {
			caseDoc.push(hardline);
		}
		cases.push(caseDoc);
	}

	const bodyDoc =
		cases.length > 0 ? [indent([hardline, join(hardline, cases)]), hardline] : hardline;

	const discriminantDoc = group(['@switch (', indent([softline, discriminant]), softline, ')']);

	return [
		...extractAndPrintLeadingComments(node.discriminant),
		discriminantDoc,
		' {',
		bodyDoc,
		'}',
	];
}

/**
 * @param {AST.SwitchCase} node
 * @param {AstPath<AST.SwitchStatement>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @param {number} index
 * @returns {Doc[]}
 */
function printJSXSwitchCase(node, path, options, print, index) {
	const header = node.test
		? ['@case ', path.call(print, 'cases', index, 'test'), ':']
		: '@default:';
	const consequents = node.consequent || [];
	const printedConsequents = [];

	for (let i = 0; i < consequents.length; i++) {
		const child = consequents[i];
		if (!child || child.type === 'EmptyStatement') {
			continue;
		}
		printedConsequents.push(
			path.call((casePath) => casePath.call(print, 'consequent', i), 'cases', index),
		);
	}

	const bodyDoc =
		printedConsequents.length > 0
			? [indent([hardline, join(hardline, printedConsequents)]), hardline]
			: hardline;

	return [header, ' {', bodyDoc, '}'];
}

/**
 * Print a switch case
 * @param {AST.SwitchCase} node - The switch case node
 * @param {AstPath<AST.SwitchCase>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printSwitchCase(node, path, options, print) {
	const header = node.test ? ['case ', path.call(print, 'test'), ':'] : 'default:';

	const consequents = node.consequent || [];
	const printedConsequents = [];
	const referencedConsequents = [];

	for (let i = 0; i < consequents.length; i++) {
		const child = consequents[i];
		if (!child || child.type === 'EmptyStatement') {
			continue;
		}
		referencedConsequents.push(child);
		printedConsequents.push(path.call(print, 'consequent', i));
	}

	let bodyDoc = null;
	if (printedConsequents.length > 0) {
		const singleBlock =
			printedConsequents.length === 1 && referencedConsequents[0].type === 'BlockStatement';
		if (singleBlock) {
			bodyDoc = [' ', printedConsequents[0]];
		} else {
			bodyDoc = indent([hardline, join(hardline, printedConsequents)]);
		}
	}

	let trailingDoc = null;
	if (node.trailingComments && node.trailingComments.length > 0) {
		const text = /** @type {string} */ (options.originalText);
		/** @type {Doc[]} */
		const commentDocs = [];

		for (let i = 0; i < node.trailingComments.length; i++) {
			const comment = node.trailingComments[i];
			commentDocs.push(hardline);
			// Like Prettier, keep one blank line when the line before the comment
			// is empty, not a line holding a `;` that isn't printed
			if (isPreviousLineEmpty(text, /** @type {AST.NodeWithLocation} */ (comment).start)) {
				commentDocs.push(hardline);
			}
			const commentDoc =
				comment.type === 'Line' ? ['//', comment.value] : ['/*', comment.value, '*/'];
			commentDocs.push(commentDoc);
		}

		trailingDoc = commentDocs;
		delete node.trailingComments;
	}

	/** @type {Doc[]} */
	const parts = [header];
	if (bodyDoc) {
		parts.push(bodyDoc);
	}
	if (trailingDoc) {
		parts.push(trailingDoc);
	}

	return parts;
}

/**
 * Print a break statement
 * @param {AST.BreakStatement} node - The break statement node
 * @param {AstPath<AST.BreakStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printBreakStatement(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('break');
	if (node.label) {
		parts.push(' ');
		parts.push(path.call(print, 'label'));
	}
	parts.push(semi(options));
	return parts;
}

/**
 * Print a continue statement
 * @param {AST.ContinueStatement} node - The continue statement node
 * @param {AstPath<AST.ContinueStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printContinueStatement(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('continue');
	if (node.label) {
		parts.push(' ');
		parts.push(path.call(print, 'label'));
	}
	parts.push(semi(options));
	return parts;
}

/**
 * Whether a comment starts or ends its line, counting the comments beside it
 * on that line, as Prettier's comment placement does.
 * @param {AST.Comment[]} comments - Consecutive comments
 * @param {number} index - The comment's index in `comments`
 * @param {string} text - The source text
 * @returns {boolean}
 */
function commentStartsOrEndsLine(comments, index, text) {
	const sameLineGap = /^[^\S\n]*$/;
	let start = /** @type {AST.NodeWithLocation} */ (comments[index]).start;
	for (let i = index - 1; i >= 0; i--) {
		const previous = /** @type {AST.NodeWithLocation} */ (comments[i]);
		if (!sameLineGap.test(text.slice(previous.end, start))) break;
		start = previous.start;
	}
	let end = /** @type {AST.NodeWithLocation} */ (comments[index]).end;
	for (let i = index + 1; i < comments.length; i++) {
		const next = /** @type {AST.NodeWithLocation} */ (comments[i]);
		if (!sameLineGap.test(text.slice(end, next.start))) break;
		end = next.end;
	}
	return hasNewline(text, start, { backwards: true }) || hasNewline(text, end);
}

/**
 * Print a labeled statement. As in Prettier, a comment between the label and
 * the body moves above the label when it starts or ends its line; the other
 * comments stay on their side of the colon.
 * @param {AST.LabeledStatement} node - The labeled statement node
 * @param {AstPath<AST.LabeledStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printLabeledStatement(node, path, options, print) {
	const text = options.originalText ?? '';
	const comments = /** @type {AST.NodeWithMaybeComments} */ (node.body).leadingComments ?? [];
	/** @type {AST.Comment[]} */
	const moved = [];
	/** @type {Doc[]} */
	const beforeColon = [];
	/** @type {Doc[]} */
	const afterColon = [];
	let gapStart = /** @type {AST.NodeWithLocation} */ (node.label).end;
	let pastColon = false;
	for (let i = 0; i < comments.length; i++) {
		const comment = comments[i];
		const { start, end } = /** @type {AST.NodeWithLocation} */ (comment);
		pastColon ||= text.slice(gapStart, start).includes(':');
		gapStart = end;
		if (commentStartsOrEndsLine(comments, i, text)) {
			moved.push(comment);
		} else {
			// A line comment always ends its line, so this is a block comment
			(pastColon ? afterColon : beforeColon).push('/*' + comment.value + '*/');
		}
	}

	// A moved `prettier-ignore` is the last comment before the label, so it
	// keeps the whole statement's source.
	if (isPrettierIgnoreComment(moved.at(-1))) {
		const { start, end } = /** @type {AST.NodeWithLocation} */ (node);
		return replaceEndOfLine(text.slice(start, end));
	}

	const body = path.call((bodyPath) => print(bodyPath, { suppressLeadingComments: true }), 'body');
	/** @type {Doc[]} */
	const parts = [
		...printLeadingComments(node.body, moved, options, false),
		path.call(print, 'label'),
	];
	for (const commentDoc of beforeColon) {
		parts.push(' ', commentDoc);
	}
	parts.push(':');
	if (afterColon.length === 0) {
		parts.push(printClause(node.body, body));
	} else {
		parts.push(' ', join(' ', afterColon), ' ', body);
		if (node.body.type === 'EmptyStatement') {
			parts.push(';');
		}
	}
	return parts;
}

/**
 * Print a debugger statement
 * @param {AST.DebuggerStatement} node - The debugger statement node
 * @param {AstPath<AST.DebuggerStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {string}
 */
function printDebuggerStatement(node, path, options) {
	return 'debugger' + semi(options);
}

/**
 * Print a sequence expression
 * @param {AST.SequenceExpression} node - The sequence expression node
 * @param {AstPath<AST.SequenceExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {PrintArgs} [args] - Additional context arguments
 * @returns {Doc[]}
 */
function printSequenceExpression(node, path, options, print, args) {
	/** @type {Doc[]} */
	const parts = [];
	const exprList = path.map(print, 'expressions');
	for (let i = 0; i < exprList.length; i++) {
		if (i > 0) parts.push(', ');
		parts.push(exprList[i]);
	}
	// Sequences keep their parentheses everywhere except a `for` head, like
	// Prettier, unless the parent prints them (`return` with a comment).
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());
	const inForHead =
		parent?.type === 'ForStatement' && (path.key === 'init' || path.key === 'update');
	if (inForHead || args?.suppressOwnParens) {
		return parts;
	}
	return ['(', ...parts, ')'];
}

/**
 * Get number of blank lines between two positions
 * @param {{ line: number }} current_pos - Current position
 * @param {{ line: number }} next_pos - Next position
 * @returns {number}
 */
function getBlankLinesBetweenPositions(current_pos, next_pos) {
	const line_gap = next_pos.line - current_pos.line;

	// lineGap = 1 means adjacent lines (no blank lines)
	// lineGap = 2 means one blank line between them
	// lineGap = 3 means two blank lines between them, etc.
	return Math.max(0, line_gap - 1);
}

/**
 * Get number of blank lines between two nodes
 * @param {AST.Node | AST.CSS.StyleSheet | AST.Comment} currentNode - Current node
 * @param {AST.Node | AST.CSS.StyleSheet | AST.Comment} nextNode - Next node
 * @returns {number}
 */
/**
 * The position to measure a leading blank line against: the first leading
 * comment if any (so the comment lines aren't miscounted as blank), else the
 * node itself.
 * @param {any} node
 * @returns {any}
 */
function leadingAnchor(node) {
	const lead = node?.leadingComments;
	if (Array.isArray(lead) && lead.length > 0 && lead[0].loc) {
		return lead[0];
	}
	return node;
}

/**
 * @param {any} currentNode
 * @param {any} nextNode
 * @returns {number}
 */
function getBlankLinesBetweenNodes(currentNode, nextNode) {
	// Return the number of blank lines between two nodes based on their location
	if (
		currentNode.loc &&
		nextNode?.loc &&
		typeof currentNode.loc.end?.line === 'number' &&
		typeof nextNode.loc.start?.line === 'number'
	) {
		return getBlankLinesBetweenPositions(currentNode.loc.end, nextNode.loc.start);
	}

	// If no location info, assume no whitespace
	return 0;
}

/**
 * The indexes of the statements a statement list prints. Like Prettier, it
 * drops empty statements (a stray `;`, or the one semicolon-free code writes
 * before a first statement that starts with `[`). The parser gives their
 * comments to the statements around them or to the list's container.
 * @param {AST.Node[]} statements
 * @returns {number[]}
 */
function getPrintedStatementIndexes(statements) {
	/** @type {number[]} */
	const indexes = [];
	statements.forEach((statement, index) => {
		if (statement.type !== 'EmptyStatement') {
			indexes.push(index);
		}
	});
	return indexes;
}

/**
 * Where a statement's content ends when its source ends with a `;`: before
 * that `;` and the whitespace ahead of it, like Prettier's `__contentEnd`.
 * Code without semicolons writes the one before `[`, `(` or `` ` `` at the
 * start of the next statement's line (`a\n\n;[b].c()`), and that `;` still
 * ends the previous statement. Comments that lead the next statement can sit
 * between the content and the `;`, so the search starts before them.
 * @param {AST.Node | AST.Comment} node - The statement
 * @param {string} text - The original source
 * @param {number} nextStart - Where the next statement or its first comment starts
 * @returns {number | null} - The offset, or null without a final `;`
 */
function getContentEndBeforeSemicolon(node, text, nextStart) {
	const { start, end } = /** @type {AST.NodeWithLocation} */ (node);
	if (typeof end !== 'number' || text.charAt(end - 1) !== ';') {
		return null;
	}
	let index = Math.min(end - 1, nextStart);
	while (index > start && /\s/.test(text.charAt(index - 1))) {
		index--;
	}
	return index;
}

/**
 * Determine if a blank line should be added between statements or class members
 * @param {AST.Node | AST.Comment} currentNode - Current node
 * @param {AST.Node | AST.Comment} nextNode - Next node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function shouldAddBlankLine(currentNode, nextNode, options) {
	// Always set imports apart from the code after them
	if (currentNode.type === 'ImportDeclaration' && nextNode.type !== 'ImportDeclaration') {
		return true;
	}

	const text = /** @type {string} */ (options.originalText);
	// Like Prettier's `isNextLineEmpty`, only the line right after the node
	// counts, so a line holding a `;` that isn't printed is not a blank line
	const currentTrailing = /** @type {AST.Node} */ (currentNode).trailingComments;
	if (currentTrailing && currentTrailing.length > 0) {
		const lastTrailing = /** @type {AST.NodeWithLocation} */ (currentTrailing.at(-1));
		return isNextLineEmptyAfterIndex(text, lastTrailing.end);
	}

	// Measure from the content before a final `;` as well as from the `;`,
	// which can end the statement on a later line (`a\n\n;[b].c()`) after any
	// comments that lead the next statement
	const { end } = /** @type {AST.NodeWithLocation} */ (currentNode);
	const nextLeading = /** @type {AST.Node} */ (nextNode).leadingComments;
	const nextStart = /** @type {AST.NodeWithLocation} */ (nextLeading?.[0] ?? nextNode).start;
	const contentEnd = getContentEndBeforeSemicolon(currentNode, text, nextStart) ?? end;
	return (
		isNextLineEmptyAfterIndex(text, contentEnd) ||
		(contentEnd !== end && isNextLineEmptyAfterIndex(text, end))
	);
}

/**
 * Print an object pattern (destructuring)
 * @param {AST.ObjectPattern} node - The object pattern node
 * @param {AstPath<AST.ObjectPattern>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printObjectPattern(node, path, options, print) {
	const propList = path.map(print, 'properties');
	if (propList.length === 0) {
		if (node.typeAnnotation) {
			return ['{}', ': ', path.call(print, 'typeAnnotation')];
		}
		return '{}';
	}

	const allowTrailingComma =
		node.properties &&
		node.properties.length > 0 &&
		node.properties[node.properties.length - 1].type !== 'RestElement';

	const trailingCommaDoc =
		allowTrailingComma && options.trailingComma !== 'none' ? ifBreak(',', '') : '';

	// When the pattern has a type annotation, we need to format them together
	// so they break at the same time
	if (node.typeAnnotation) {
		const typeAnn = node.typeAnnotation.typeAnnotation;

		// If it's a TSTypeLiteral, format both object and type
		if (typeAnn && typeAnn.type === 'TSTypeLiteral') {
			const typeMembers = path.call(
				(path) => path.map(print, 'members'),
				'typeAnnotation',
				'typeAnnotation',
			);

			// Use softline for proper spacing - will become space when inline, line when breaking
			// Format type members with semicolons between AND after the last member
			const typeMemberDocs = join([';', line], typeMembers);

			// Don't wrap in group - let the outer params group control breaking
			const objectDoc = [
				'{',
				indent([line, join([',', line], propList), trailingCommaDoc]),
				line,
				'}',
			];
			const typeDoc =
				typeMembers.length === 0
					? '{}'
					: ['{', indent([line, typeMemberDocs, ifBreak(';', '')]), line, '}'];

			// Return combined
			return [objectDoc, ': ', typeDoc];
		}

		// For other type annotations, just concatenate
		const objectContent = group([
			'{',
			indent([line, join([',', line], propList), trailingCommaDoc]),
			line,
			'}',
		]);
		return [objectContent, ': ', path.call(print, 'typeAnnotation')];
	}

	// No type annotation - just format the object pattern
	const objectContent = group([
		'{',
		indent([line, join([',', line], propList), trailingCommaDoc]),
		line,
		'}',
	]);

	return objectContent;
}

/**
 * Print an array literal like Prettier's `printArray`. The array breaks only
 * when it doesn't fit, or when every element is an object (or every element
 * an array) with more than one entry. A blank line between elements is kept
 * only in a broken array, and number-only arrays pack as many elements per
 * line as fit.
 * @param {AST.ArrayExpression} node - The array expression node
 * @param {AstPath<AST.ArrayExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printArrayExpression(node, path, options, print) {
	const { elements } = node;
	if (elements.length === 0) {
		return '[]';
	}

	// A trailing hole (`[1, ,]`) is an array slot, and its comma is what
	// creates it: dropping that comma shortens the array. It prints in
	// every layout and regardless of `trailingComma`.
	const needsForcedTrailingComma = elements[elements.length - 1] === null;
	const groupId = Symbol('array');

	const shouldBreak =
		elements.length > 1 &&
		elements.every((element, index) => {
			if (!element || (element.type !== 'ArrayExpression' && element.type !== 'ObjectExpression')) {
				return false;
			}

			const nextElement = elements[index + 1];
			if (nextElement && nextElement.type !== element.type) {
				return false;
			}

			const items = element.type === 'ArrayExpression' ? element.elements : element.properties;
			return items.length > 1;
		});

	const shouldUseConciseFormatting = isConciselyPrintedArray(node, options);

	/** @type {Doc} */
	const trailingComma = needsForcedTrailingComma
		? ','
		: options.trailingComma === 'none'
			? ''
			: shouldUseConciseFormatting
				? ifBreak(',', '', { groupId })
				: ifBreak(',');

	return group(
		[
			'[',
			indent([
				softline,
				shouldUseConciseFormatting
					? printArrayElementsConcisely(path, options, print, trailingComma)
					: [printArrayElements(path, options, print), trailingComma],
			]),
			softline,
			']',
		],
		{ shouldBreak, id: groupId },
	);
}

/**
 * Whether Prettier packs an array's elements with `fill`: every element is a
 * number, and no element has a line comment after it on the same line
 * @param {AST.ArrayExpression} node - The array expression node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isConciselyPrintedArray(node, options) {
	const text = /** @type {string} */ (options.originalText);
	return (
		node.elements.length > 0 &&
		node.elements.every(
			(element) =>
				!!element &&
				(isNumericLiteral(element) ||
					(element.type === 'UnaryExpression' &&
						(element.operator === '+' || element.operator === '-') &&
						isNumericLiteral(element.argument) &&
						!hasComment(element.argument))) &&
				!element.trailingComments?.some(
					(comment) =>
						comment.type === 'Line' &&
						!hasNewline(text, /** @type {AST.CommentWithLocation} */ (comment).start, {
							backwards: true,
						}),
				),
		)
	);
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isNumericLiteral(node) {
	return node.type === 'Literal' && typeof node.value === 'number';
}

/**
 * Whether a blank line follows the comma after an array element. Like
 * Prettier's `isLineAfterElementEmpty`, this finds the comma first, past any
 * parentheses or comments after the element.
 * @param {AST.Node} element - The array element
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isLineAfterElementEmpty(element, options) {
	const text = /** @type {string} */ (options.originalText);
	let index = options.locEnd(/** @type {AST.NodeWithLocation} */ (element));
	while (index < text.length && text[index] !== ',') {
		index = /** @type {number} */ (skipInlineComment(text, skipTrailingComment(text, index + 1)));
	}

	return isNextLineEmptyAfterIndex(text, index);
}

/**
 * Print array elements separated by `line`, keeping a blank line after an
 * element as a `softline` that only shows when the array breaks
 * @param {AstPath<AST.ArrayExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printArrayElements(path, options, print) {
	const { elements } = path.node;
	/** @type {Doc[]} */
	const parts = [];

	path.each((elementPath, index) => {
		const element = elements[index];
		parts.push(element ? group(print(elementPath)) : '');

		if (index < elements.length - 1) {
			parts.push([',', line, element && isLineAfterElementEmpty(element, options) ? softline : '']);
		}
	}, 'elements');

	return parts;
}

/**
 * Print number-only array elements with `fill`, several per line. A blank
 * line after an element is always kept.
 * @param {AstPath<AST.ArrayExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {Doc} trailingComma - The comma to print after the last element
 * @returns {Doc}
 */
function printArrayElementsConcisely(path, options, print, trailingComma) {
	const elements = /** @type {AST.Expression[]} */ (path.node.elements);
	/** @type {Doc[]} */
	const parts = [];

	path.each((elementPath, index) => {
		if (index > 0) {
			// Prettier breaks before a leading line comment. A block comment on its
			// own line breaks too: after `1, /* note */` it would reparse as a
			// trailing comment of `1`. A cast's comment prints inside its parens.
			const commentsAhead =
				getTypeCastParens(elementPath, options)?.ahead ?? elements[index].leadingComments ?? [];
			parts.push(
				isLineAfterElementEmpty(elements[index - 1], options)
					? [hardline, hardline]
					: hasOwnLineLeadingComment(elements[index], commentsAhead, options)
						? hardline
						: line,
			);
		}

		parts.push([print(elementPath), index === elements.length - 1 ? trailingComma : ',']);
	}, 'elements');

	return fill(parts);
}

/**
 * Print an array pattern (destructuring)
 * @param {AST.ArrayPattern} node - The array pattern node
 * @param {AstPath<AST.ArrayPattern>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printArrayPattern(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('[');
	const elementList = path.map(print, 'elements');
	for (let i = 0; i < elementList.length; i++) {
		if (i > 0) parts.push(', ');
		parts.push(elementList[i]);
	}
	// A trailing elision (`[a, ,]`) advances the iterator one more step; its
	// comma is the only thing that marks it.
	if (node.elements[node.elements.length - 1] === null) {
		parts.push(',');
	}
	parts.push(']');

	if (node.typeAnnotation) {
		parts.push(': ');
		parts.push(path.call(print, 'typeAnnotation'));
	}

	return parts;
}

/**
 * How an assignment-like node lays out its operator and value, as Prettier's
 * `chooseLayout` names them.
 * @typedef {'break-after-operator' | 'never-break-after-operator' | 'fluid' | 'break-lhs' | 'chain' | 'chain-tail' | 'chain-tail-arrow-chain' | 'only-left'} AssignmentLayout
 */

/**
 * Print `left operator right` for a declarator, an assignment, a class field,
 * an object property, or a type alias, in the layout Prettier's
 * `printAssignment` picks for it (see {@link chooseAssignmentLayout}). The
 * value learns the layout through its print arguments, so an arrow chain can
 * move below the operator.
 * @param {AstPath} path - The path to the assignment-like node
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {Doc} leftDoc - The printed left side
 * @param {Doc} operator - The operator, with the space before it
 * @param {string} [rightPropertyName] - The property that holds the value
 * @returns {Doc}
 */
function printAssignment(path, options, print, leftDoc, operator, rightPropertyName) {
	const layout = chooseAssignmentLayout(path, options, print, leftDoc, rightPropertyName);
	if (!rightPropertyName || layout === 'only-left') {
		return leftDoc;
	}

	const rightDoc = path.call(
		(rightPath) => print(rightPath, { assignmentLayout: layout }),
		rightPropertyName,
	);

	const commentedRight = printValueAfterLeadingComment(path, rightPropertyName, rightDoc, options);
	if (commentedRight) {
		return [group(leftDoc), operator, commentedRight];
	}

	switch (layout) {
		// Break after the operator first, then each side on its own line
		case 'break-after-operator':
			return group([group(leftDoc), operator, group(indent([line, rightDoc]))]);

		// Break the value first, then the left side
		case 'never-break-after-operator':
			return group([group(leftDoc), operator, ' ', rightDoc]);

		// Break the value first, then after the operator
		case 'fluid': {
			const groupId = Symbol('assignment');
			return group([
				group(leftDoc),
				operator,
				group(indent(line), { id: groupId }),
				lineSuffixBoundary,
				indentIfBreak(rightDoc, { groupId }),
			]);
		}

		case 'break-lhs':
			return group([leftDoc, operator, ' ', group(rightDoc)]);

		// The parts of an assignment chain share one group, so once one breaks,
		// every one does
		case 'chain':
			return [group(leftDoc), operator, line, rightDoc];

		case 'chain-tail':
			return [group(leftDoc), operator, indent([line, rightDoc])];

		case 'chain-tail-arrow-chain':
			return [group(leftDoc), operator, rightDoc];
	}
	return leftDoc;
}

/**
 * Prettier's `chooseLayout`: pick how an assignment-like node breaks, from its
 * value's type and the shape of its left side.
 * @param {AstPath} path - The path to the assignment-like node
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {Doc} leftDoc - The printed left side
 * @param {string} [rightPropertyName] - The property that holds the value
 * @returns {AssignmentLayout}
 */
function chooseAssignmentLayout(path, options, print, leftDoc, rightPropertyName) {
	const node = /** @type {AST.Node & Record<string, any>} */ (path.node);
	/** @type {(AST.Node & Record<string, any>) | null} */
	const rightNode = rightPropertyName ? node[rightPropertyName] : null;
	if (!rightPropertyName || !rightNode) {
		return 'only-left';
	}

	// Short chains (`a = b = c` and `const a = b = c`) are not formatted as chains
	const isTail = !isAssignment(rightNode);
	const shouldUseChainFormatting = path.match(
		isAssignment,
		isAssignmentOrVariableDeclarator,
		(/** @type {AST.Node} */ parent) =>
			!isTail || (parent.type !== 'ExpressionStatement' && parent.type !== 'VariableDeclaration'),
	);
	if (shouldUseChainFormatting) {
		if (!isTail) {
			return 'chain';
		}
		return rightNode.type === 'ArrowFunctionExpression' &&
			rightNode.body.type === 'ArrowFunctionExpression'
			? 'chain-tail-arrow-chain'
			: 'chain-tail';
	}

	const isHeadOfLongChain = !isTail && isAssignment(rightNode.right);
	const rightComments = path.call(
		(rightPath) => getCommentsAhead(rightPath, options),
		rightPropertyName,
	);
	if (
		isHeadOfLongChain ||
		(rightNode.type === 'TSUnionType' && !shouldHugUnionType(rightNode)) ||
		hasLeadingOwnLineComment(rightNode, rightComments, options) ||
		rightComments.some(isIndentableBlockComment)
	) {
		return 'break-after-operator';
	}

	if (
		/** @type {string} */ (node.type) === 'ImportAttribute' ||
		(rightNode.type === 'CallExpression' &&
			rightNode.callee.type === 'Identifier' &&
			rightNode.callee.name === 'require')
	) {
		return 'never-break-after-operator';
	}

	const canBreakLeftDoc = canBreak(leftDoc);
	if (
		isComplexDestructuring(node) ||
		hasComplexTypeAnnotation(node) ||
		(isArrowFunctionVariableDeclarator(node) && canBreakLeftDoc)
	) {
		return 'break-lhs';
	}

	// Wrapping an object property with a very short key rarely helps
	const hasShortKey = isObjectPropertyWithShortKey(node, leftDoc, options);
	if (
		path.call(
			(rightPath) => shouldBreakAfterOperator(rightPath, options, print, hasShortKey),
			rightPropertyName,
		)
	) {
		return 'break-after-operator';
	}

	if (isComplexTypeAliasParams(node)) {
		return 'break-lhs';
	}

	if (
		!canBreakLeftDoc &&
		(hasShortKey ||
			rightNode.type === 'TemplateLiteral' ||
			rightNode.type === 'TaggedTemplateExpression' ||
			(rightNode.type === 'Literal' && typeof rightNode.value === 'boolean') ||
			isNumericLiteral(rightNode) ||
			rightNode.type === 'ClassExpression')
	) {
		return 'never-break-after-operator';
	}

	return 'fluid';
}

/**
 * Prettier's `shouldBreakAfterOperator`: whether the value at `path` reads
 * better starting on the line after the operator.
 * @param {AstPath} path - The path to the value
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} hasShortKey - Whether the value belongs to a short object key
 * @returns {boolean}
 */
function shouldBreakAfterOperator(path, options, print, hasShortKey) {
	const rightNode = /** @type {AST.Node} */ (path.node);

	if (isBinaryish(rightNode) && !shouldInlineLogicalExpression(rightNode)) {
		return true;
	}

	switch (rightNode.type) {
		case 'SequenceExpression':
			return true;
		case 'TSConditionalType':
			if (shouldBreakBeforeConditionalType(rightNode)) {
				return true;
			}
			break;
		case 'ConditionalExpression': {
			const { test } = rightNode;
			return isBinaryish(test) && !shouldInlineLogicalExpression(test);
		}
		case 'ClassExpression':
			return getDecorators(rightNode).length > 0;
	}

	if (hasShortKey) {
		return false;
	}

	/** @type {AST.Node} */
	let node = rightNode;
	/** @type {string[]} */
	const propertiesForPath = [];
	for (;;) {
		if (
			node.type === 'UnaryExpression' ||
			node.type === 'AwaitExpression' ||
			(node.type === 'YieldExpression' && node.argument !== null)
		) {
			node = /** @type {AST.Node} */ (node.argument);
			propertiesForPath.push('argument');
		} else if (node.type === 'TSNonNullExpression') {
			node = node.expression;
			propertiesForPath.push('expression');
		} else {
			break;
		}
	}

	/**
	 * @param {AstPath} nodePath
	 * @param {number} depth
	 * @returns {boolean}
	 */
	const isPoorlyBreakableAt = (nodePath, depth) =>
		depth === propertiesForPath.length
			? isPoorlyBreakableMemberOrCallChain(nodePath, options, print)
			: nodePath.call(
					(childPath) => isPoorlyBreakableAt(childPath, depth + 1),
					propertiesForPath[depth],
				);
	return isStringLiteral(node) || isPoorlyBreakableAt(path, 0);
}

/**
 * Prettier's `isPoorlyBreakableMemberOrCallChain`: a chain with no calls, or
 * whose calls take no arguments or one short argument, and that doesn't print
 * as a member chain. Breaking inside it helps less than breaking before it.
 * @param {AstPath} path - The path to the chain
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [deep] - Whether the path is inside the chain
 * @returns {boolean}
 */
function isPoorlyBreakableMemberOrCallChain(path, options, print, deep = false) {
	const node = /** @type {AST.Node} */ (path.node);
	const goDeeper = (/** @type {AstPath} */ childPath) =>
		isPoorlyBreakableMemberOrCallChain(childPath, options, print, true);

	if (node.type === 'ChainExpression' || node.type === 'TSNonNullExpression') {
		return path.call(goDeeper, 'expression');
	}

	if (node.type === 'CallExpression') {
		if (isMemberChain(node, options)) {
			return false;
		}
		const args = node.arguments;
		const isPoorlyBreakableCall =
			args.length === 0 || (args.length === 1 && isLoneShortArgument(args[0], options));
		if (!isPoorlyBreakableCall) {
			return false;
		}
		if (isCallExpressionWithComplexTypeArguments(node, path, print)) {
			return false;
		}
		return path.call(goDeeper, 'callee');
	}

	if (node.type === 'MemberExpression') {
		return path.call(goDeeper, 'object');
	}

	return deep && (node.type === 'Identifier' || node.type === 'ThisExpression');
}

/**
 * Whether a call's type arguments are too complex for the call to count as
 * poorly breakable.
 * @param {AST.CallExpression} node - The call
 * @param {AstPath} path - The path to the call
 * @param {PrintFn} print - Print callback
 * @returns {boolean}
 */
function isCallExpressionWithComplexTypeArguments(node, path, print) {
	const typeArgs = /** @type {AST.TSTypeParameterInstantiation | undefined} */ (
		/** @type {{ typeArguments?: unknown }} */ (node).typeArguments
	)?.params;
	if (!typeArgs || typeArgs.length === 0) {
		return false;
	}
	if (typeArgs.length > 1) {
		return true;
	}
	const [firstArg] = typeArgs;
	if (
		firstArg.type === 'TSUnionType' ||
		firstArg.type === 'TSIntersectionType' ||
		firstArg.type === 'TSTypeLiteral'
	) {
		return true;
	}
	return willBreak(path.call(print, 'typeArguments'));
}

/**
 * Whether Prettier prints a call as a member chain (`printMemberChain` labels
 * its doc `memberChain`): a call on a member with more than two groups of
 * `.member(...)` links, or one with comments between the links. Only the
 * decision is ported here; the printing belongs to the member chain printer.
 * @param {AST.CallExpression} node - The call
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isMemberChain(node, options) {
	if (node.callee.type !== 'MemberExpression') {
		return false;
	}
	// Prettier keeps a call with one template literal argument on its own line
	// as a unit
	if (
		node.arguments.length === 1 &&
		isTemplateOnItsOwnLine(node.arguments[0], /** @type {string} */ (options.originalText))
	) {
		return false;
	}

	// Flatten the chain into its links, in source order
	/** @type {AST.Node[]} */
	const printedNodes = [node];
	/** @type {AST.Node} */
	let current = node.callee;
	for (;;) {
		if (
			current.type === 'CallExpression' &&
			(current.callee.type === 'MemberExpression' || current.callee.type === 'CallExpression')
		) {
			printedNodes.unshift(current);
			current = current.callee;
		} else if (current.type === 'MemberExpression') {
			printedNodes.unshift(current);
			current = current.object;
		} else if (current.type === 'ChainExpression') {
			current = current.expression;
		} else if (current.type === 'TSNonNullExpression') {
			printedNodes.unshift(current);
			current = current.expression;
		} else {
			printedNodes.unshift(current);
			break;
		}
	}

	const isComputedIndex = (/** @type {AST.Node} */ link) =>
		link.type === 'MemberExpression' && link.computed && isNumericLiteral(link.property);

	// The first group is the head plus the calls, index lookups, and all but
	// the last of the properties that follow it directly
	/** @type {AST.Node[][]} */
	const groups = [];
	let currentGroup = [printedNodes[0]];
	let index = 1;
	for (; index < printedNodes.length; index++) {
		const link = printedNodes[index];
		if (
			link.type === 'TSNonNullExpression' ||
			link.type === 'CallExpression' ||
			isComputedIndex(link)
		) {
			currentGroup.push(link);
		} else {
			break;
		}
	}
	if (printedNodes[0].type !== 'CallExpression') {
		for (; index + 1 < printedNodes.length; index++) {
			if (
				printedNodes[index].type === 'MemberExpression' &&
				printedNodes[index + 1].type === 'MemberExpression'
			) {
				currentGroup.push(printedNodes[index]);
			} else {
				break;
			}
		}
	}
	groups.push(currentGroup);

	// Every other group is a run of properties followed by a run of calls
	currentGroup = [];
	let hasSeenCallExpression = false;
	for (; index < printedNodes.length; index++) {
		const link = printedNodes[index];
		if (hasSeenCallExpression && link.type === 'MemberExpression') {
			if (isComputedIndex(link)) {
				currentGroup.push(link);
				continue;
			}
			groups.push(currentGroup);
			currentGroup = [];
			hasSeenCallExpression = false;
		}
		if (link.type === 'CallExpression') {
			hasSeenCallExpression = true;
		}
		currentGroup.push(link);
		if (/** @type {AST.NodeWithMaybeComments} */ (link).trailingComments?.length) {
			groups.push(currentGroup);
			currentGroup = [];
			hasSeenCallExpression = false;
		}
	}
	if (currentGroup.length > 0) {
		groups.push(currentGroup);
	}

	// Factories (`Object.keys(…)`, `this.items`) keep their first call on the
	// head's line, which allows one more group before the chain breaks
	const isFactory = (/** @type {string} */ name) => /^[A-Z]|^[$_]+$/.test(name);
	const shouldNotWrap = () => {
		const hasComputed =
			groups[1][0]?.type === 'MemberExpression' &&
			/** @type {AST.MemberExpression} */ (groups[1][0]).computed;
		if (groups[0].length === 1) {
			const firstNode = groups[0][0];
			return (
				firstNode.type === 'ThisExpression' ||
				(firstNode.type === 'Identifier' && (isFactory(firstNode.name) || hasComputed))
			);
		}
		const lastNode = groups[0][groups[0].length - 1];
		return (
			lastNode.type === 'MemberExpression' &&
			lastNode.property.type === 'Identifier' &&
			(isFactory(lastNode.property.name) || hasComputed)
		);
	};
	const shouldMerge = groups.length >= 2 && !hasComment(groups[1][0]) && shouldNotWrap();
	const cutoff = shouldMerge ? 3 : 2;

	const links = groups.flat();
	const hasLeadingComment = (/** @type {AST.Node} */ link) =>
		Boolean(/** @type {AST.NodeWithMaybeComments} */ (link).leadingComments?.length);
	const hasTrailingComment = (/** @type {AST.Node} */ link) =>
		Boolean(/** @type {AST.NodeWithMaybeComments} */ (link).trailingComments?.length);
	const nodeHasComment =
		links.slice(1, -1).some(hasLeadingComment) ||
		links.slice(0, -1).some(hasTrailingComment) ||
		(groups[cutoff] !== undefined && hasLeadingComment(groups[cutoff][0]));

	return groups.length > cutoff || nodeHasComment;
}

/**
 * Prettier's `isLoneShortArgument`: an argument short enough that a call
 * taking only it still counts as poorly breakable.
 * @param {AST.Node} node - The argument
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isLoneShortArgument(node, options) {
	if (hasComment(node)) {
		return false;
	}

	const threshold = (options.printWidth ?? 80) * 0.25;

	if (
		node.type === 'ThisExpression' ||
		(node.type === 'Identifier' && node.name.length <= threshold) ||
		(isSignedNumericLiteral(node) &&
			!hasComment(/** @type {AST.UnaryExpression} */ (node).argument))
	) {
		return true;
	}

	if (isRegExpLiteral(node)) {
		return /** @type {AST.RegExpLiteral} */ (node).regex.pattern.length <= threshold;
	}

	if (isStringLiteral(node)) {
		return printStringLiteral(/** @type {AST.Literal} */ (node), options).length <= threshold;
	}

	if (node.type === 'TemplateLiteral') {
		return (
			node.expressions.length === 0 &&
			node.quasis[0].value.raw.length <= threshold &&
			!node.quasis[0].value.raw.includes('\n')
		);
	}

	if (node.type === 'UnaryExpression') {
		return isLoneShortArgument(node.argument, options);
	}

	if (
		node.type === 'CallExpression' &&
		node.arguments.length === 0 &&
		node.callee.type === 'Identifier'
	) {
		return node.callee.name.length <= threshold - 2;
	}

	return node.type === 'Literal';
}

/**
 * Whether a node is a `+` or `-` applied to a number literal.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isSignedNumericLiteral(node) {
	return (
		node.type === 'UnaryExpression' &&
		(node.operator === '+' || node.operator === '-') &&
		isNumericLiteral(node.argument)
	);
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isStringLiteral(node) {
	return node.type === 'Literal' && typeof node.value === 'string';
}

/**
 * @param {AST.Node} node
 * @returns {node is AST.BinaryExpression | AST.LogicalExpression}
 */
function isBinaryish(node) {
	return node.type === 'BinaryExpression' || node.type === 'LogicalExpression';
}

/**
 * Prettier's `shouldInlineLogicalExpression`: a logical expression whose right
 * side is a non-empty object or array literal, or a template, breaks inside
 * that literal instead of at the operator.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function shouldInlineLogicalExpression(node) {
	if (node.type !== 'LogicalExpression') {
		return false;
	}
	const { right } = node;
	return (
		(right.type === 'ObjectExpression' && right.properties.length > 0) ||
		(right.type === 'ArrayExpression' && right.elements.length > 0) ||
		isTemplateExpression(right)
	);
}

/**
 * Whether a node is an assignment expression (`a = b`, `a += b`).
 * @param {AST.Node} node
 * @returns {node is AST.AssignmentExpression}
 */
function isAssignment(node) {
	return node.type === 'AssignmentExpression';
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isAssignmentOrVariableDeclarator(node) {
	return isAssignment(node) || node.type === 'VariableDeclarator';
}

/**
 * The leading comments the node at `path` prints ahead of itself: all of them,
 * except the ones inside the parentheses of a type cast.
 * @param {AstPath} path - The path to the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {AST.Comment[]}
 */
function getCommentsAhead(path, options) {
	const typeCastParens = getTypeCastParens(path, options);
	if (typeCastParens) {
		return typeCastParens.ahead;
	}
	const node = /** @type {AST.NodeWithMaybeComments} */ (path.node);
	return node.leadingComments ?? [];
}

/**
 * Prettier's `hasLeadingOwnLineComment`: whether a comment the node prints
 * ahead of itself ends its line.
 * @param {AST.Node} node
 * @param {AST.Comment[]} comments - The comments the node prints ahead of itself
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function hasLeadingOwnLineComment(node, comments, options) {
	if (isTemplateExpression(node)) {
		return hasPrettierIgnore(node);
	}
	const text = /** @type {string} */ (options.originalText);
	return comments.some((comment) =>
		hasNewline(text, /** @type {AST.NodeWithLocation} */ (comment).end),
	);
}

/**
 * Prettier's `isIndentableBlockComment`: a block comment over several lines
 * that each start with `*`, like a JSDoc comment.
 * @param {AST.Comment} comment
 * @returns {boolean}
 */
function isIndentableBlockComment(comment) {
	if (comment.type !== 'Block' || !comment.value.includes('\n')) {
		return false;
	}
	return `*${comment.value}*`
		.split('\n')
		.every((commentLine) => commentLine.trimStart().startsWith('*'));
}

/**
 * Prettier's `shouldHugUnionType`: a union of one object-like type with only
 * `null` or `void` types, which prints inline (`{ … } | null`).
 * @param {AST.TSUnionType} node
 * @returns {boolean}
 */
function shouldHugUnionType(node) {
	const { types } = node;
	if (types.some((type) => hasComment(type))) {
		return false;
	}
	const objectType = types.find(
		(type) => type.type === 'TSTypeLiteral' || type.type === 'TSTypeReference',
	);
	if (!objectType) {
		return false;
	}
	return types.every(
		(type) => type === objectType || type.type === 'TSVoidKeyword' || type.type === 'TSNullKeyword',
	);
}

/**
 * Prettier's `isComplexDestructuring`: an object pattern on the left of more
 * than two properties, some renamed or defaulted, breaks the pattern first.
 * @param {AST.Node} node - The assignment-like node
 * @returns {boolean}
 */
function isComplexDestructuring(node) {
	if (!isAssignmentOrVariableDeclarator(node)) {
		return false;
	}
	const leftNode =
		node.type === 'AssignmentExpression'
			? node.left
			: /** @type {AST.VariableDeclarator} */ (node).id;
	return (
		leftNode.type === 'ObjectPattern' &&
		leftNode.properties.length > 2 &&
		leftNode.properties.some(
			(property) =>
				property.type === 'Property' &&
				!property.method &&
				(!property.shorthand || property.value?.type === 'AssignmentPattern'),
		)
	);
}

/**
 * The type arguments of a type reference (`Foo<A, B>`).
 * @param {AST.Node} node
 * @returns {AST.Node[] | undefined}
 */
function getTypeReferenceArguments(node) {
	if (node.type !== 'TSTypeReference') {
		return undefined;
	}
	const reference =
		/** @type {AST.TSTypeReference & { typeParameters?: AST.TSTypeParameterInstantiation }} */ (
			node
		);
	return (reference.typeArguments ?? reference.typeParameters)?.params;
}

/**
 * Prettier's `hasComplexTypeAnnotation`: a declarator typed with a generic of
 * several type arguments, some generic or conditional themselves.
 * @param {AST.Node} node - The assignment-like node
 * @returns {boolean}
 */
function hasComplexTypeAnnotation(node) {
	if (node.type !== 'VariableDeclarator') {
		return false;
	}
	const typeAnnotation = /** @type {AST.Identifier} */ (node.id).typeAnnotation?.typeAnnotation;
	if (!typeAnnotation) {
		return false;
	}
	const typeArgs = getTypeReferenceArguments(typeAnnotation);
	return (
		!!typeArgs &&
		typeArgs.length > 1 &&
		typeArgs.some(
			(typeArg) =>
				(getTypeReferenceArguments(typeArg)?.length ?? 0) > 0 ||
				typeArg.type === 'TSConditionalType',
		)
	);
}

/**
 * @param {AST.Node} node - The assignment-like node
 * @returns {boolean}
 */
function isArrowFunctionVariableDeclarator(node) {
	return node.type === 'VariableDeclarator' && node.init?.type === 'ArrowFunctionExpression';
}

/**
 * Prettier's `isComplexTypeAliasParams`: a type alias with several type
 * parameters, some constrained or defaulted, breaks them before the `=`.
 * @param {AST.Node} node - The assignment-like node
 * @returns {boolean}
 */
function isComplexTypeAliasParams(node) {
	if (node.type !== 'TSTypeAliasDeclaration') {
		return false;
	}
	const typeParams = node.typeParameters?.params;
	return (
		!!typeParams &&
		typeParams.length > 1 &&
		typeParams.some((param) => param.constraint || param.default)
	);
}

/**
 * Prettier's `shouldBreakBeforeConditionalType`: a conditional type whose
 * check or extends type is generic breaks after the `=`.
 * @param {AST.TSConditionalType} node
 * @returns {boolean}
 */
function shouldBreakBeforeConditionalType(node) {
	const isGeneric = (/** @type {AST.Node} */ type) =>
		type.type === 'TSFunctionType'
			? Boolean(type.typeParameters)
			: getTypeReferenceArguments(type) !== undefined;
	return isGeneric(node.checkType) || isGeneric(node.extendsType);
}

/**
 * Prettier's `isObjectPropertyWithShortKey`: an object property whose key is
 * so short that moving the value below it gains little.
 * @param {AST.Node} node - The assignment-like node
 * @param {Doc} keyDoc - The printed key
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isObjectPropertyWithShortKey(node, keyDoc, options) {
	if (node.type !== 'Property' || node.method || node.kind !== 'init') {
		return false;
	}
	const key = getDocText(keyDoc);
	return key !== null && key.length < (options.tabWidth ?? 2) + 3;
}

/**
 * The text of a doc made only of strings, or null when it holds anything else.
 * @param {Doc} doc
 * @returns {string | null}
 */
function getDocText(doc) {
	if (typeof doc === 'string') {
		return doc;
	}
	if (!Array.isArray(doc)) {
		return null;
	}
	let text = '';
	for (const part of doc) {
		const partText = getDocText(part);
		if (partText === null) {
			return null;
		}
		text += partText;
	}
	return text;
}

/**
 * Prettier's `isTemplateOnItsOwnLine`: a template literal over several lines
 * that starts on the line of the code before it.
 * @param {AST.Node} node
 * @param {string} text - The source text
 * @returns {boolean}
 */
function isTemplateOnItsOwnLine(node, text) {
	const template =
		node.type === 'TemplateLiteral'
			? node
			: node.type === 'TaggedTemplateExpression'
				? node.quasi
				: null;
	return (
		template !== null &&
		template.quasis.some((quasi) => quasi.value.raw.includes('\n')) &&
		!hasNewline(text, /** @type {AST.NodeWithLocation} */ (node).start, { backwards: true })
	);
}

/**
 * Print a property (object property or method)
 * @param {AST.Property} node - The property node
 * @param {AstPath<AST.Property>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[] | Doc}
 */
function printProperty(node, path, options, print) {
	if (node.shorthand) {
		// For shorthand properties, if value is AssignmentPattern, print the value (which includes the default)
		// Otherwise just print the key
		if (node.value.type === 'AssignmentPattern') {
			return path.call(print, 'value');
		}
		return path.call(print, 'key');
	}

	// Handle getter/setter methods
	if (node.kind === 'get' || node.kind === 'set') {
		const methodParts = [];
		const funcValue = /** @type {AST.FunctionExpression} */ (node.value);

		// Add get/set keyword
		methodParts.push(node.kind, ' ');

		methodParts.push(...printKey(node, path, options, print));

		// Print parameters by calling into the value path
		const paramsPart = path.call(
			(valuePath) =>
				printFunctionParameters(
					/** @type {Parameters<typeof printFunctionParameters>[0]} */ (valuePath),
					options,
					print,
				),
			'value',
		);
		methodParts.push(group(paramsPart));

		// Handle return type annotation
		if (funcValue.returnType) {
			methodParts.push(': ', path.call(print, 'value', 'returnType'));
		}

		methodParts.push(' ', path.call(print, 'value', 'body'));
		return methodParts;
	}

	// Handle method shorthand: increment() {} instead of increment: function() {}
	if (node.method && node.value.type === 'FunctionExpression') {
		const methodParts = [];
		const funcValue = /** @type {AST.FunctionExpression} */ (node.value);

		// Handle async and generator
		if (funcValue.async) {
			methodParts.push('async ');
		}

		if (funcValue.generator) {
			methodParts.push('*');
		}

		methodParts.push(...printKey(node, path, options, print));

		// Handle type parameters (generics)
		if (funcValue.typeParameters) {
			methodParts.push(path.call(print, 'value', 'typeParameters'));
		}

		// Print parameters by calling into the value path
		const paramsPart = path.call(
			(valuePath) =>
				printFunctionParameters(
					/** @type {Parameters<typeof printFunctionParameters>[0]} */ (valuePath),
					options,
					print,
				),
			'value',
		);
		methodParts.push(group(paramsPart));

		// Handle return type annotation
		if (funcValue.returnType) {
			methodParts.push(': ', path.call(print, 'value', 'returnType'));
		}

		methodParts.push(' ', path.call(print, 'value', 'body'));
		return methodParts;
	}

	return printAssignment(path, options, print, printKey(node, path, options, print), ':', 'value');
}

/**
 * Print a variable declarator
 * @param {AST.VariableDeclarator} node - The variable declarator node
 * @param {AstPath<AST.VariableDeclarator>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printVariableDeclarator(node, path, options, print) {
	return printAssignment(path, options, print, path.call(print, 'id'), ' =', 'init');
}

/**
 * Print an assignment pattern (default parameter)
 * @param {AST.AssignmentPattern} node - The assignment pattern node
 * @param {AstPath<AST.AssignmentPattern>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printAssignmentPattern(node, path, options, print) {
	// Handle default parameters like: count: number = 0
	return [path.call(print, 'left'), ' = ', path.call(print, 'right')];
}

/**
 * Print a TypeScript type literal
 * @param {AST.TSTypeLiteral} node - The type literal node
 * @param {AstPath<AST.TSTypeLiteral>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printTSTypeLiteral(node, path, options, print) {
	if (!node.members || node.members.length === 0) {
		return printEmptyMemberList(node);
	}

	const members = path.map(print, 'members');
	const inlineMembers = members.map((member, index) =>
		index < members.length - 1 ? [member, ';'] : member,
	);
	const multilineMembers = members.map((member) => [member, ';']);

	const inlineDoc = group(['{', indent([line, join(line, inlineMembers)]), line, '}']);

	const multilineDoc = group([
		'{',
		indent([hardline, join(hardline, multilineMembers)]),
		hardline,
		'}',
	]);

	if (!wasOriginallySingleLine(node)) {
		// A hardline-first conditionalGroup always picks that state (fits()
		// short-circuits to true on hardlines) while hiding the hardlines from
		// enclosing groups' break propagation — ancestors then stay flat and
		// print following siblings past printWidth. The multiline doc alone is
		// equivalent and propagates its breaks correctly.
		return multilineDoc;
	}

	return conditionalGroup([inlineDoc, multilineDoc]);
}

/**
 * Print a TypeScript property signature in an interface
 * @param {AST.TSPropertySignature} node - The property signature node
 * @param {AstPath<AST.TSPropertySignature>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSPropertySignature(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// `readonly` is part of the declared type, not decoration — dropping it
	// silently widens the member to mutable.
	if (node.readonly) {
		parts.push('readonly ');
	}

	// Computed keys keep their brackets — `[Symbol.iterator]` is not `Symbol.iterator`
	if (node.computed) {
		parts.push('[', path.call(print, 'key'), ']');
	} else {
		parts.push(path.call(print, 'key'));
	}

	if (node.optional) {
		parts.push('?');
	}

	if (node.typeAnnotation) {
		parts.push(': ');
		parts.push(path.call(print, 'typeAnnotation'));
	}

	return parts;
}

/**
 * Print a TypeScript method signature in an interface
 * @param {AST.TSMethodSignature} node - The method signature node
 * @param {AstPath<AST.TSMethodSignature>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSMethodSignature(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// Accessor kind — without it `get x(): number` and `set x(v: number)`
	// both collapse to `x(...)`, which is a different (and duplicated) member.
	if (node.kind === 'get') {
		parts.push('get ');
	} else if (node.kind === 'set') {
		parts.push('set ');
	}

	// Print the method name/key, keeping brackets on computed keys
	if (node.computed) {
		parts.push('[', path.call(print, 'key'), ']');
	} else {
		parts.push(path.call(print, 'key'));
	}

	// Add optional marker if present
	if (node.optional) {
		parts.push('?');
	}

	// Add TypeScript generics/type parameters if present
	if (node.typeParameters) {
		const typeParams = path.call(print, 'typeParameters');
		if (Array.isArray(typeParams)) {
			parts.push(...typeParams);
		} else {
			parts.push(typeParams);
		}
	}

	// Print parameters - use 'parameters' property for TypeScript signature nodes
	parts.push('(');
	if (node.parameters && node.parameters.length > 0) {
		const params = path.map(print, 'parameters');
		for (let i = 0; i < params.length; i++) {
			if (i > 0) parts.push(', ');
			parts.push(params[i]);
		}
	}
	parts.push(')');

	// Return type annotation
	if (node.typeAnnotation) {
		parts.push(': ');
		parts.push(path.call(print, 'typeAnnotation'));
	}

	return parts;
}

/**
 * Print a TypeScript call signature in an interface
 * @param {AST.TSCallSignatureDeclaration} node - The call signature node
 * @param {AstPath<AST.TSCallSignatureDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSCallSignatureDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// Add TypeScript generics/type parameters if present
	if (node.typeParameters) {
		const type_params = path.call(print, 'typeParameters');
		if (Array.isArray(type_params)) {
			parts.push(...type_params);
		} else {
			parts.push(type_params);
		}
	}

	parts.push('(');
	if (node.parameters && node.parameters.length > 0) {
		const params = path.map(print, 'parameters');
		for (let i = 0; i < params.length; i++) {
			if (i > 0) parts.push(', ');
			parts.push(params[i]);
		}
	}
	parts.push(')');

	if (node.typeAnnotation) {
		parts.push(': ');
		parts.push(path.call(print, 'typeAnnotation'));
	}

	return parts;
}

/**
 * Print a TypeScript construct signature in an interface or type literal
 * @param {AST.TSConstructSignatureDeclaration} node - The construct signature node
 * @param {AstPath<AST.TSConstructSignatureDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSConstructSignatureDeclaration(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = ['new '];

	if (node.typeParameters) {
		const type_params = path.call(print, 'typeParameters');
		if (Array.isArray(type_params)) {
			parts.push(...type_params);
		} else {
			parts.push(type_params);
		}
	}

	parts.push('(');
	if (node.parameters && node.parameters.length > 0) {
		const params = path.map(print, 'parameters');
		for (let i = 0; i < params.length; i++) {
			if (i > 0) parts.push(', ');
			parts.push(params[i]);
		}
	}
	parts.push(')');

	if (node.typeAnnotation) {
		parts.push(': ');
		parts.push(path.call(print, 'typeAnnotation'));
	}

	return parts;
}

/**
 * Print a TypeScript type reference (e.g., Array<string>)
 * @param {AST.TSTypeReference} node - The type reference node
 * @param {AstPath<AST.TSTypeReference>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSTypeReference(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [path.call(print, 'typeName')];

	// Handle both typeArguments and typeParameters (different AST variations).
	// Both are TSTypeParameterInstantiation nodes, whose printer can break the
	// argument list when it does not fit.
	if (node.typeArguments) {
		parts.push(path.call(print, 'typeArguments'));
		// @ts-expect-error - acorn-typescript uses typeParameters instead of typeArguments
		// we normalize it in the analyze phase, but here we get the parser ast
	} else if (node.typeParameters) {
		// @ts-expect-error - acorn-typescript uses typeParameters instead of typeArguments
		parts.push(path.call(print, 'typeParameters'));
	}

	return parts;
}

/**
 * Print a TypeScript tuple type
 * @param {AST.TSTupleType} node - The tuple type node
 * @param {AstPath<AST.TSTupleType>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSTupleType(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = ['['];
	const elements = node.elementTypes ? path.map(print, 'elementTypes') : [];
	for (let i = 0; i < elements.length; i++) {
		if (i > 0) parts.push(', ');
		parts.push(elements[i]);
	}
	parts.push(']');
	return parts;
}

/**
 * Print a TypeScript named tuple member
 * @param {AST.TSNamedTupleMember} node - The named tuple member node
 * @param {AstPath<AST.TSNamedTupleMember>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSNamedTupleMember(node, path, options, print) {
	return [
		path.call(print, 'label'),
		node.optional ? '?' : '',
		': ',
		path.call(print, 'elementType'),
	];
}

/**
 * Print a TypeScript index signature
 * @param {AST.TSIndexSignature} node - The index signature node
 * @param {AstPath<AST.TSIndexSignature>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSIndexSignature(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	// A static index signature types the constructor, not its instances
	if (node.static === true) {
		parts.push('static ');
	}
	if (node.readonly === true) {
		parts.push('readonly ');
	}

	parts.push('[');
	const params = node.parameters ? path.map(print, 'parameters') : [];
	for (let i = 0; i < params.length; i++) {
		if (i > 0) parts.push(', ');
		parts.push(params[i]);
	}
	parts.push(']');

	if (node.typeAnnotation) {
		parts.push(': ');
		parts.push(path.call(print, 'typeAnnotation'));
	}

	// Interfaces and type literals separate their members, but class members
	// end themselves — without this the class body runs into the next member
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());
	if (parent?.type === 'ClassBody') {
		parts.push(semi(options));
	}

	return parts;
}

/**
 * Print a TypeScript constructor type
 * @param {AST.TSConstructorType} node - The constructor type node
 * @param {AstPath<AST.TSConstructorType>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTSConstructorType(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	// `abstract new () => T` only accepts abstract constructors
	if (node.abstract) {
		parts.push('abstract ');
	}
	parts.push('new ');
	if (node.typeParameters) {
		parts.push(path.call(print, 'typeParameters'));
	}
	parts.push('(');
	const hasParameters = Array.isArray(node.parameters) && node.parameters.length > 0;
	if (hasParameters) {
		const params = path.map(print, 'parameters');
		for (let i = 0; i < params.length; i++) {
			if (i > 0) parts.push(', ');
			parts.push(params[i]);
		}
	}
	parts.push(')');
	parts.push(' => ');
	if (node.typeAnnotation) {
		parts.push(path.call(print, 'typeAnnotation'));
	}
	return parts;
}

/**
 * Print a TypeScript conditional type
 * @param {AST.TSConditionalType} node - The conditional type node
 * @param {AstPath<AST.TSConditionalType>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printTSConditionalType(node, path, options, print) {
	const trueType = path.call(print, 'trueType');
	const falseType = path.call(print, 'falseType');

	const shouldIndentTrueType = node.trueType.type !== 'TSConditionalType';
	const shouldIndentFalseType = node.falseType.type !== 'TSConditionalType';

	return group([
		path.call(print, 'checkType'),
		' extends ',
		path.call(print, 'extendsType'),
		indent([line, '? ', shouldIndentTrueType ? indent(trueType) : trueType]),
		indent([line, ': ', shouldIndentFalseType ? indent(falseType) : falseType]),
	]);
}

/**
 * Print a TypeScript mapped type
 * @param {AST.TSMappedType} node - The mapped type node
 * @param {AstPath<AST.TSMappedType>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[] | Doc}
 */
function printTSMappedType(node, path, options, print) {
	const readonlyMod =
		node.readonly === true || node.readonly === '+'
			? 'readonly '
			: node.readonly === '-'
				? '-readonly '
				: '';

	let optionalMod = '';
	if (node.optional === true || node.optional === '+') {
		optionalMod = '?';
	} else if (node.optional === '-') {
		optionalMod = '-?';
	}

	/** @type {Doc[]} */
	const innerParts = [];
	const typeParam = node.typeParameter;
	innerParts.push('[');
	if (typeParam) {
		// name
		innerParts.push(typeParam.name);
		innerParts.push(' in ');
		if (typeParam.constraint) {
			innerParts.push(path.call(print, 'typeParameter', 'constraint'));
		} else {
			innerParts.push(path.call(print, 'typeParameter'));
		}
		if (node.nameType) {
			innerParts.push(' as ');
			innerParts.push(path.call(print, 'nameType'));
		}
	}
	innerParts.push(']');
	innerParts.push(optionalMod);
	if (node.typeAnnotation) {
		innerParts.push(': ');
		innerParts.push(path.call(print, 'typeAnnotation'));
	}

	return group(['{ ', readonlyMod, innerParts, ' }']);
}

/**
 * @param {AST.TSQualifiedName} node
 * @param {AstPath<AST.TSQualifiedName>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc}
 */
function printTSQualifiedName(node, path, options, print) {
	return [path.call(print, 'left'), '.', path.call(print, 'right')];
}

/**
 * @param {AST.TSImportType} node
 * @param {AstPath<AST.TSImportType>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc}
 */
function printTSImportType(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = ['import(', path.call(print, 'argument'), ')'];

	if (node.qualifier) {
		parts.push('.', path.call(print, 'qualifier'));
	}

	// acorn-typescript stores import type arguments on typeArguments
	if (node.typeArguments) {
		parts.push(path.call(print, 'typeArguments'));
	} else if (node.typeParameters) {
		parts.push(path.call(print, 'typeParameters'));
	}

	return parts;
}

/**
 * @param {AST.TSIndexedAccessType} node
 * @param {AstPath<AST.TSIndexedAccessType>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc}
 */
function printTSIndexedAccessType(node, path, options, print) {
	return [path.call(print, 'objectType'), '[', path.call(print, 'indexType'), ']'];
}

/**
 * Print direct TSRX text so it can wrap like JSX text when an element body breaks.
 * @param {string} raw
 * @returns {Doc}
 */
function printRawText(raw) {
	const text = raw.trim().replace(/(?:\r\n|\r|\n)[^\S\r\n]+/gu, ' ');
	if (!text) {
		return '';
	}

	return fill(
		text
			.split(/([^\S\r\n]+)/u)
			.filter(Boolean)
			.map((part) => {
				return /^[^\S\r\n]+$/u.test(part) ? line : replaceEndOfLine(part);
			}),
	);
}

/**
 * @param {string} raw
 * @returns {Doc | Doc[] | string}
 */
function printJSXTextChild(raw) {
	const text = raw.trim();
	if (!text) {
		return '';
	}

	const lines = text
		.split(/\r\n|\r|\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length <= 1) {
		return lines[0] ?? '';
	}

	return join(hardline, lines);
}

/**
 * True when two consecutive printed JSX children stay glued on one line:
 * a text child directly adjacent (no whitespace) to its neighbor, as in
 * `{a}/{b}` or `<span>x</span>text`. Matches vanilla Prettier, which only
 * keeps siblings together across a whitespace-free text boundary — adjacent
 * expressions or elements (`{a}{b}`, `</p><p>`) still get their own lines.
 * @param {any} prevNode - Last source node of the previous printed child
 * @param {any} nextNode - First source node of the next printed child
 * @returns {boolean}
 */
function isGluedJSXPair(prevNode, nextNode) {
	if (prevNode?.type !== 'JSXText' && nextNode?.type !== 'JSXText') {
		return false;
	}
	if (typeof prevNode?.end !== 'number' || prevNode.end !== nextNode?.start) {
		return false;
	}
	if (hasComment(prevNode) || hasComment(nextNode)) {
		return false;
	}
	if (prevNode.type === 'JSXText' && /\s$/u.test(prevNode.value)) {
		return false;
	}
	if (nextNode.type === 'JSXText' && /^\s/u.test(nextNode.value)) {
		return false;
	}
	return true;
}

/**
 * Print a run of glued JSX children as one unit. Words inside text entries can
 * still wrap at their own spaces, but glued boundaries get no break opportunity.
 * @param {(Doc | string)[]} entries
 * @returns {Doc}
 */
function printGluedJSXChildren(entries) {
	/** @type {Doc[]} */
	const parts = [];
	/** @type {Doc[]} */
	let current = [];
	const flush = () => {
		if (current.length > 0) {
			parts.push(current.length === 1 ? current[0] : current);
			current = [];
		}
	};
	for (const entry of entries) {
		if (typeof entry === 'string') {
			const words = entry.trim().split(/\s+/u);
			for (let i = 0; i < words.length; i++) {
				if (i > 0) {
					flush();
					parts.push(line);
				}
				current.push(words[i]);
			}
		} else {
			current.push(entry);
		}
	}
	flush();
	return parts.length === 1 ? parts[0] : fill(parts);
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeInlineJSXText(raw) {
	const text = raw.replace(/[^\S\r\n]+/gu, ' ');
	return text.trim() || !/[\r\n]/u.test(text) ? text : '';
}

/**
 * @param {AST.Node} child
 * @returns {boolean}
 */
function isSimpleJSXExpressionChild(child) {
	if (child?.type !== 'JSXExpressionContainer') {
		return false;
	}

	const expression = child.expression;
	return (
		expression?.type === 'Identifier' ||
		expression?.type === 'Literal' ||
		expression?.type === 'TemplateLiteral' ||
		expression?.type === 'MemberExpression' ||
		expression?.type === 'CallExpression' ||
		expression?.type === 'BinaryExpression' ||
		expression?.type === 'LogicalExpression' ||
		// Text holes like `{expr as string}` are as simple as their operand
		expression?.type === 'TSAsExpression'
	);
}

/**
 * Print a JSX element
 * @param {AST.TSRXJSXElement | AST.JSXStyleElement} node - The JSX element node
 * @param {AstPath<AST.TSRXJSXElement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc | Doc[]}
 */
function printJSXElement(node, path, options, print) {
	// Get the tag name from the opening element
	const openingElement = node.openingElement;
	const closingElement = node.closingElement;

	// Dynamic tags (`<{expr}>`) print the opening expression for both tags so
	// they stay textually identical; static names print as plain strings.
	const tagName =
		openingElement.name.type === 'JSXExpressionContainer'
			? ['{', path.call(print, 'openingElement', 'name', 'expression'), '}']
			: printJSXElementName(openingElement.name);

	const isSelfClosing = openingElement.selfClosing;
	const hasAttributes = openingElement.attributes && openingElement.attributes.length > 0;
	const hasChildren = node.children && node.children.length > 0;

	/** @type {Doc} */
	let typeArgsDoc = '';
	if (openingElement.typeArguments) {
		typeArgsDoc = path.call(print, 'openingElement', 'typeArguments');
	}

	// Comments that sit inside the opening tag (before an attribute) are attached
	// by the parser to a body child; pull them out and key them by the attribute
	// they precede so they print in the opening tag, not jammed into the body.
	const openingTagCommentsByAttr = collectOpeningTagComments(node);
	const hasOpeningTagComments = openingTagCommentsByAttr.size > 0;

	// Format attributes
	/** @type {Doc} */
	let attributesDoc = '';
	let hasBreakingAttribute = false;
	if (hasAttributes) {
		/** @type {Doc[]} */
		const attrs = openingElement.attributes.map(
			(/** @type {AST.Node} */ attr, /** @type {number} */ i) => {
				/** @type {Doc} */
				let attrDoc = '';
				if (attr.type === 'JSXAttribute') {
					attrDoc = path.call(
						(attrPath) =>
							printJSXAttribute(
								/** @type {ESTreeJSX.JSXAttribute} */ (attrPath.node),
								/** @type {AstPath<ESTreeJSX.JSXAttribute>} */ (attrPath),
								options,
								print,
							),
						'openingElement',
						'attributes',
						i,
					);
				} else if (attr.type === 'JSXSpreadAttribute') {
					attrDoc = ['{...', path.call(print, 'openingElement', 'attributes', i, 'argument'), '}'];
				}
				if (!hasBreakingAttribute && attrDoc && willBreak(attrDoc)) {
					hasBreakingAttribute = true;
				}
				const lead = openingTagCommentsByAttr.get(i);
				if (lead) {
					/** @type {Doc[]} */
					const parts = [];
					for (const comment of lead) {
						parts.push(
							comment.type === 'Line' ? '//' + comment.value : '/*' + comment.value + '*/',
						);
						parts.push(hardline);
					}
					return [...parts, attrDoc];
				}
				return attrDoc;
			},
		);
		const attrLineBreak = options.singleAttributePerLine ? hardline : line;
		attributesDoc = indent([attrLineBreak, join(attrLineBreak, attrs)]);
	}
	const shouldForceBreak = hasBreakingAttribute || hasOpeningTagComments;

	if (isSelfClosing) {
		return group(['<', tagName, typeArgsDoc, attributesDoc, hasAttributes ? line : ' ', '/>'], {
			shouldBreak: shouldForceBreak,
		});
	}

	const openingTag = group(
		[
			'<',
			tagName,
			typeArgsDoc,
			attributesDoc,
			hasAttributes && !options.bracketSameLine ? softline : '',
			'>',
		],
		{ shouldBreak: shouldForceBreak },
	);

	// Raw-text `<script>` element: the body lives on `node.content`, mirrored as a
	// single JSXText child (see the parser's `#parseScriptElement`). Print that
	// child — embed() formats it as TypeScript — in a block layout, bypassing the
	// generic children path so the body is never whitespace-merged as markup text.
	if (isRawScriptElement(node)) {
		if (!hasChildren) {
			return [openingTag, '</', tagName, '>'];
		}
		return group([
			openingTag,
			indent([hardline, path.call(print, 'children', 0)]),
			hardline,
			'</',
			tagName,
			'>',
		]);
	}

	// Comments before `</tag>` and the comments of a comment-only element.
	const { closingCommentDocs, innerCommentDocs } = collectElementBodyCommentDocs(
		/** @type {AST.TSRXJSXElement} */ (node),
		openingElement,
		node.closingElement,
	);
	const hasClosingComments = closingCommentDocs.length > 0;

	if (!hasChildren) {
		const bodyComments = [...innerCommentDocs, ...closingCommentDocs];
		if (bodyComments.length > 0) {
			return group([openingTag, indent(bodyComments), hardline, '</', tagName, '>']);
		}
		return [openingTag, '</', tagName, '>'];
	}

	// A `@{ … }` code block is the whole body and hugs the tags: `<div>@{ … }</div>`.
	if (node.children.length === 1 && node.children[0].type === 'JSXCodeBlock') {
		return group([openingTag, path.call(print, 'children', 0), '</', tagName, '>']);
	}

	// Format children - filter out empty text nodes and merge adjacent text nodes.
	// childNodes tracks the source node behind each doc (a text run is a single
	// JSXText) so the join can preserve authored blank lines; childEndNodes tracks
	// the last source node so glued neighbors can be detected by position.
	const childrenDocs = [];
	const childNodes = [];
	const childEndNodes = [];
	let currentText = '';
	let currentTextNode = null;
	let currentTextEndNode = null;

	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];

		if (child.type === 'JSXText') {
			if (hasComment(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (child))) {
				if (currentText) {
					childrenDocs.push(currentText);
					childNodes.push(currentTextNode);
					childEndNodes.push(currentTextEndNode);
					currentText = '';
					currentTextNode = null;
					currentTextEndNode = null;
				}
				const printedChild = path.call(print, 'children', i);
				if (printedChild !== '') {
					childrenDocs.push(printedChild);
					childNodes.push(child);
					childEndNodes.push(child);
				}
				continue;
			}
			// Accumulate text content, preserving meaningful boundary spaces.
			const text = normalizeInlineJSXText(child.value);
			if (text) {
				const nextChild = node.children[i + 1];
				const afterNextChild = node.children[i + 2];
				const nextText = afterNextChild?.type === 'JSXText' ? afterNextChild.value.trim() : '';
				if (
					tagName === 'tsrx' &&
					text.trimEnd().endsWith('=') &&
					nextChild?.type === 'JSXElement' &&
					nextText === ';'
				) {
					if (currentText) {
						childrenDocs.push(currentText);
						childNodes.push(currentTextNode);
						childEndNodes.push(currentTextEndNode);
						currentText = '';
						currentTextNode = null;
						currentTextEndNode = null;
					}
					childrenDocs.push([text.trim(), ' ', path.call(print, 'children', i + 1), ';']);
					childNodes.push(child);
					childEndNodes.push(afterNextChild);
					i += 2;
					continue;
				}

				if (currentText) {
					currentText += currentText.endsWith(' ') || text.startsWith(' ') ? text : ' ' + text;
				} else {
					currentText = text;
					currentTextNode = child;
				}
				currentTextEndNode = child;
			}
		} else {
			// If we have accumulated text, push it before the non-text node
			if (currentText) {
				childrenDocs.push(currentText);
				childNodes.push(currentTextNode);
				childEndNodes.push(currentTextEndNode);
				currentText = '';
				currentTextNode = null;
				currentTextEndNode = null;
			}

			if (child.type === 'JSXExpressionContainer') {
				// Handle JSX expression containers
				childrenDocs.push([
					...printTemplateChildLeadingComments(child),
					'{',
					path.call(print, 'children', i, 'expression'),
					'}',
					...printTemplateChildTrailingComments(child),
				]);
				childNodes.push(child);
				childEndNodes.push(child);
			} else {
				// Handle nested JSX elements
				childrenDocs.push(path.call(print, 'children', i));
				childNodes.push(child);
				childEndNodes.push(child);
			}
		}
	}

	// Don't forget any remaining text
	if (currentText) {
		childrenDocs.push(currentText);
		childNodes.push(currentTextNode);
		childEndNodes.push(currentTextEndNode);
	}

	// A child with leading comments must break onto its own line, so the comment
	// reads above the child rather than being jammed onto the opening tag.
	const hasChildLeadingComments = node.children.some((child) => {
		const leadingComments = /** @type {AST.NodeWithMaybeComments} */ (child).leadingComments;
		return Array.isArray(leadingComments) && leadingComments.length > 0;
	});
	const forceMultiline = hasClosingComments || hasChildLeadingComments;
	const singleChildNode = childNodes.length === 1 ? childNodes[0] : null;
	const hasAuthoredMultilineSingleTextChild =
		singleChildNode?.type === 'JSXText' && /[\r\n]/u.test(singleChildNode.value);

	// Check if content can be inlined (single text node or single expression).
	// Trailing or child-leading comments force the multi-line layout. A single
	// text child stays inline when it fits and otherwise fills/wraps to printWidth.
	if (
		!forceMultiline &&
		!hasAuthoredMultilineSingleTextChild &&
		childrenDocs.length === 1 &&
		typeof childrenDocs[0] === 'string'
	) {
		// The open tag breaks for attributes independently; the text+closing get
		// their own group so the text only drops to its own (filled) lines when it
		// itself overflows — otherwise it hugs `>text</tag>`.
		return [
			openingTag,
			group([indent([softline, printRawText(childrenDocs[0])]), softline, '</', tagName, '>']),
		];
	}
	const meaningfulChildren = node.children.filter(
		(child) => child.type !== 'JSXText' || child.value.trim(),
	);
	const singleMeaningfulChild = meaningfulChildren.length === 1 ? meaningfulChildren[0] : null;
	const singleExpression =
		singleMeaningfulChild?.type === 'JSXExpressionContainer'
			? singleMeaningfulChild.expression
			: null;
	if (
		!forceMultiline &&
		childrenDocs.length === 1 &&
		(singleExpression?.type === 'BinaryExpression' ||
			singleExpression?.type === 'LogicalExpression')
	) {
		// Keep a short operation against its tags, but give a wrapping operation
		// an indented element body instead of aligning continuations after `{`.
		// Group the opening tag with that body so wrapped attributes break both.
		return group([openingTag, indent([softline, childrenDocs[0]]), softline, '</', tagName, '>']);
	}
	if (
		!forceMultiline &&
		childrenDocs.length === 1 &&
		singleMeaningfulChild?.type === 'JSXExpressionContainer' &&
		isSimpleJSXExpressionChild(/** @type {AST.Node} */ (singleMeaningfulChild))
	) {
		return group([openingTag, childrenDocs[0], '</', tagName, '>']);
	}
	if (
		!forceMultiline &&
		childrenDocs.length > 1 &&
		wasOriginallySingleLine(node) &&
		node.children.some((child) => child.type === 'JSXText') &&
		node.children.every(
			(child) =>
				child.type === 'JSXText' || isSimpleJSXExpressionChild(/** @type {AST.Node} */ (child)),
		)
	) {
		return group([openingTag, ...childrenDocs, '</', tagName, '>']);
	}

	// Multiple children or complex children - format with line breaks. Text runs
	// fill/wrap to printWidth. Children with no whitespace between them in the
	// source (`{a}/{b}`) stay glued as a single unit.
	const formattedChildren = [];
	for (let i = 0; i < childrenDocs.length; i++) {
		const unitEntries = [childrenDocs[i]];
		while (i < childrenDocs.length - 1 && isGluedJSXPair(childEndNodes[i], childNodes[i + 1])) {
			i++;
			unitEntries.push(childrenDocs[i]);
		}
		if (unitEntries.length === 1) {
			const childDoc = unitEntries[0];
			formattedChildren.push(typeof childDoc === 'string' ? printRawText(childDoc) : childDoc);
		} else {
			formattedChildren.push(printGluedJSXChildren(unitEntries));
		}
		if (i < childrenDocs.length - 1) {
			// Preserve a single authored blank line between children (2+ collapse to 1).
			const blank = getBlankLinesBetweenNodes(childNodes[i], leadingAnchor(childNodes[i + 1])) > 0;
			formattedChildren.push(blank ? [hardline, hardline] : hardline);
		}
	}

	// Build the final element
	return group([
		openingTag,
		indent([hardline, ...formattedChildren, ...closingCommentDocs]),
		hardline,
		'</',
		tagName,
		'>',
	]);
}

/**
 * Print a JSX fragment (<>...</>)
 * @param {AST.TSRXJSXFragment} node - The JSX fragment node
 * @param {AstPath<AST.TSRXJSXFragment>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printJSXFragment(node, path, options, print) {
	const hasChildren = node.children && node.children.length > 0;

	// Comments before `</>` and the comments of a comment-only fragment.
	const { closingCommentDocs, innerCommentDocs } = collectElementBodyCommentDocs(
		node,
		node.openingFragment,
		node.closingFragment,
	);

	if (!hasChildren) {
		const bodyComments = [...innerCommentDocs, ...closingCommentDocs];
		if (bodyComments.length > 0) {
			return group(['<>', indent(bodyComments), hardline, '</>']);
		}
		return '<></>';
	}

	// A `@{ … }` code block is the whole body and hugs the tags: `<>@{ … }</>`.
	if (node.children.length === 1 && node.children[0].type === 'JSXCodeBlock') {
		return group(['<>', path.call(print, 'children', 0), '</>']);
	}

	// Format children - filter out empty text nodes. childNodes tracks the source
	// node behind each doc so the join can preserve authored blank lines.
	const childrenDocs = [];
	const childNodes = [];
	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];

		if (child.type === 'JSXText') {
			if (hasComment(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (child))) {
				const printedChild = path.call(print, 'children', i);
				if (printedChild !== '') {
					childrenDocs.push(printedChild);
					childNodes.push(child);
				}
				continue;
			}
			// Handle JSX text nodes - trim whitespace and only include if not empty
			const text = printJSXTextChild(child.value);
			if (text) {
				childrenDocs.push(text);
				childNodes.push(child);
			}
		} else if (child.type === 'JSXExpressionContainer') {
			// Handle JSX expression containers
			childrenDocs.push([
				...printTemplateChildLeadingComments(child),
				'{',
				path.call(print, 'children', i, 'expression'),
				'}',
				...printTemplateChildTrailingComments(child),
			]);
			childNodes.push(child);
		} else {
			// Handle nested JSX elements and fragments
			childrenDocs.push(path.call(print, 'children', i));
			childNodes.push(child);
		}
	}

	// Check if content can be inlined (single text node or single expression)
	if (
		childrenDocs.length === 1 &&
		typeof childrenDocs[0] === 'string' &&
		closingCommentDocs.length === 0
	) {
		return ['<>', childrenDocs[0], '</>'];
	}
	const meaningfulChildren = node.children.filter(
		(child) => child.type !== 'JSXText' || child.value.trim(),
	);
	if (
		childrenDocs.length === 1 &&
		meaningfulChildren.length === 1 &&
		meaningfulChildren[0].type === 'JSXElement' &&
		wasOriginallySingleLine(node) &&
		closingCommentDocs.length === 0 &&
		!willBreak(childrenDocs[0])
	) {
		// Keep the fragment inline when it fits; otherwise expand `<>` onto its own
		// lines so a breaking single child reads as `<>\n  <Child …/>\n</>` rather than
		// `<><Child` with only the child's attributes broken.
		return conditionalGroup([
			['<>', childrenDocs[0], '</>'],
			group(['<>', indent([hardline, childrenDocs[0]]), hardline, '</>']),
		]);
	}

	// Multiple children or complex children - format with line breaks. Children
	// with no whitespace between them in the source (`{a}/{b}`) stay glued as a
	// single unit.
	const formattedChildren = [];
	for (let i = 0; i < childrenDocs.length; i++) {
		const unitEntries = [childrenDocs[i]];
		while (i < childrenDocs.length - 1 && isGluedJSXPair(childNodes[i], childNodes[i + 1])) {
			i++;
			unitEntries.push(childrenDocs[i]);
		}
		formattedChildren.push(
			unitEntries.length === 1 ? unitEntries[0] : printGluedJSXChildren(unitEntries),
		);
		if (i < childrenDocs.length - 1) {
			// Preserve a single authored blank line between children (2+ collapse to 1).
			const blank = getBlankLinesBetweenNodes(childNodes[i], leadingAnchor(childNodes[i + 1])) > 0;
			formattedChildren.push(blank ? [hardline, hardline] : hardline);
		}
	}

	// Build the final fragment
	return group([
		'<>',
		indent([hardline, ...formattedChildren, ...closingCommentDocs]),
		hardline,
		'</>',
	]);
}

/**
 * Comments written inside an opening tag, before an attribute, are attached by
 * the parser to the next visited body child (positionally they sort before the
 * opening tag's end, but the child is visited first). Pull those out of the
 * children and return a map from attribute index to the comments that precede it,
 * so the element printer can render them in the opening tag instead of the body.
 * @param {AST.TSRXJSXElement | AST.JSXStyleElement} node
 * @returns {Map<number, AST.Comment[]>}
 */
function collectOpeningTagComments(node) {
	/** @type {Map<number, AST.Comment[]>} */
	const byAttr = new Map();
	const openingElement = /** @type {AST.NodeWithLocation} */ (node.openingElement);
	const attributes = node.openingElement?.attributes ?? [];
	if (!openingElement || attributes.length === 0 || !Array.isArray(node.children)) {
		return byAttr;
	}
	const openingEnd = openingElement.end;
	/** @type {AST.Comment[]} */
	const collected = [];
	for (const child of node.children) {
		const lead = /** @type {AST.NodeWithMaybeComments} */ (child).leadingComments;
		if (!Array.isArray(lead) || lead.length === 0) continue;
		const keep = [];
		for (const comment of lead) {
			if (typeof comment.start === 'number' && comment.start < openingEnd) {
				collected.push(comment);
			} else {
				keep.push(comment);
			}
		}
		if (keep.length !== lead.length) {
			child.leadingComments = keep;
		}
	}
	if (collected.length === 0) return byAttr;
	collected.sort((a, b) => /** @type {number} */ (a.start) - /** @type {number} */ (b.start));
	let ci = 0;
	for (let ai = 0; ai < attributes.length; ai++) {
		const attrStart = /** @type {AST.NodeWithLocation} */ (attributes[ai]).start;
		/** @type {AST.Comment[]} */
		const forAttr = [];
		while (ci < collected.length && /** @type {number} */ (collected[ci].start) < attrStart) {
			forAttr.push(collected[ci]);
			ci++;
		}
		if (forAttr.length > 0) byAttr.set(ai, forAttr);
	}
	return byAttr;
}

/**
 * Build doc parts for a template child's leading comments (each on its own line).
 * Used for `{expr}` children, whose `{ … }` form is printed inline by the JSX
 * printers and so would otherwise skip the node's attached leading comments.
 * @param {AST.Node & AST.NodeWithMaybeComments} child
 * @returns {Doc[]}
 */
function printTemplateChildLeadingComments(child) {
	const comments = child.leadingComments;
	if (!comments || comments.length === 0) {
		return [];
	}
	/** @type {Doc[]} */
	const parts = [];
	for (let i = 0; i < comments.length; i++) {
		const comment = comments[i];
		if (comment.type === 'Line') {
			parts.push('//' + comment.value);
		} else if (comment.type === 'Block') {
			parts.push('/*' + comment.value + '*/');
		}
		parts.push(hardline);
		const next = comments[i + 1];
		if (next && getBlankLinesBetweenNodes(comment, next) > 0) {
			parts.push(hardline);
		}
	}
	return parts;
}

/**
 * Build doc parts for a template child's trailing comments (kept on the same
 * line as the child). Used for `{expr}` children, whose `{ … }` form is printed
 * inline by the JSX printers and so would otherwise skip the node's attached
 * trailing comments.
 * @param {AST.Node & AST.NodeWithMaybeComments} child
 * @returns {Doc[]}
 */
function printTemplateChildTrailingComments(child) {
	const comments = child.trailingComments;
	if (!comments || comments.length === 0) {
		return [];
	}
	/** @type {Doc[]} */
	const parts = [];
	for (const comment of comments) {
		if (comment.type === 'Line') {
			parts.push(lineSuffix([' ', '//' + comment.value]));
			parts.push(breakParent);
		} else if (comment.type === 'Block') {
			parts.push(' /*' + comment.value + '*/');
		}
	}
	return parts;
}

/**
 * Collect and print the comments that belong to an element/fragment body:
 * trailing comments after the last child (attached by the parser to the closing
 * tag's `leadingComments` or, when the last child is an `{expr}` container, to
 * `metadata.elementLeadingComments` positioned inside the body) and the comments
 * of a comment-only body (`innerComments`).
 * @param {AST.TSRXJSXElement | AST.TSRXJSXFragment} node
 * @param {AST.TSRXJSXElement['openingElement'] | AST.TSRXJSXFragment['openingFragment']} openingNode
 * @param {AST.TSRXJSXElement['closingElement'] | AST.TSRXJSXFragment['closingFragment']} closingNode
 * @returns {{ closingCommentDocs: Doc[], innerCommentDocs: Doc[] }}
 */
function collectElementBodyCommentDocs(node, openingNode, closingNode) {
	const openingEnd = openingNode?.end;
	const bodyMetaComments = (node.metadata?.elementLeadingComments ?? []).filter(
		(/** @type {AST.Comment} */ comment) =>
			typeof comment.start === 'number' &&
			typeof openingEnd === 'number' &&
			comment.start >= openingEnd,
	);
	const trailingComments = [...(closingNode?.leadingComments ?? []), ...bodyMetaComments].sort(
		(/** @type {AST.Comment} */ a, /** @type {AST.Comment} */ b) =>
			/** @type {number} */ (a.start) - /** @type {number} */ (b.start),
	);
	const lastMeaningfulChild = [...(node.children ?? [])]
		.reverse()
		.find((child) => child.type !== 'JSXText' || child.value.trim());
	return {
		closingCommentDocs: printElementBodyComments(trailingComments, lastMeaningfulChild),
		innerCommentDocs: printElementBodyComments(node.innerComments),
	};
}

/**
 * Build doc parts for comments attached to an element body — trailing
 * comments before `</tag>` (`closingElement.leadingComments`) or the comments of a
 * comment-only element (`innerComments`). Each comment is emitted on its own line
 * at the children indent.
 * @param {AST.Comment[] | null | undefined} commentList
 * @param {any} [previousNode]
 * @param {string} [text] - The original source, for comments after statements.
 *   Like Prettier's trailing comments, a blank line is kept only when the line
 *   right before the comment is empty, so a line holding a `;` that isn't
 *   printed doesn't count.
 * @returns {Doc[]}
 */
function printElementBodyComments(commentList, previousNode = null, text) {
	const comments = commentList ?? [];
	if (comments.length === 0) {
		return [];
	}
	/** @type {Doc[]} */
	const parts = [];
	/** @type {AST.Node | AST.Comment | null | undefined} */
	let prev = previousNode;
	for (let i = 0; i < comments.length; i++) {
		parts.push(hardline);
		// Preserve a blank line before this comment if one existed in source.
		if (
			prev &&
			(text === undefined
				? getBlankLinesBetweenNodes(prev, comments[i]) > 0
				: isPreviousLineEmpty(text, /** @type {AST.NodeWithLocation} */ (comments[i]).start))
		) {
			parts.push(hardline);
		}
		parts.push(
			comments[i].type === 'Line' ? '//' + comments[i].value : '/*' + comments[i].value + '*/',
		);
		prev = comments[i];
	}
	return parts;
}

/**
 * Print a TSRX code block: setup statements then the single render output.
 * Callers in element/fragment body position hug it to the surrounding tags;
 * on its own as an arrow body it stands alone.
 * @param {AST.JSXCodeBlock} node
 * @param {AstPath<AST.JSXCodeBlock>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc}
 */
function printJSXCodeBlock(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	for (let i = 0; i < node.body.length; i++) {
		parts.push(path.call(print, 'body', i));
		if (i < node.body.length - 1) {
			parts.push(
				shouldAddBlankLine(node.body[i], node.body[i + 1], options)
					? [hardline, hardline]
					: hardline,
			);
		}
	}
	if (node.render) {
		if (node.body.length > 0) {
			// Preserve a blank line between the last setup statement and the render
			// output, as between setup statements
			const last = node.body[node.body.length - 1];
			parts.push(shouldAddBlankLine(last, node.render, options) ? [hardline, hardline] : hardline);
		}
		parts.push(path.call(print, 'render'));
	}
	// Trailing comments after the last statement/render inside the block.
	parts.push(
		...printElementBodyComments(
			node.innerComments,
			node.render ?? node.body[node.body.length - 1],
			/** @type {string} */ (options.originalText),
		),
	);
	if (parts.length === 0) {
		return '@{}';
	}
	return group(['@{', indent([hardline, ...parts]), hardline, '}']);
}

/**
 * Print a JSX attribute
 * @param {ESTreeJSX.JSXAttribute} attr - The JSX attribute node
 * @param {AstPath<ESTreeJSX.JSXAttribute>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc | Doc[]}
 */
function printJSXAttribute(attr, path, options, print) {
	// `attr.name` is either a JSXIdentifier (regular `class`, `id`, ...) or a
	// JSXNamespacedName (`xlink:href`, `xmlns:xlink`, ...). The previous cast
	// to JSXIdentifier yielded a raw AST node as `name` for namespaced attrs,
	// which then leaked into the doc tree and crashed prettier's traversal
	// with `Unexpected doc.type 'JSXIdentifier'` (see svg-attributes.tsrx +
	// tsrx-features.tsrx fixtures). Mirror printJSXElementName's logic.
	const name =
		attr.name.type === 'JSXNamespacedName'
			? /** @type {ESTreeJSX.JSXNamespacedName} */ (attr.name).namespace.name +
				':' +
				/** @type {ESTreeJSX.JSXNamespacedName} */ (attr.name).name.name
			: /** @type {ESTreeJSX.JSXIdentifier} */ (attr.name).name;

	if (attr.shorthand) {
		return ['{', name, '}'];
	}

	if (!attr.value) {
		return name;
	}

	if (attr.value.type === 'Literal') {
		return [
			name,
			'=',
			printJSXAttributeString(/** @type {AST.SimpleLiteral} */ (attr.value), options),
		];
	}

	if (attr.value.type === 'JSXExpressionContainer') {
		const expression = attr.value.expression;
		if (expression.type === 'Literal' && typeof expression.value === 'string') {
			const quote = getJSXAttributeStringQuote(expression, options);
			if (quote) {
				return [name, '=', quote, expression.value, quote];
			}
		}
		const exprDoc = path.call(print, 'value', 'expression');
		return [name, '={', exprDoc, '}'];
	}

	return name;
}

/**
 * Pick the quote that needs fewer escapes in `text`, preferring the
 * configured one on a tie, like Prettier's `getPreferredQuote`.
 * @param {string} text
 * @param {boolean | undefined} preferSingleQuote
 * @returns {'"' | "'"}
 */
function getPreferredQuote(text, preferSingleQuote) {
	const preferred = preferSingleQuote ? "'" : '"';
	const alternate = preferSingleQuote ? '"' : "'";
	let preferredCount = 0;
	let alternateCount = 0;
	for (const char of text) {
		if (char === preferred) preferredCount++;
		else if (char === alternate) alternateCount++;
	}
	return preferredCount > alternateCount ? alternate : preferred;
}

/**
 * Print a JSX attribute string (`title="Hello"`) from its source text, as
 * Prettier does. The literal's `value` has its HTML entities decoded, so
 * writing it back would turn `&quot;` into a bare delimiter and `&amp;amp;`
 * into `&amp;`. Only the delimiter changes, and the chosen quote is encoded
 * as an entity wherever it appears inside.
 * @param {AST.SimpleLiteral} literal
 * @param {TsrxFormatOptions} options
 * @returns {string}
 */
function printJSXAttributeString(literal, options) {
	const raw = literal.raw;
	const content = (
		isQuotedStringRaw(raw) ? raw.slice(1, -1) : String(literal.value).replaceAll('&', '&amp;')
	)
		.replaceAll('&apos;', "'")
		.replaceAll('&quot;', '"');
	const quote = getPreferredQuote(content, options.jsxSingleQuote);
	return quote + content.replaceAll(quote, quote === '"' ? '&quot;' : '&apos;') + quote;
}

/**
 * Pick the quote for printing a string expression container
 * (`title={"Hello"}`) as a plain attribute string (`title="Hello"`), or
 * `null` when the container has to stay. An attribute string has no escape
 * sequences and decodes HTML entities, so the value moves over unchanged
 * only when the literal spells it out verbatim (escaped quotes aside), it has
 * no `&`, and one quote character is free to delimit it.
 * @param {AST.Literal} literal
 * @param {TsrxFormatOptions} options
 * @returns {'"' | "'" | null}
 */
function getJSXAttributeStringQuote(literal, options) {
	const value = literal.value;
	const raw = literal.raw;
	if (
		typeof value !== 'string' ||
		!isQuotedStringRaw(raw) ||
		value.includes('&') ||
		raw.slice(1, -1).replace(/\\(["'])/g, '$1') !== value
	) {
		return null;
	}

	const preferred = options.jsxSingleQuote ? "'" : '"';
	const alternate = options.jsxSingleQuote ? '"' : "'";
	if (!value.includes(preferred)) return preferred;
	if (!value.includes(alternate)) return alternate;
	return null;
}

/**
 * Print a JSX element name.
 * @param {AST.Node} node - The JSX element name node
 * @returns {string}
 */
function printJSXElementName(node) {
	if (node.type === 'JSXIdentifier') {
		return node.name;
	}
	if (node.type === 'JSXMemberExpression') {
		return printJSXElementName(node.object) + '.' + printJSXElementName(node.property);
	}
	if (node.type === 'JSXNamespacedName') {
		const namespace_name = node.namespace.name;
		const local_name = node.name.name;
		return namespace_name + ':' + local_name;
	}
	return 'Unknown';
}
