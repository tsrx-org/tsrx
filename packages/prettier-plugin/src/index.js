/**
 * @import * as acorn from '@tsrx/core/types/acorn';
 * @import * as AST from '@tsrx/core/types/estree';
 * @import * as ESTreeJSX from '@tsrx/core/types/estree-jsx';
 * @import { Doc, AstPath, Options, ParserOptions } from 'prettier';
 */

/**
 * Print function callback type.
 * Uses an intersection of two signatures:
 * 1. (path) => Doc — compatible with CallCallback/MapCallback for path.call/path.map
 * 2. (path, args) => Doc — used when passing context args via lambdas
 *
 * @typedef {((path: AstPath) => Doc) & ((path: AstPath, args: PrintArgs) => Doc)} PrintFn
 */

/** @typedef {Partial<Pick<ParserOptions, 'singleQuote' | 'jsxSingleQuote' | 'semi' | 'trailingComma' | 'useTabs' | 'tabWidth' | 'singleAttributePerLine' | 'bracketSameLine' | 'bracketSpacing' | 'objectWrap' | 'arrowParens' | 'originalText' | 'printWidth' | 'quoteProps'>> & { locStart: (node: AST.NodeWithLocation) => number, locEnd: (node: AST.NodeWithLocation) => number }} TsrxFormatOptions */

/**
 * Any node the parser may hang decorators off. The individual node types do not
 * declare the property, so reading it needs a cast.
 * @typedef {AST.Node & { decorators?: AST.Decorator[] }} MaybeDecoratedNode
 */

/** @typedef {{ suppressLeadingComments?: boolean, suppressTrailingComments?: boolean, suppressExpressionLeadingComments?: boolean, suppressOwnParens?: boolean, isInlineContext?: boolean, isStatement?: boolean, isLogicalAndOr?: boolean, allowShorthandProperty?: boolean, isFirstChild?: boolean, noBreakInside?: boolean, expandLastArg?: boolean, expandFirstArg?: boolean, assignmentLayout?: AssignmentLayout, firstComments?: AST.Comment[], printedKey?: string }} PrintArgs */

import { parseModule } from '@tsrx/core';
import { doc, util } from 'prettier';
import postcssPlugin from 'prettier/parser-postcss.js';
import isEs5IdentifierName from './is-es5-identifier-name.js';

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
	dedent,
	breakParent,
	indentIfBreak,
	lineSuffix,
	lineSuffixBoundary,
	align,
	addAlignmentToDoc,
	label,
	literalline,
	markAsRoot,
	dedentToRoot,
} = builders;
const { replaceEndOfLine, stripTrailingHardline, willBreak, canBreak, removeLines, mapDoc } = utils;
const { printDocToString } = doc.printer;

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
			const ast = parseModule(text, options.filepath || 'PrettierPlugin.tsrx');
			markHashbangComment(ast, text);
			return ast;
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

/**
 * The hashbang comments of parsed files (see {@link markHashbangComment}).
 * @type {WeakSet<AST.Comment>}
 */
const hashbangComments = new WeakSet();

/**
 * Remember a file's hashbang (`#!…` on its first line) so {@link printComment}
 * prints it back as written. The parser reports it as a `Line` comment at offset
 * 0 whose value is the text after `#!`, and attaches it like any other comment,
 * so it can end up on any node: the first statement, a later one when empty
 * statements come first, or the program. Find it by its position instead.
 * @param {AST.Program} ast
 * @param {string} text
 */
function markHashbangComment(ast, text) {
	if (!text.startsWith('#!')) {
		return;
	}
	/** @type {unknown[]} */
	const stack = [ast];
	const seen = new Set();
	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== 'object' || seen.has(value)) {
			continue;
		}
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) {
				stack.push(item);
			}
			continue;
		}
		const node = /** @type {Record<string, unknown>} */ (value);
		if (node.type === 'Line' && node.start === 0) {
			hashbangComments.add(/** @type {AST.Comment} */ (/** @type {unknown} */ (node)));
			continue;
		}
		for (const key in node) {
			if (key !== 'metadata' && key !== 'loc' && key !== 'parent') {
				stack.push(node[key]);
			}
		}
	}
}

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
			dropParenthesizedTypes(path);
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
		 * @param {Options} options
		 * @returns {((textToDoc: TextToDoc, print: PrintFn, path: AstPath, options: Options) => Promise<Doc | undefined>) | null}
		 */
		embed(path, options) {
			const node = path.node;

			// CSS, GraphQL, HTML, and Markdown in template literals
			if (node.type === 'TemplateLiteral') {
				return getTemplateLiteralEmbed(/** @type {AstPath<AST.TemplateLiteral>} */ (path));
			}

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
			// a single JSXText child. Format it with the parser for the script's type
			// (see inferScriptParser) the same way <style> bodies are formatted as CSS
			// above, and keep a body of any other type as written.
			if (node.type === 'JSXText') {
				const parent = /** @type {AST.TSRXJSXElement | null} */ (path.getParentNode());
				if (isRawScriptElement(parent)) {
					const parser = inferScriptParser(/** @type {AST.TSRXJSXElement} */ (parent), options);
					return async (textToDoc) => {
						try {
							if (!parser) {
								return printUnformattedRawText(node.value);
							}
							const body = await textToDoc(
								parser === 'markdown'
									? dedentString(node.value.replace(/^[^\S\n]*\n/u, ''))
									: node.value,
								{ parser },
							);
							// Drop the program's trailing hardline; printElement places the
							// closing tag on its own line already.
							return stripTrailingHardline(body);
						} catch {
							// A body that doesn't parse (e.g. mid-edit code) is an expected
							// state, not an error: keep its lines and stay quiet.
							return printUnformattedRawText(node.value);
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
 * Print a raw-text body that doesn't parse the way Prettier's HTML printer
 * prints the text of a `<script>` it can't format (`getTextValueParts`): drop
 * the blank line before it and the whitespace after it, remove the
 * indentation its lines share, and print each line at the element's
 * indentation. The body's own line breaks and relative indentation stay, and
 * a second pass reads back the same lines.
 * @param {string} text
 * @returns {Doc}
 */
function printUnformattedRawText(text) {
	// Prettier normalizes line endings before parsing; normalize anyway, so a
	// `\r` never stays at the end of a line
	const lines = text
		.replace(/\r\n?/gu, '\n')
		.replace(/[\t\n\f\r ]+$/u, '')
		.replace(/^[\t\f\r ]*\n/u, '')
		.split('\n');
	let minIndentation = Number.POSITIVE_INFINITY;
	for (const lineText of lines) {
		const indentation = /** @type {RegExpMatchArray} */ (lineText.match(/^[\t\f\r ]*/u))[0].length;
		if (indentation < lineText.length) {
			minIndentation = Math.min(minIndentation, indentation);
		}
	}
	const dedent = minIndentation === Number.POSITIVE_INFINITY ? 0 : minIndentation;
	return join(
		hardline,
		lines.map((lineText) => lineText.slice(dedent)),
	);
}

/**
 * Drop the parentheses the parser keeps around a type (`TSParenthesizedType`),
 * as Prettier's parser postprocess does. Prettier's AST has no such node, so
 * its type rules see a type's real parent, and `needsParens` puts back only the
 * parentheses the type needs there. The parentheses' comments move to the type
 * inside them.
 *
 * This runs as the printer reaches each node rather than as a walk of its own.
 * A node is printed after its parent, and the checks that pick a layout look
 * ahead at most through a child and a grandchild into a type (a parameter's
 * type annotation, a declarator's annotated type), so this drops the
 * parentheses in the node's children and grandchildren and in the whole of
 * every type among them. The node itself is replaced too, in case its parent
 * printed it through a path that skips a level.
 * @param {AstPath} path - The path to the node about to print
 */
function dropParenthesizedTypes(path) {
	const stack = path.stack;
	let node = path.node;
	if (isParenthesizedType(node)) {
		node = unwrapParenthesizedType(node);
		// The slot the node came from: the parent node or list, then the key
		stack[stack.length - 3][stack[stack.length - 2]] = node;
		stack[stack.length - 1] = node;
	}

	for (const child of unwrapParenthesizedChildren(node)) {
		if (isTypeTreeNode(child)) {
			dropParenthesizedTypesInType(child);
			continue;
		}
		for (const grandchild of unwrapParenthesizedChildren(child)) {
			if (isTypeTreeNode(grandchild)) {
				dropParenthesizedTypesInType(grandchild);
			}
		}
	}
}

/** Types whose parentheses are already dropped throughout. */
const typesWithoutParentheses = new WeakSet();

/**
 * Drop the parentheses throughout a type (see {@link dropParenthesizedTypes}).
 * @param {object} node - A node of a type
 */
function dropParenthesizedTypesInType(node) {
	if (typesWithoutParentheses.has(node)) {
		return;
	}
	typesWithoutParentheses.add(node);
	for (const child of unwrapParenthesizedChildren(node)) {
		dropParenthesizedTypesInType(child);
	}
}

/** Node properties that don't hold child nodes. */
const NON_CHILD_KEYS = new Set([
	'start',
	'end',
	'loc',
	'range',
	'metadata',
	'raw',
	'regex',
	'leadingComments',
	'trailingComments',
	'innerComments',
]);

/**
 * Replace each `TSParenthesizedType` among a node's children with the type
 * inside it, and list the children.
 * @param {unknown} node
 * @returns {Record<string, unknown>[]}
 */
function unwrapParenthesizedChildren(node) {
	/** @type {Record<string, unknown>[]} */
	const children = [];
	if (!node || typeof node !== 'object' || Array.isArray(node)) {
		return children;
	}
	const record = /** @type {Record<string, unknown>} */ (node);
	for (const key of Object.keys(record)) {
		if (NON_CHILD_KEYS.has(key)) {
			continue;
		}
		const value = record[key];
		if (Array.isArray(value)) {
			for (let index = 0; index < value.length; index++) {
				if (isParenthesizedType(value[index])) {
					value[index] = unwrapParenthesizedType(value[index]);
				}
				if (value[index] && typeof value[index] === 'object') {
					children.push(value[index]);
				}
			}
		} else if (value && typeof value === 'object') {
			if (isParenthesizedType(value)) {
				record[key] = unwrapParenthesizedType(value);
			}
			children.push(/** @type {Record<string, unknown>} */ (record[key]));
		}
	}
	return children;
}

/**
 * TypeScript nodes that aren't part of a type: expressions and statements
 * that hold expressions, which the printer reaches node by node.
 */
const NON_TYPE_TS_NODES = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSInstantiationExpression',
	'TSTypeAssertion',
	'TSModuleDeclaration',
	'TSModuleBlock',
	'TSEnumDeclaration',
	'TSEnumBody',
	'TSEnumMember',
	'TSExportAssignment',
	'TSImportEqualsDeclaration',
	'TSExternalModuleReference',
	'TSNamespaceExportDeclaration',
	'TSParameterProperty',
	'TSDeclareFunction',
	'TSAbstractMethodDefinition',
	'TSAbstractPropertyDefinition',
	'TSAbstractAccessorProperty',
	'TSDeclareMethod',
]);

/**
 * Whether a node is part of a type, or holds one (`TSTypeAnnotation`, a type
 * parameter or argument list), so everything under it is a type.
 * @param {Record<string, unknown>} node
 * @returns {boolean}
 */
function isTypeTreeNode(node) {
	return (
		typeof node.type === 'string' && node.type.startsWith('TS') && !NON_TYPE_TS_NODES.has(node.type)
	);
}

/**
 * @param {unknown} node
 * @returns {node is AST.TSParenthesizedType & AST.NodeWithMaybeComments & { typeAnnotation: AST.TypeNode & AST.NodeWithMaybeComments }}
 */
function isParenthesizedType(node) {
	return /** @type {AST.Node | null | undefined} */ (node)?.type === 'TSParenthesizedType';
}

/**
 * The type inside a `TSParenthesizedType` and any directly nested ones, with
 * the comments of each pair of parentheses moved onto it: the ones before the
 * `(` lead it, the ones after the `)` trail it. It takes over the parser's
 * `prettierIgnore` mark of a union member written in parentheses.
 * @param {AST.TSParenthesizedType & AST.NodeWithMaybeComments & { typeAnnotation: AST.TypeNode & AST.NodeWithMaybeComments }} node
 * @returns {AST.TypeNode & AST.NodeWithMaybeComments}
 */
function unwrapParenthesizedType(node) {
	const inner = isParenthesizedType(node.typeAnnotation)
		? unwrapParenthesizedType(node.typeAnnotation)
		: node.typeAnnotation;
	const innerNode = /** @type {AST.Node} */ (/** @type {unknown} */ (inner));
	const wrapperNode = /** @type {AST.Node} */ (/** @type {unknown} */ (node));
	if (wrapperNode.metadata?.prettierIgnore) {
		innerNode.metadata = { ...innerNode.metadata, prettierIgnore: true };
	}
	if (node.leadingComments?.length) {
		inner.leadingComments = [...node.leadingComments, ...(inner.leadingComments ?? [])];
	}
	if (node.trailingComments?.length) {
		inner.trailingComments = [...(inner.trailingComments ?? []), ...node.trailingComments];
	}
	return inner;
}

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
 * The parser for the body of a raw-text `<script>`, like Prettier's HTML
 * `inferScriptParser`: none for a script with `src`, the parser of its `lang`
 * or `type`, and, like a script with neither, JavaScript's for code. This
 * plugin formats JavaScript with Prettier's TypeScript parser (a superset of
 * it, so plain bodies format the same) instead of Babel's. A body without a
 * parser, like a template's, prints as written, and so does one whose `lang`
 * or `type` is an expression.
 * @param {AST.TSRXJSXElement} element
 * @param {Options} options
 * @returns {string | undefined}
 */
function inferScriptParser(element, options) {
	/** @type {Map<string, string | null>} */
	const attributes = new Map();
	for (const attribute of element.openingElement.attributes) {
		if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') {
			continue;
		}
		const { value } = attribute;
		const literal = value?.type === 'JSXExpressionContainer' ? value.expression : value;
		attributes.set(
			attribute.name.name,
			!literal
				? ''
				: literal.type === 'Literal' && typeof literal.value === 'string'
					? literal.value
					: null,
		);
	}
	if (attributes.has('src')) {
		return undefined;
	}
	const type = attributes.get('type');
	const lang = attributes.get('lang');
	if (type === null || lang === null) {
		return undefined;
	}
	const parser =
		!lang && !type
			? 'babel'
			: (inferParserByLanguageName(options, lang) ?? inferParserByTypeAttribute(type));
	return parser === 'babel' ? 'typescript' : parser;
}

/**
 * The parser of the language named `languageName`, like Prettier's
 * `inferParser` with a `language`: by name, then alias, then extension.
 * @param {Options} options
 * @param {string | undefined} languageName
 * @returns {string | undefined}
 */
function inferParserByLanguageName(options, languageName) {
	if (!languageName) {
		return undefined;
	}
	const languages = /** @type {import('prettier').Plugin[]} */ (options.plugins ?? [])
		.filter((plugin) => typeof plugin === 'object')
		.toReversed()
		.flatMap((plugin) => plugin.languages ?? []);
	const language =
		languages.find(({ name }) => name.toLowerCase() === languageName) ??
		languages.find(({ aliases }) => aliases?.includes(languageName)) ??
		languages.find(({ extensions }) => extensions?.includes(`.${languageName}`));
	return language?.parsers[0];
}

/**
 * Prettier's HTML `inferParserByTypeAttribute`: the parser for a `<script>`
 * of this `type`, with JSON's for JSON, an import map, or speculation rules.
 * @param {string | undefined} type
 * @returns {string | undefined}
 */
function inferParserByTypeAttribute(type) {
	switch (type) {
		case undefined:
		case '':
			return undefined;
		case 'module':
		case 'text/javascript':
		case 'text/babel':
		case 'text/jsx':
		case 'application/javascript':
			return 'babel';
		case 'application/x-typescript':
			return 'typescript';
		case 'text/markdown':
			return 'markdown';
		case 'text/html':
			return 'html';
		case 'text/x-handlebars-template':
			return 'glimmer';
		default:
			return type.endsWith('json') || type.endsWith('importmap') || type === 'speculationrules'
				? 'json'
				: undefined;
	}
}

/**
 * Prettier's HTML `dedentString`: the text without the indentation its
 * lines share.
 * @param {string} text
 * @returns {string}
 */
function dedentString(text) {
	let minIndentation = Number.POSITIVE_INFINITY;
	for (const lineText of text.split('\n')) {
		const indentation = /** @type {RegExpMatchArray} */ (lineText.match(/^[\t\f\r ]*/u))[0].length;
		if (indentation < lineText.length) {
			minIndentation = Math.min(minIndentation, indentation);
		}
	}
	return minIndentation === Number.POSITIVE_INFINITY
		? text
		: text
				.split('\n')
				.map((lineText) => lineText.slice(minIndentation))
				.join('\n');
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

	const quote = getPreferredQuote(value, options.singleQuote);
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
 * way Prettier's `printString` does: the configured quote, unless the string
 * holds more of it than of the other one. Reprinting the cooked value would
 * drop the author's escapes, and an escaped lone surrogate (`'\ud800'`)
 * cannot be written back as a raw character. Literals without source text
 * fall back to the value.
 * @param {AST.Literal} node - The literal
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {string} - The formatted string literal with quotes
 */
function printStringLiteral(node, options) {
	const raw = node.raw;
	if (typeof node.value !== 'string' || !isQuotedStringRaw(raw)) {
		return formatStringLiteral(node.value, options);
	}

	const content = raw.slice(1, -1);
	const quote = getPreferredQuote(content, options.singleQuote);
	return raw[0] === quote ? raw : makeString(content, quote);
}

/**
 * A printed string literal as a doc, like Prettier's
 * `replaceEndOfLine(printString(…))`. A string that continues onto the next
 * line (a backslash at the end of the line) joins its lines with a
 * `literalline`, which breaks the groups around it: an assignment breaks
 * after its `=` and a call breaks its arguments.
 * @param {string} printed - The printed string literal
 * @returns {Doc}
 */
function printMultilineString(printed) {
	return printed.includes('\n') ? replaceEndOfLine(printed) : printed;
}

/**
 * Enclose a string's source text in `quote`, like Prettier's `makeString`:
 * escape that quote wherever it appears bare, drop the backslash of an escaped
 * other quote, and leave every other escape as written.
 * @param {string} content - The string's source text without its quotes
 * @param {'"' | "'"} quote - The enclosing quote
 * @returns {string}
 */
function makeString(content, quote) {
	const otherQuote = quote === '"' ? "'" : '"';
	// `\\` is matched as a pair, so the quote in `\\"` counts as bare
	const escaped = content.replace(
		/\\(["'\\])|(["'])/g,
		/**
		 * @param {string} match
		 * @param {string | undefined} escapedChar
		 * @param {string | undefined} bareQuote
		 */
		(match, escapedChar, bareQuote) => {
			if (escapedChar !== undefined) {
				return escapedChar === otherQuote ? escapedChar : match;
			}
			return bareQuote === quote ? '\\' + quote : /** @type {string} */ (bareQuote);
		},
	);
	return quote + escaped + quote;
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
 * Check if a node has any comments (leading, trailing, or inner). Leading
 * comments an ancestor prints (see {@link hoistedComments}) don't count.
 * @param {AST.Node & AST.NodeWithMaybeComments} node - The AST node to check
 * @returns {boolean} - True if the node has comments
 */
function hasComment(node) {
	return !!(hasOwnLeadingComments(node) || node.trailingComments || node.innerComments);
}

/**
 * Whether a node has leading comments other than the ones an ancestor prints
 * (see {@link hoistedComments}).
 * @param {AST.Node & AST.NodeWithMaybeComments} node - The AST node to check
 * @returns {boolean}
 */
function hasOwnLeadingComments(node) {
	return !!node.leadingComments?.some((comment) => !hoistedComments.has(comment));
}

/**
 * Check whether a comment is a `prettier-ignore` directive.
 * @param {AST.Comment | undefined} comment - The comment to check
 * @returns {boolean} - True if the comment reads exactly `prettier-ignore`
 */
function isPrettierIgnoreComment(comment) {
	// The parser unignores one that marks another node (see hasPrettierIgnore)
	if (!comment || (comment.type !== 'Line' && comment.type !== 'Block') || comment.unignore) {
		return false;
	}
	return comment.value.trim() === 'prettier-ignore';
}

/**
 * Check whether a `prettier-ignore` directive keeps a node as written. Like
 * Prettier's `hasNodeIgnoreComment`, any comment attached to the node counts:
 * leading (even when another comment follows it), trailing (such as
 * `foo(  a ); // prettier-ignore`), or dangling, and like its `prettierIgnore`
 * mark, the parser's mark for the union member after an own-line one
 * (`handleUnionTypeComments`). The inner comments of a
 * template element or code block are its children, not dangling comments,
 * so like a JSX comment child they don't keep the element as written.
 * @param {AST.Node & AST.NodeWithMaybeComments} node - The AST node to check
 * @returns {boolean} - True if the node should be printed verbatim
 */
function hasPrettierIgnore(node) {
	const isTemplateContainer =
		node.type === 'JSXElement' || node.type === 'JSXFragment' || node.type === 'JSXCodeBlock';
	return Boolean(
		node.metadata?.prettierIgnore ||
		node.leadingComments?.some(isPrettierIgnoreComment) ||
		node.trailingComments?.some(isPrettierIgnoreComment) ||
		(!isTemplateContainer && node.innerComments?.some(isPrettierIgnoreComment)),
	);
}

/**
 * Whether `prettier-ignore` keeps the node at `path` as written, like
 * Prettier's `isIgnored`: a directive attached to the node (see
 * {@link hasPrettierIgnore}), one in the `{…}` child before an element (see
 * {@link hasJSXIgnoreComment}), or one after the last node of a `@{ … }` code
 * block (see {@link hasCodeBlockIgnoreComment}).
 * @param {AstPath} path - The path to the node
 * @returns {boolean}
 */
function isIgnored(path) {
	return (
		hasPrettierIgnore(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (path.node)) ||
		hasJSXIgnoreComment(path) ||
		hasCodeBlockIgnoreComment(path)
	);
}

/**
 * Prettier's `hasJsxIgnoreComment`: an element or fragment child of an
 * element or fragment is kept as written when the child before it, past
 * whitespace with a line break, is `{/* prettier-ignore *\/}`.
 * @param {AstPath} path - The path to the node
 * @returns {boolean}
 */
function hasJSXIgnoreComment(path) {
	const { node, parent } = path;
	if (!isJSXElementOrFragment(node) || !isJSXElementOrFragment(parent) || path.key !== 'children') {
		return false;
	}
	const siblings = /** @type {AST.Node[]} */ (parent.children);
	let index = /** @type {number} */ (path.index);
	while (index > 0) {
		const sibling = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (siblings[--index]);
		if (sibling.type === 'JSXText' && !isMeaningfulJSXText(sibling.value)) {
			continue;
		}
		return (
			sibling.type === 'JSXExpressionContainer' &&
			sibling.expression.type === 'JSXEmptyExpression' &&
			hasPrettierIgnore(
				/** @type {AST.Node & AST.NodeWithMaybeComments} */ (
					/** @type {unknown} */ (sibling.expression)
				),
			)
		);
	}
	return false;
}

/**
 * Prettier's `isJsxElement`: a JSX element or fragment, which a TSRX template
 * `<style>` element is too.
 * @param {unknown} node
 * @returns {node is AST.TSRXJSXElement | AST.TSRXJSXFragment | AST.JSXStyleElement}
 */
function isJSXElementOrFragment(node) {
	const type = /** @type {AST.Node | null | undefined} */ (node)?.type;
	return type === 'JSXElement' || type === 'JSXFragment' || type === 'JSXStyleElement';
}

/**
 * Whether a `prettier-ignore` after the last node of a `@{ … }` code block
 * keeps that node as written. Prettier gives the comments after a block's
 * last statement, past any empty statement, to it as trailing comments, which
 * `hasNodeIgnoreComment` counts. The parser keeps the ones after a code
 * block's last node as the block's inner comments (see
 * {@link printJSXCodeBlock}) instead.
 * @param {AstPath} path - The path to the node
 * @returns {boolean}
 */
function hasCodeBlockIgnoreComment(path) {
	const { node, parent } = path;
	return (
		parent?.type === 'JSXCodeBlock' &&
		node ===
			(parent.render ??
				parent.body.findLast(
					(/** @type {AST.Node} */ statement) => statement.type !== 'EmptyStatement',
				)) &&
		Boolean(parent.innerComments?.some(isPrettierIgnoreComment))
	);
}

/**
 * The statements whose source Prettier's `locEnd` ends before a written `;`
 * (its `nodeTypesWithContentEnd`).
 */
const IGNORED_CONTENT_END_TYPES = new Set([
	'ExpressionStatement',
	'ImportDeclaration',
	'ExportDefaultDeclaration',
	'ExportNamedDeclaration',
	'ExportAllDeclaration',
	'ReturnStatement',
	'ThrowStatement',
	'DoWhileStatement',
]);

/**
 * The source of a node that `prettier-ignore` keeps, like Prettier's
 * `printIgnored`. An export's source starts at its declaration's first
 * decorator, even one written before `export`. A statement's source ends
 * where Prettier's `locEnd` does, before its `;`, which then prints by the
 * `semi` option: after a declaration, `break`, `continue`, or `debugger`
 * always, and after another statement only when it was written. A compound
 * statement ends like its body. Like Prettier, the comments between `start`
 * and `end` print with the source, not again on their own.
 * @param {AST.Node} node - The ignored node
 * @param {AstPath} path - The path to the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {{ start: number, end: number, text: string }}
 */
function getIgnoredSource(node, path, options) {
	const text = /** @type {string} */ (options.originalText);
	// A node's own span has the decorators written after `export`. The ones
	// before it belong to the export, which prints the others when it isn't
	// ignored itself (see printDeclarationDecorators).
	const { declaration } = /** @type {{ declaration?: AST.Node | null }} */ (node);
	const [firstDecorator] = getDecorators(declaration);
	const nodeStart = /** @type {AST.NodeWithLocation} */ (node).start;
	const start = firstDecorator
		? Math.min(/** @type {AST.NodeWithLocation} */ (firstDecorator).start, nodeStart)
		: nodeStart;

	let statement = node;
	while (true) {
		if (statement.type === 'IfStatement') {
			statement = statement.alternate ?? statement.consequent;
		} else if (
			statement.type === 'ForStatement' ||
			statement.type === 'ForInStatement' ||
			statement.type === 'ForOfStatement' ||
			statement.type === 'LabeledStatement' ||
			statement.type === 'WhileStatement' ||
			statement.type === 'WithStatement'
		) {
			statement = statement.body;
		} else {
			break;
		}
	}

	const { end } = /** @type {AST.NodeWithLocation} */ (statement);
	/** @type {number} */
	let contentEnd = end;
	let semicolon = true;
	if (statement.type === 'BreakStatement' || statement.type === 'ContinueStatement') {
		contentEnd = statement.label
			? /** @type {AST.NodeWithLocation} */ (statement.label).end
			: /** @type {AST.NodeWithLocation} */ (statement).start +
				(statement.type === 'BreakStatement' ? 'break' : 'continue').length;
	} else if (statement.type === 'DebuggerStatement') {
		contentEnd = /** @type {AST.NodeWithLocation} */ (statement).start + 'debugger'.length;
	} else if (statement.type === 'VariableDeclaration') {
		contentEnd = /** @type {AST.NodeWithLocation} */ (statement.declarations.at(-1)).end;
		semicolon = !isForHeadDeclaration(statement, statement === node ? path.parent : null);
	} else if (IGNORED_CONTENT_END_TYPES.has(statement.type) && text[end - 1] === ';') {
		// Prettier's `__contentEnd`: before the `;`, and the whitespace and
		// comments ahead of it. The parser gives those comments to the outermost
		// node that ends at the `;` (see `takeCommentsBeforeFinalSemicolon`),
		// which prints them after it.
		/** @type {AST.Comment[]} */
		const comments = [];
		for (
			let level = -1, owner = /** @type {AST.Node | null} */ (node);
			owner && /** @type {AST.NodeWithLocation} */ (owner).end === end;
			owner = /** @type {AST.Node | null} */ (path.getParentNode(++level))
		) {
			const { trailingComments } = /** @type {AST.NodeWithMaybeComments} */ (owner);
			comments.push(...(trailingComments ?? []));
		}
		if (statement !== node) {
			const { trailingComments } = /** @type {AST.NodeWithMaybeComments} */ (statement);
			comments.push(...(trailingComments ?? []));
		}
		contentEnd = end - 1;
		while (true) {
			while (/\s/.test(text[contentEnd - 1])) {
				contentEnd--;
			}
			const comment = comments.find(
				(comment) => /** @type {AST.NodeWithLocation} */ (comment).end === contentEnd,
			);
			if (!comment) {
				break;
			}
			contentEnd = /** @type {AST.NodeWithLocation} */ (comment).start;
		}
	} else {
		semicolon = false;
	}

	const source = text.slice(start, contentEnd);
	return {
		start,
		end: contentEnd,
		text: semicolon && options.semi !== false ? source + ';' : source,
	};
}

/**
 * Any node with a parameter list: functions and methods keep it in `params`,
 * while TypeScript signatures and function or constructor types keep it in
 * `parameters` (and their return type in `typeAnnotation`).
 * @typedef {AST.FunctionDeclaration | AST.FunctionExpression | AST.ArrowFunctionExpression | AST.TSDeclareFunction | AST.TSMethodSignature | AST.TSCallSignatureDeclaration | AST.TSConstructSignatureDeclaration | AST.TSFunctionType | AST.TSConstructorType} FunctionLikeNode
 */

/**
 * @param {FunctionLikeNode} node - The function-like node
 * @returns {Array<AST.Pattern | AST.Parameter>} - Array of parameter patterns
 */
function getFunctionParameters(node) {
	const parameters =
		'params' in node
			? node.params
			: /** @type {{ parameters?: Array<AST.Pattern | AST.Parameter> }} */ (node).parameters;
	return parameters ? [...parameters] : [];
}

/**
 * Iterate over function parameters with path callbacks.
 * @param {AstPath<FunctionLikeNode>} path - The function-like node's path
 * @param {(paramPath: AstPath<FunctionLikeNode>, index: number) => void} iteratee - Callback for each parameter
 * @returns {void}
 */
function iterateFunctionParametersPath(path, iteratee) {
	const node = path.node;
	let index = 0;
	/** @type {(paramPath: AstPath) => void} */
	const callback = (paramPath) => iteratee(paramPath, index++);

	if ('params' in node) {
		path.each(callback, 'params');
	} else if (/** @type {{ parameters?: unknown[] }} */ (node).parameters) {
		path.each(callback, 'parameters');
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
 * body), or a superclass (TypeScript reads the `{` of `extends {}.Base {}` as
 * the class body). An `export default` wraps its whole expression instead
 * (see {@link getExportDefaultLeadingFunction}), unless the function or class
 * has type arguments (`(class {})<T>`).
 * @param {AstPath} path - The path to the object, function or class expression
 * @returns {boolean}
 */
function startsAmbiguousHead(path) {
	const node = /** @type {AST.Node} */ (path.node);
	let child = node;
	let isInstantiated = false;
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
				return isInstantiated && node.type !== 'ObjectExpression';
			case 'TSInstantiationExpression':
				isInstantiated = true;
				break;
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
 * The function or class expression a default export's expression starts
 * with, when the export prints that expression in parentheses because of it:
 * right after `export default`, a function or class would start a
 * declaration. Like Prettier's `shouldWrapFunctionForExportDefault`, the
 * parentheses go around the whole expression,
 * `export default (class {}.getInstance());`, unless the function or class,
 * or an operand it starts, prints in parentheses of its own:
 * `export default (function () {})();`. An expression that is itself a
 * function or class is `printExportDefaultDeclaration`'s to wrap.
 * @param {AstPath} path - The path to the export's expression, and then to the
 *   operands it starts with
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {AST.Node | null}
 */
function getExportDefaultLeadingFunction(path, options) {
	const node = /** @type {AST.Node} */ (path.node);
	const isExpression = /** @type {AST.Node} */ (path.parent).type === 'ExportDefaultDeclaration';
	if (!isExpression && (needsParens(path, options) || getTypeCastParens(path, options))) {
		return null;
	}
	if (node.type === 'FunctionExpression' || node.type === 'ClassExpression') {
		return isExpression ? null : node;
	}
	// `(class {}<T>)` doesn't parse, so an instantiated function or class
	// keeps parentheses of its own (see startsAmbiguousHead)
	const key = node.type === 'TSInstantiationExpression' ? null : getLeftmostChildKey(node);
	return key
		? path.call((childPath) => getExportDefaultLeadingFunction(childPath, options), key)
		: null;
}

/**
 * The leading comments of the function or class a parenthesized default
 * export starts with (see {@link getExportDefaultLeadingFunction}), and of
 * the operands between the export's expression and it. The export prints them
 * ahead of its parentheses, where they are once it's formatted again, like
 * Prettier's second pass: `export default (/* a *\/ class {}).x` prints
 * `export default /* a *\/ (class {}.x)`. {@link hoistedComments} maps them to
 * the export's expression, so the nodes they lead leave them out.
 * @param {AstPath} path - The path to the export's expression
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {AST.Comment[]}
 */
function hoistExportDefaultComments(path, options) {
	const expression = /** @type {AST.Node} */ (path.node);
	const leadingFunction = getExportDefaultLeadingFunction(path, options);
	/** @type {AST.Comment[]} */
	const comments = [];
	let node = expression;
	while (leadingFunction && node !== leadingFunction) {
		const key = /** @type {string} */ (getLeftmostChildKey(node));
		node = /** @type {AST.Node} */ (/** @type {Record<string, unknown>} */ (node)[key]);
		for (const comment of /** @type {AST.NodeWithMaybeComments} */ (node).leadingComments ?? []) {
			hoistedComments.set(comment, expression);
			comments.push(comment);
		}
	}
	return comments;
}

/**
 * Leading comments that an ancestor prints, mapped to that ancestor (see
 * {@link hoistExportDefaultComments}).
 * @type {WeakMap<AST.Comment, AST.Node | AST.CSS.StyleSheet>}
 */
const hoistedComments = new WeakMap();

/**
 * A node's leading comments without the ones another node prints (see
 * {@link hoistedComments}).
 * @param {AST.Node | AST.CSS.StyleSheet} node
 * @param {AST.Comment[]} comments
 * @returns {AST.Comment[]}
 */
function withoutHoistedComments(node, comments) {
	return comments.some((comment) => hoistedComments.has(comment))
		? comments.filter((comment) => (hoistedComments.get(comment) ?? node) === node)
		: comments;
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
				case 'UpdateExpression':
					return true;
				case 'UnaryExpression':
					// The unary prints the parentheses around an operand with comments
					return !hasComment(node);
				case 'LogicalExpression':
				case 'BinaryExpression': {
					if (node.type !== 'BinaryExpression' && node.type !== 'LogicalExpression') {
						return true;
					}
					if (node.type === 'LogicalExpression' && parent.type === 'LogicalExpression') {
						// Like Prettier, a logical operand of another logical operator
						// shows its grouping: `(a && b) || c`. `??` does not mix with
						// `||` or `&&` without them anyway. A chain of one operator
						// evaluates the same however it is grouped, so `a || (b || c)`
						// flattens.
						return parent.operator !== node.operator;
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
					// A nested consequent prints its parentheses itself, only on one line
					return key === 'test';
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

		// Like Prettier, an element is parenthesized unless its parent prints it
		// bare: `await (<div />)`, `!(<div />)`, `(<div />) as T`, `[...(<div />)]`.
		// A `<style>` block is an element too.
		case 'JSXElement':
		case 'JSXFragment':
		case 'JSXStyleElement':
			return (
				key === 'callee' ||
				(key === 'left' && parent.type === 'BinaryExpression' && parent.operator === '<') ||
				!(
					ELEMENT_BARE_PARENTS.has(parent.type) ||
					isCallOrNewExpression(parent) ||
					(parent.type === 'Property' && !parent.method && parent.kind === 'init') ||
					isReturnOrThrowStatement(parent) ||
					(key === 'declaration' && parent.type === 'ExportDefaultDeclaration') ||
					isStatementSlot(key, parent)
				)
			);

		// Types, like Prettier's `needsParens`. The printer drops the parentheses
		// written around a type (see `dropParenthesizedTypes`), so these rules
		// add every pair a type prints with: the ones the grammar requires,
		// like `(A | B)[]`, and the ones Prettier adds for readability, like
		// `(): (() => void) => {}` and `(typeof a)[]`.
		case 'TSFunctionType':
		case 'TSConditionalType':
		case 'TSConstructorType':
		case 'TSUnionType':
		case 'TSIntersectionType':
		case 'TSInferType':
		case 'TSTypeOperator':
			return typeOperandNeedsParens(node, key, parent, grandparent);

		case 'TSTypeQuery':
			return (
				(key === 'objectType' && parent.type === 'TSIndexedAccessType') ||
				(key === 'elementType' && parent.type === 'TSArrayType')
			);

		default:
			return false;
	}
}

/**
 * The parents that print an element operand without parentheses, from
 * Prettier's `needsParens`, besides call arguments, object property values,
 * `return`/`throw` arguments, and `export default`.
 */
const ELEMENT_BARE_PARENTS = new Set([
	'ArrayExpression',
	'ArrowFunctionExpression',
	'AssignmentExpression',
	'AssignmentPattern',
	'BinaryExpression',
	'ConditionalExpression',
	'ExpressionStatement',
	'JSXAttribute',
	'JSXElement',
	'JSXExpressionContainer',
	'JSXFragment',
	'LogicalExpression',
	'VariableDeclarator',
	'YieldExpression',
]);

/**
 * Whether `key` of `parent` holds a statement. TSRX elements are statements
 * of their own in a template body, with no `ExpressionStatement` around them:
 * the statements and output of a `@{ … }` code block, of a block, a `case`,
 * or the body of an `if` or a loop.
 * @param {string | number | null} key - The child's key in `parent`
 * @param {AST.Node} parent - The parent node
 * @returns {boolean}
 */
function isStatementSlot(key, parent) {
	switch (parent.type) {
		case 'JSXCodeBlock':
			return key === 'body' || key === 'render';
		case 'SwitchCase':
			return key === 'consequent';
		case 'IfStatement':
			return key === 'consequent' || key === 'alternate';
		case 'Program':
		case 'BlockStatement':
		case 'StaticBlock':
		case 'TSModuleBlock':
		case 'ForStatement':
		case 'ForInStatement':
		case 'ForOfStatement':
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'LabeledStatement':
		case 'WithStatement':
			return key === 'body';
		default:
			return false;
	}
}

/**
 * The type part of {@link nodeNeedsParens}. Prettier's `needsParens` lists
 * these types as one chain of `switch` cases that fall through from function
 * types down to type operators: each type adds its own rules and then shares
 * every rule below it.
 * @param {AST.TSFunctionType | AST.TSConditionalType | AST.TSConstructorType | AST.TSUnionType | AST.TSIntersectionType | AST.TSInferType | AST.TSTypeOperator} node
 * @param {string | number | null} key - The child's key in `parent`
 * @param {AST.Node} parent - The parent node
 * @param {AST.Node | null} grandparent - The parent's parent
 * @returns {boolean}
 */
function typeOperandNeedsParens(node, key, parent, grandparent) {
	if (
		node.type === 'TSFunctionType' &&
		key === 'typeAnnotation' &&
		parent.type === 'TSTypeAnnotation' &&
		grandparent?.type === 'ArrowFunctionExpression' &&
		grandparent.returnType === parent
	) {
		return true;
	}

	if (
		node.type === 'TSFunctionType' ||
		node.type === 'TSConditionalType' ||
		node.type === 'TSConstructorType'
	) {
		if (
			(key === 'extendsType' &&
				node.type === 'TSConditionalType' &&
				parent.type === 'TSConditionalType') ||
			// Not the `in` type of a mapped type, which this parser keeps as
			// the constraint of a type parameter
			(key === 'constraint' &&
				node.type === 'TSConditionalType' &&
				parent.type === 'TSTypeParameter' &&
				grandparent?.type !== 'TSMappedType') ||
			(key === 'checkType' && parent.type === 'TSConditionalType')
		) {
			return true;
		}
		if (
			key === 'extendsType' &&
			parent.type === 'TSConditionalType' &&
			node.type !== 'TSConditionalType'
		) {
			// `A extends (() => infer R extends B) ? R : C`
			let returnType = node.typeAnnotation?.typeAnnotation;
			if (returnType?.type === 'TSTypePredicate' && returnType.typeAnnotation) {
				returnType = returnType.typeAnnotation.typeAnnotation;
			}
			if (returnType?.type === 'TSInferType' && returnType.typeParameter.constraint) {
				return true;
			}
		}
	}

	if (
		node.type !== 'TSInferType' &&
		node.type !== 'TSTypeOperator' &&
		(parent.type === 'TSUnionType' || parent.type === 'TSIntersectionType')
	) {
		return true;
	}

	if (node.type === 'TSInferType') {
		if (parent.type === 'TSRestType') {
			return false;
		}
		if (
			key === 'types' &&
			(parent.type === 'TSUnionType' || parent.type === 'TSIntersectionType') &&
			node.typeParameter.constraint
		) {
			return true;
		}
	}

	return (
		parent.type === 'TSArrayType' ||
		parent.type === 'TSOptionalType' ||
		parent.type === 'TSRestType' ||
		(key === 'objectType' && parent.type === 'TSIndexedAccessType') ||
		parent.type === 'TSTypeOperator'
	);
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
		key === 'superClass' &&
		(parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression')
	) {
		return false;
	}
	if (key === 'declaration' && parent.type === 'ExportDefaultDeclaration') {
		return getExportDefaultLeadingFunction(path, options) !== null;
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
const skipWhitespace = createSkip(/\s/u);
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
 * The position of the next token at or after `startIndex`, past whitespace
 * and comments
 * @param {string} text - Source text
 * @param {number} startIndex - Position to start from
 * @returns {number}
 */
function skipWhitespaceAndComments(text, startIndex) {
	/** @type {number | false} */
	let index = startIndex;
	/** @type {number | false | null} */
	let previousIndex = null;
	while (index !== false && index !== previousIndex) {
		previousIndex = index;
		index = skipWhitespace(text, index);
		index = skipInlineComment(text, index);
		index = skipTrailingComment(text, index);
	}
	return index === false ? text.length : index;
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
 * @param {FunctionLikeNode} node - The function-like node
 * @returns {boolean}
 */
function hasRestParameter(node) {
	return getFunctionParameters(node).at(-1)?.type === 'RestElement';
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
 * A node whose key {@link printKey} prints: an object property or method, a
 * class member, an interface or type literal member, an enum member (its
 * `id`), or an import attribute.
 * @typedef {AST.Property | AST.MethodDefinition | AST.PropertyDefinition | AST.TSPropertySignature | AST.TSMethodSignature | AST.TSEnumMember | AST.ImportAttribute} KeyedNode
 */

/**
 * The key {@link printKey} prints for a node, or `undefined` for a node
 * without one (a spread, an index signature, a static block).
 * @param {AST.Node} node
 * @returns {AST.Node | undefined}
 */
function getKeyNode(node) {
	return node.type === 'TSEnumMember'
		? node.id
		: /** @type {{ key?: AST.Node }} */ (/** @type {unknown} */ (node)).key;
}

/**
 * Whether a node's key is computed (`[key]`). An enum member's never is.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isComputedKey(node) {
	return (
		node.type !== 'TSEnumMember' &&
		!!(/** @type {{ computed?: boolean }} */ (/** @type {unknown} */ (node)).computed)
	);
}

/**
 * Whether a class field's key keeps the quotes it's written with. With
 * `strictPropertyInitialization`, TypeScript checks that a field named by an
 * identifier gets a value, but not a field named by a string
 * (microsoft/TypeScript#20075). Like Prettier with the `typescript` parser,
 * such a field is never unquoted. Unlike Prettier, it's never quoted either
 * (`quoteProps: "consistent"`), and an `accessor` field, which TypeScript
 * checks the same way, keeps its quotes too. TypeScript never checks an
 * abstract field.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isQuoteSensitiveKey(node) {
	return node.type === 'PropertyDefinition' && !node.abstract;
}

/**
 * Prettier's `isKeySafeToQuote` for TypeScript: only a name can be quoted. A
 * number can't, since `{ 1: a }` and `{ "1": a }` have different `keyof` types.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isKeySafeToQuote(node) {
	return getKeyNode(node)?.type === 'Identifier' && !isQuoteSensitiveKey(node);
}

/**
 * Prettier's `isKeySafeToUnquote` for TypeScript: a string key unquotes when
 * it's an ES5 identifier written without escapes. A number never unquotes,
 * for the same reason it's never quoted.
 * @param {AST.Node} node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function isKeySafeToUnquote(node, options) {
	const key = getKeyNode(node);
	if (key?.type !== 'Literal' || typeof key.value !== 'string') {
		return false;
	}
	// `'\u0061'` keeps its escape
	if (printStringLiteral(key, options).slice(1, -1) !== key.value) {
		return false;
	}
	// `new(): T` is a construct signature, not a method named `new`
	if (node.type === 'TSMethodSignature' && key.value === 'new') {
		return false;
	}
	return !isQuoteSensitiveKey(node) && isEs5IdentifierName(key.value);
}

/**
 * Whether one of an object's, class's, or type's members needs its key
 * quoted, which under `quoteProps: "consistent"` quotes all of them.
 * Prettier's `hasSiblingsRequireQuoted`, with the same cache per member list.
 * @type {WeakMap<AST.Node[], boolean>}
 */
const siblingsRequireQuotesCache = new WeakMap();

/**
 * @param {AST.Node[]} siblings - The member list
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function hasSiblingsRequireQuoted(siblings, options) {
	let result = siblingsRequireQuotesCache.get(siblings);
	if (result === undefined) {
		result = siblings.some((sibling) => {
			if (!sibling || isComputedKey(sibling)) {
				return false;
			}
			const key = getKeyNode(sibling);
			return (
				key?.type === 'Literal' &&
				typeof key.value === 'string' &&
				!isKeySafeToUnquote(sibling, options)
			);
		});
		siblingsRequireQuotesCache.set(siblings, result);
	}
	return result;
}

/**
 * How {@link printKey} changes a key's quotes under the `quoteProps` option,
 * like Prettier's `shouldQuoteKey` and `shouldUnquoteKey`: `"as-needed"`
 * unquotes every key it can, `"consistent"` does too unless a member needs
 * quotes, and then quotes every key it can, and `"preserve"` changes nothing.
 * @param {AST.Node} node - The member
 * @param {AST.Node[]} siblings - The member list it's in
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {'quote' | 'unquote' | null}
 */
function getKeyQuoting(node, siblings, options) {
	const quoteProps = options.quoteProps ?? 'as-needed';
	if (quoteProps === 'preserve' || isComputedKey(node)) {
		return null;
	}
	if (quoteProps === 'consistent' && hasSiblingsRequireQuoted(siblings, options)) {
		return isKeySafeToQuote(node) ? 'quote' : null;
	}
	return isKeySafeToUnquote(node, options) ? 'unquote' : null;
}

/**
 * The name a member's key prints as: a name, or a string key {@link printKey}
 * unquotes. `null` for a computed key and one that prints as a string or number.
 * @param {AST.Node} node - The member
 * @param {AST.Node[]} siblings - The member list it's in
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {string | null}
 */
function getPrintedKeyName(node, siblings, options) {
	const key = getKeyNode(node);
	if (!key || isComputedKey(node)) {
		return null;
	}
	const quoting = getKeyQuoting(node, siblings, options);
	if (key.type === 'Identifier') {
		return quoting === 'quote' ? null : key.name;
	}
	return quoting === 'unquote'
		? /** @type {string} */ (/** @type {AST.Literal} */ (key).value)
		: null;
}

/**
 * Print a member's key, like Prettier's `printKey`: a computed key in its
 * brackets, and otherwise the key with the quotes `quoteProps` asks for (see
 * {@link getKeyQuoting}). The key prints through `print`, so its comments do.
 * @param {KeyedNode} node - The member
 * @param {AstPath<KeyedNode>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printKey(node, path, options, print) {
	const property = node.type === 'TSEnumMember' ? 'id' : 'key';
	// An import attribute isn't in the AST node union
	const member = /** @type {AST.Node} */ (/** @type {unknown} */ (node));
	if (isComputedKey(member)) {
		// computed are never converted to identifiers
		return ['[', path.call(print, property), ']'];
	}

	const key = /** @type {AST.Node} */ (getKeyNode(member));
	const siblings = /** @type {AST.Node[]} */ (/** @type {unknown} */ (path.siblings)) ?? [member];
	const quoting = getKeyQuoting(member, siblings, options);
	/** @type {string | undefined} */
	let printedKey;
	if (quoting === 'quote') {
		printedKey = formatStringLiteral(/** @type {AST.Identifier} */ (key).name, options);
	} else if (quoting === 'unquote') {
		printedKey = /** @type {string} */ (/** @type {AST.Literal} */ (key).value);
	}
	return [
		printedKey === undefined
			? path.call(print, property)
			: path.call((keyPath) => print(keyPath, { printedKey }), property),
	];
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
 * Whether an export's declaration has decorators written before the `export`
 * keyword (`@dec export class A {}`), like Prettier's
 * `hasDecoratorsBeforeExport`. The export prints those, while the declaration
 * prints the ones written after the keyword (`export @dec class A {}`). The
 * export node starts at its keyword, so decorators before it start earlier.
 * @param {AST.Node} node - The AST node
 * @returns {boolean}
 */
function hasDecoratorsBeforeExport(node) {
	if (node.type !== 'ExportDefaultDeclaration' && node.type !== 'ExportNamedDeclaration') {
		return false;
	}

	const [firstDecorator] = getDecorators(
		/** @type {AST.Node | null | undefined} */ (node.declaration),
	);
	return (
		!!firstDecorator &&
		/** @type {AST.NodeWithLocation} */ (firstDecorator).start <
			/** @type {AST.NodeWithLocation} */ (node).start
	);
}

/**
 * Whether an ancestor prints this node's decorators, so the node must not print
 * them again. Two positions hoist decorators out of the node that owns them:
 *
 * - Decorators written before `export` (`@dec export class A {}`) print
 *   above the keyword, from the export printer. Like Prettier, the ones
 *   written after it stay with the declaration.
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
		return (
			parent.declaration === node &&
			hasDecoratorsBeforeExport(parent) &&
			!isParenthesizedDefaultExport(parent, options)
		);
	}

	if (parent.type === 'ExportNamedDeclaration') {
		return parent.declaration === node && hasDecoratorsBeforeExport(parent);
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
 * Classes always put each decorator on its own line. An exported class's
 * decorators written after `export` also start on a new line, like Prettier's
 * `printDecorators`: `export`, each decorator, and `class` get a line each. A
 * class member keeps the lines it was written with, and when it was written
 * inline the decorators get their own group, so a decorator too long to share
 * the member's line moves to its own line rather than breaking apart.
 * Everywhere else — parameters, most notably — decorators stay inline.
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
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());

	// A parenthesized default export breaks around its parens' contents
	// itself (see printExportDefaultDeclaration)
	if (
		path.key === 'declaration' &&
		(parent?.type === 'ExportNamedDeclaration' ||
			(parent?.type === 'ExportDefaultDeclaration' &&
				!isParenthesizedDefaultExport(parent, options)))
	) {
		// A leading comment that ends its line already breaks it. Prettier
		// breaks it again, which adds a blank line on every pass.
		const lastComment = /** @type {AST.NodeWithMaybeComments} */ (node).leadingComments?.at(-1);
		const commentEndsLine =
			!!lastComment &&
			(lastComment.type === 'Line' ||
				hasNewline(
					/** @type {string} */ (options.originalText),
					/** @type {AST.NodeWithLocation} */ (lastComment).end,
				));
		return [commentEndsLine ? '' : hardline, join(hardline, printed), hardline];
	}

	if (isClass || (isClassMember(node) && shouldBreakDecorators(node, options))) {
		return [join(hardline, printed), hardline];
	}

	if (isClassMember(node)) {
		return [group([join(line, printed), line])];
	}

	return [join(' ', printed), ' '];
}

/**
 * Print the decorators written before an export's `export` keyword, each on
 * its own line above it, like Prettier's `printDecoratorsBeforeExport`. The
 * declaration prints the ones written after the keyword (see
 * {@link printDecorators}). A parenthesized default export keeps its
 * decorators inside the parens, so it prints none here — see
 * {@link decoratorsPrintedByParent}.
 * @param {AST.ExportNamedDeclaration | AST.ExportDefaultDeclaration} node - The export node
 * @param {AstPath} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]} The prefix parts, or an empty array when there are none
 */
function printDeclarationDecorators(node, path, options, print) {
	if (!hasDecoratorsBeforeExport(node)) {
		return [];
	}

	// An ignored declaration that starts at its first decorator keeps the
	// decorators in its source
	const declaration = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (node.declaration);
	const [firstDecorator] = getDecorators(declaration);
	if (
		hasPrettierIgnore(declaration) &&
		/** @type {AST.NodeWithLocation} */ (firstDecorator).start >=
			/** @type {AST.NodeWithLocation} */ (declaration).start
	) {
		return [];
	}

	if (
		node.type === 'ExportDefaultDeclaration' &&
		isParenthesizedDefaultExport(/** @type {AST.ExportDefaultDeclaration} */ (node), options)
	) {
		return [];
	}

	return [
		join(hardline, /** @type {Doc[]} */ (path.map(print, 'declaration', 'decorators'))),
		hardline,
	];
}

/**
 * Print a comment, like Prettier's `printComment`. A multi-line block comment
 * whose every line starts with `*` takes the indentation of where it prints
 * (see {@link printIndentableBlockComment}). Any other block comment prints as
 * written.
 * @param {AST.Comment} comment - The comment
 * @param {string} [text] - The source text
 * @returns {Doc}
 */
function printComment(comment, text) {
	if (comment.type === 'Line') {
		return (hashbangComments.has(comment) ? '#!' : '//') + comment.value;
	}
	if (!comment.value.includes('\n')) {
		return '/*' + comment.value + '*/';
	}
	if (isIndentableBlockComment(comment)) {
		return printIndentableBlockComment(comment);
	}
	// The parser removes the comment's own indentation from its value, so
	// print the source, which keeps every line where it was
	const { start, end } = /** @type {AST.NodeWithLocation} */ (comment);
	const source =
		typeof text === 'string' && typeof start === 'number' && typeof end === 'number'
			? text.slice(start, end)
			: '/*' + comment.value + '*/';
	return replaceEndOfLine(source);
}

/**
 * Print a block comment whose lines all start with `*` (see
 * {@link isIndentableBlockComment}), like Prettier's
 * `printIndentableBlockComment`: each line after the first lines its `*` up
 * under the first line's, at the indentation where the comment prints. A
 * JSDoc line that ends with two spaces keeps them.
 * @param {AST.Comment} comment - The comment
 * @returns {Doc}
 */
function printIndentableBlockComment(comment) {
	const lines = `*${comment.value}*`.split('\n').map((line) => line.trimStart());
	const isJsdoc = comment.value[0] === '*' && comment.value[1] !== '*';
	return [
		'/',
		lines.map((line, index) => {
			if (index === 0) {
				return [line.trimEnd(), hardline];
			}
			if (index === lines.length - 1) {
				return [' ', line];
			}
			const trimmed = line.trimEnd();
			if (isJsdoc && trimmed !== '*' && line.endsWith('  ')) {
				return [' ', trimmed, '  ', markAsRoot(literalline)];
			}
			return [' ', trimmed, hardline];
		}),
		'/',
	];
}

/**
 * Print the comments inside an empty list's brackets, like Prettier's
 * `printDanglingCommentsInList`: `run(/* none *\/)`, or on their own lines
 * when one is a line comment.
 * @param {AST.Comment[] | undefined} comments - The comments, in source order
 * @param {string} [text] - The source text
 * @returns {Doc}
 */
function printDanglingCommentsInList(comments, text) {
	if (!comments?.length) {
		return '';
	}
	return [
		indent([
			softline,
			join(
				hardline,
				comments.map((comment) => printComment(comment, text)),
			),
		]),
		comments.some((comment) => comment.type === 'Line') ? hardline : softline,
	];
}

/**
 * Print leading comments that come before a node, or before the next
 * parenthesis of the node's type casts (see {@link printTypeCastParens}).
 * @param {AST.Node | AST.CSS.StyleSheet} node - The node the comments lead
 * @param {AST.Comment[]} allComments - The comments, in source order, which
 *   leave out the ones an ancestor prints (see {@link hoistedComments})
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {boolean} [semicolonBeforeLast] - Print the statement's leading `;`
 *   right before the last comment, a JSDoc cast that must touch its `(`
 * @returns {Doc[]}
 */
function printLeadingComments(node, allComments, options, semicolonBeforeLast) {
	const text = /** @type {string} */ (options.originalText);
	const comments = withoutHoistedComments(node, allComments);
	/** @type {Doc[]} */
	const parts = [];
	for (let i = 0; i < comments.length; i++) {
		const comment = comments[i];
		const nextComment = comments[i + 1];
		const isLastComment = i === comments.length - 1;

		if (comment.type === 'Line') {
			parts.push(printComment(comment, text));
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
			parts.push(printComment(comment, text));

			// Like Prettier's `printLeadingComment`, a block comment keeps what
			// follows it on its line. One that ends its line breaks it when it
			// also starts its line, and otherwise only when what follows doesn't
			// fit.
			const commentEnd = /** @type {AST.NodeWithLocation} */ (comment).end;
			if (hasNewline(text, commentEnd)) {
				const commentStart = /** @type {AST.NodeWithLocation} */ (comment).start;
				parts.push(hasNewline(text, commentStart, { backwards: true }) ? hardline : line);

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
 * @param {boolean} [wrapsTemplate] - Whether an element or template value
 *   prints in parentheses of its own inside the innermost pair when it breaks
 * @returns {Doc}
 */
function printTypeCastParens(node, typeCastParens, nodeContent, options, args, wrapsTemplate) {
	// A parent that prints the node's leading comments prints all of them ahead
	// of the outermost pair, so the inner pairs lose their casts
	const inside = args?.suppressLeadingComments ? [[]] : typeCastParens.inside;
	let printed = nodeContent;
	for (let index = inside.length - 1; index >= 0; index--) {
		const comments = inside[index];
		const isInnermost = index === inside.length - 1;
		const hug =
			comments.length === 0 &&
			isInnermost &&
			(node.type === 'ObjectExpression' || node.type === 'ArrayExpression');
		/** @type {Doc} */
		let inner = [...printLeadingComments(node, comments, options), printed];
		if (wrapsTemplate && isInnermost) {
			// Prettier's `babel` parser keeps a cast's parentheses as a
			// `ParenthesizedExpression`, which isn't one of the parents that
			// `maybeWrapJsxElementInParens` prints an element bare in, so the
			// element and its comments print in parentheses of their own when they
			// break
			inner = group([ifBreak('('), indent([softline, inner]), softline, ifBreak(')')]);
		}
		printed = hug ? ['(', inner, ')'] : group(['(', indent([softline, inner]), softline, ')']);
	}
	return printed;
}

/**
 * Print a node's trailing comments, to follow its printed body. Like
 * Prettier's `printTrailingComment`, one on the node's line stays there, and
 * one on a line of its own moves to a line of its own after the node's line.
 * @param {AST.Node} node - The AST node
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {AST.Comment[]} [comments] - The comments to print, when not all of them
 * @returns {Doc[]}
 */
function printTrailingComments(node, options, comments = node.trailingComments ?? []) {
	const text = /** @type {string} */ (options.originalText);
	/** @type {Doc[]} */
	const trailingParts = [];

	for (const comment of comments) {
		const commentStart = /** @type {AST.NodeWithLocation} */ (comment).start;
		// Like Prettier, a comment stays on the line it shares with code, even
		// a `;` that isn't printed
		const isInlineComment = !hasNewline(text, commentStart, { backwards: true });

		const commentDoc = printComment(comment, text);

		if (isInlineComment) {
			if (comment.type === 'Line') {
				trailingParts.push(lineSuffix([' ', commentDoc]));
				trailingParts.push(breakParent);
			} else {
				trailingParts.push([' ', commentDoc]);
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
	return trailingParts;
}

/**
 * Combine already-printed leading comment parts, a node's printed body, and its
 * trailing comments into the final Doc returned by {@link printTsrxNode}.
 * @param {AST.Node} node - The AST node
 * @param {Doc[]} parts - Leading-comment parts already collected for the node
 * @param {Doc[] | Doc} nodeContent - The printed body of the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {boolean} [suppressTrailingComments] - Leave out the trailing
 *   comments, which the parent prints
 * @returns {Doc[] | Doc}
 */
function finishTsrxNode(node, parts, nodeContent, options, suppressTrailingComments) {
	const trailingParts = suppressTrailingComments ? [] : printTrailingComments(node, options);
	if (trailingParts.length > 0) {
		parts.push(nodeContent);
		parts.push(...trailingParts);
		return parts;
	}
	// Return with or without leading comments
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

	const suppressLeadingComments = args && args.suppressLeadingComments;
	// A cast's comments print between its parentheses, not ahead of the node
	const typeCastParens = getTypeCastParens(path, options);
	// Whether a `;` that starts the statement (see `needsLeadingSemicolon`)
	// went out ahead of its comments
	let leadingSemicolonPrinted = false;

	// A `prettier-ignore` directive keeps the node's original source verbatim
	const commentNode = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (node);
	const ignoredSource =
		isIgnored(path) &&
		typeof options.originalText === 'string' &&
		typeof (/** @type {AST.NodeWithLocation} */ (node).start) === 'number' &&
		typeof (/** @type {AST.NodeWithLocation} */ (node).end) === 'number'
			? getIgnoredSource(commentNode, path, options)
			: null;

	// Handle leading comments (a union prints its own, inside its indentation)
	if (!suppressLeadingComments && !unionPrintsOwnComments(path)) {
		let allComments = typeCastParens ? typeCastParens.ahead : (node.leadingComments ?? []);
		if (
			path.key === 'declaration' &&
			path.parent?.type === 'ExportDefaultDeclaration' &&
			// A cast's comment must stay right before its parenthesis
			!typeCastParens
		) {
			allComments = [...allComments, ...hoistExportDefaultComments(path, options)];
		} else {
			allComments = withoutHoistedComments(node, allComments);
		}
		// The ignored source may start before the node, at a decorator, and
		// already hold the comments after it
		const comments = ignoredSource
			? allComments.filter(
					(comment) => /** @type {AST.NodeWithLocation} */ (comment).end <= ignoredSource.start,
				)
			: allComments;
		const lastComment = comments.at(-1);
		// A JSDoc cast must stay right before the parenthesis it casts
		leadingSemicolonPrinted = Boolean(
			lastComment &&
			isTypeCastComment(lastComment) &&
			isCommentFollowedBySameLineParen(lastComment, options) &&
			needsLeadingSemicolon(path, options),
		);
		parts.push(...printLeadingComments(node, comments, options, leadingSemicolonPrinted));
	}

	// Handle inner comments (for nodes with no children to attach to)
	const innerCommentParts = [];
	const innerComments = /** @type {AST.NodeWithMaybeComments} */ (node).innerComments;
	if (innerComments) {
		for (const comment of innerComments) {
			innerCommentParts.push(printComment(comment, options.originalText));
		}
	}

	if (ignoredSource) {
		// Like Prettier, a plain string, which doesn't break the groups around it
		const ignoredText = ignoredSource.text;
		/** @type {Doc} */
		let ignored = ignoredText;
		// Like Prettier, the node's span excludes its parentheses, and it prints
		// in the ones it needs where it is, not the ones it was written with
		let suppressTrailingComments = args?.suppressTrailingComments;
		if (typeCastParens) {
			ignored = printTypeCastParens(commentNode, typeCastParens, ignored, options, args);
		} else if (!args?.suppressOwnParens) {
			const withComments = printCommentsForFunction(
				path,
				parts,
				ignored,
				options,
				suppressTrailingComments,
			);
			if (withComments) {
				ignored = withComments;
				suppressTrailingComments = true;
			}
			if (needsParens(path, options) || sequencePrintsOwnParens(path, args)) {
				ignored = ['(', ignored, ')'];
			}
		}
		// The previous statement may have lost the `;` that ended it
		if (!leadingSemicolonPrinted && needsLeadingSemicolon(path, options, ignoredText)) {
			ignored = [';', ignored];
		}
		return finishTsrxNode(commentNode, parts, ignored, options, suppressTrailingComments);
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
			} else if (node.body.length === 0 && node.innerComments?.length) {
				// The parser keeps a comment-only file's comments on the program. Like
				// Prettier, they keep their blank lines. Each comment's docs start with
				// a line break, which the first one drops.
				nodeContent = [...printElementBodyComments(node.innerComments).slice(1), hardline];
			} else if (innerCommentParts.length > 0) {
				// With only empty statements, they print on consecutive lines like
				// the comments of an empty block
				nodeContent = [join(hardline, innerCommentParts), hardline];
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
		case 'CatchClause':
			nodeContent = printCatchClause(node, path, options, print);
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
		case 'ArrayPattern':
		case 'TSTupleType':
			nodeContent = printArray(node, path, options, print);
			break;

		case 'ObjectExpression':
			nodeContent = printObject(node, path, options, print);
			break;

		case 'ClassBody':
			nodeContent = printClassBody(node, path, options, print, args?.firstComments);
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

		case 'CallExpression':
			nodeContent = printCallExpression(path, options, print);
			break;

		case 'AwaitExpression':
			nodeContent = printAwaitExpression(node, path, options, print);
			break;

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

		case 'TSAsExpression':
		case 'TSSatisfiesExpression': {
			// Prettier's `printBinaryCastExpression`: a type that breaks lays out
			// its own lines (a union moves below the operator)
			/** @type {Doc[]} */
			const parts = [
				path.call(print, 'expression'),
				node.type === 'TSAsExpression' ? ' as ' : ' satisfies ',
				path.call(print, 'typeAnnotation'),
			];
			nodeContent = isParenthesizedCalleeOrObject(path, options, true)
				? group([indent([softline, ...parts]), softline])
				: parts;
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
			nodeContent =
				embeddedTemplateDocs.get(node) ?? printTemplateLiteral(node, path, options, print);
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
			// Statement lists skip empty statements, so this is a body
			nodeContent = ';';
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
			parts.push(...printTypeAnnotationProperty(path, print));
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
			// A key printKey quotes
			if (args?.printedKey !== undefined) {
				nodeContent = args.printedKey;
				break;
			}
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
					...printTypeAnnotationProperty(path, print),
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
			if (args?.printedKey !== undefined) {
				// A key printKey unquotes
				nodeContent = args.printedKey;
			} else if (node_typed.regex) {
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
				nodeContent = printMultilineString(printStringLiteral(node, options));
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
				if (innerCommentParts.length > 0) {
					// Like Prettier's `printDanglingComments`, the comments of an empty
					// block print on consecutive lines
					nodeContent = [
						open,
						indent([hardline, join(hardline, innerCommentParts)]),
						hardline,
						'}',
					];
				} else if (printsEmptyBlockOnOneLine(node, path)) {
					nodeContent = [open, '}'];
				} else {
					nodeContent = [open, hardline, '}'];
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

		case 'ReturnStatement':
			nodeContent = [
				'return',
				node.argument ? printReturnOrThrowArgument(path, options, print) : '',
				semi(options),
			];
			break;

		case 'BinaryExpression':
		case 'LogicalExpression':
			nodeContent = printBinaryishExpression(path, options, print);
			break;

		case 'ConditionalExpression':
			nodeContent = printConditionalExpression(path, options, print);
			break;

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
			nodeContent = printObject(node, path, options, print);
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
			const token = getTypeAnnotationToken(path.parent, path.key);
			const type = path.call(print, 'typeAnnotation');
			nodeContent = token ? [token, ' ', type] : type;
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
			nodeContent = [
				printTSPropertySignature(node, path, options, print),
				printTypeMemberSemicolon(path, options),
			];
			break;

		case 'TSMethodSignature':
			nodeContent = [
				printTSMethodSignature(node, path, options, print),
				printTypeMemberSemicolon(path, options),
			];
			break;

		case 'TSCallSignatureDeclaration':
		case 'TSConstructSignatureDeclaration':
			nodeContent = [
				printFunctionType(node, path, options, print),
				printTypeMemberSemicolon(path, options),
			];
			break;

		case 'TSFunctionType':
		case 'TSConstructorType':
			nodeContent = printFunctionType(node, path, options, print);
			break;

		case 'TSEnumMember':
			nodeContent = printTSEnumMember(node, path, options, print);
			break;
		case 'TSLiteralType':
			nodeContent = path.call(print, 'literal');
			break;

		case 'TSUnionType': {
			nodeContent = printTSUnionType(node, path, options, print, args);
			break;
		}

		case 'TSIntersectionType':
			nodeContent = printTSIntersectionType(node, path, options, print);
			break;

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
			nodeContent = [
				printTSIndexSignature(node, path, options, print),
				printTypeMemberSemicolon(path, options),
			];
			break;

		case 'TSConditionalType':
			nodeContent = printConditionalExpression(path, options, print);
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

		case 'JSXSpreadAttribute':
		case 'JSXSpreadChild':
			nodeContent = printJSXSpread(
				/** @type {AstPath<ESTreeJSX.JSXSpreadAttribute | ESTreeJSX.JSXSpreadChild>} */ (path),
				options,
				print,
			);
			break;

		case 'Decorator':
			nodeContent = ['@', path.call(print, 'expression')];
			break;

		default:
			// An import attribute (`type: "json"` in `with { … }`) isn't in the AST
			// node union. It goes through `print` so its comments print.
			if (/** @type {string} */ (node.type) === 'ImportAttribute') {
				nodeContent = [
					...printKey(
						/** @type {AST.ImportAttribute} */ (/** @type {unknown} */ (node)),
						/** @type {AstPath<AST.ImportAttribute>} */ (path),
						options,
						print,
					),
					': ',
					path.call(print, 'value'),
				];
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
		// Like Prettier's `printClass`, a class expression in parentheses puts
		// its decorators on their own lines inside them
		if (
			decorated.type === 'ClassExpression' &&
			!typeCastParens &&
			!args?.suppressOwnParens &&
			needsParens(path, options)
		) {
			nodeContent = [indent([softline, nodeContent]), softline];
		}
	}

	let suppressTrailingComments = args?.suppressTrailingComments;
	// A cast's parens belong to the cast, so they print even where a parent
	// lays out the node's other parens (`suppressOwnParens`)
	if (typeCastParens) {
		nodeContent = printTypeCastParens(
			/** @type {AST.Node} */ (node),
			typeCastParens,
			nodeContent,
			options,
			args,
			isTemplateExpression(/** @type {AST.Node} */ (node)),
		);
	} else if (
		isTemplateExpression(/** @type {AST.Node} */ (node)) &&
		!isFunctionBodyCodeBlock(path) &&
		!args?.suppressOwnParens
	) {
		// Like Prettier's `printJsxElement`, an element prints its comments
		// inside the parentheses around it, so a comment on its own line opens
		// them and a `return` keeps its value (#456). Template values (control
		// flow, code blocks) get the same parentheses.
		const trailingParts = suppressTrailingComments
			? []
			: printTrailingComments(/** @type {AST.Node} */ (node), options);
		nodeContent = printTemplateInParens(
			path,
			options,
			parts.length > 0 || trailingParts.length > 0
				? [...parts, nodeContent, ...trailingParts]
				: nodeContent,
		);
		parts.length = 0;
		suppressTrailingComments = true;
	} else if (!args?.suppressOwnParens) {
		const withComments = printCommentsForFunction(
			path,
			parts,
			nodeContent,
			options,
			suppressTrailingComments,
		);
		if (withComments) {
			nodeContent = withComments;
			suppressTrailingComments = true;
		}
		if (needsParens(path, options)) {
			nodeContent = ['(', nodeContent, ')'];
		}
	}

	return finishTsrxNode(
		/** @type {AST.Node} */ (node),
		parts,
		nodeContent,
		options,
		suppressTrailingComments,
	);
}

/**
 * Prettier's `printCommentsForFunction`: a function called right away or used
 * as a tag prints its comments inside its parentheses, which break around
 * them. Takes the leading comments out of `parts`.
 * @param {AstPath} path - The path to the node
 * @param {Doc[]} parts - The node's printed leading comments
 * @param {Doc} nodeContent - The node's printed content
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {boolean | undefined} suppressTrailingComments - Whether the parent
 *   prints the node's trailing comments
 * @returns {Doc | null} - The content with its comments, or null when the
 *   node isn't such a function or has no comments to print
 */
function printCommentsForFunction(path, parts, nodeContent, options, suppressTrailingComments) {
	if (!isIifeCalleeOrTag(path)) {
		return null;
	}
	const trailingParts = suppressTrailingComments
		? []
		: printTrailingComments(/** @type {AST.Node} */ (path.node), options);
	if (parts.length === 0 && trailingParts.length === 0) {
		return null;
	}
	const printed = [indent([softline, ...parts, nodeContent, ...trailingParts]), softline];
	parts.length = 0;
	return printed;
}

/**
 * Prettier's `isIifeCalleeOrTaggedTemplateExpressionTag`: whether the node at
 * `path` is a function or arrow function that is called right away or tags a
 * template literal.
 * @param {AstPath} path
 * @returns {boolean}
 */
function isIifeCalleeOrTag(path) {
	const node = /** @type {AST.Node} */ (path.node);
	const parent = /** @type {AST.Node | null} */ (path.parent);
	return (
		(node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') &&
		((path.key === 'callee' && parent?.type === 'CallExpression') ||
			(path.key === 'tag' && parent?.type === 'TaggedTemplateExpression'))
	);
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

	parts.push(printImportAttributes(path, options, print));

	return parts;
}

/**
 * @typedef {{ keyword: 'with' | 'assert', braceIndex: number }} ImportAttributesClause
 * @typedef {AST.TSRXImportDeclaration | AST.ExportNamedDeclaration | AST.ExportAllDeclaration} ModuleDeclarationWithSource
 */

/**
 * Find the attributes clause after an import or re-export's source, like
 * Prettier's `getImportAttributesKeyword`: the parser gives `with { … }` and
 * the older `assert { … }` the same node, so the keyword comes from the source
 * text. Returns null when the source has no clause.
 * @param {ModuleDeclarationWithSource} node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {ImportAttributesClause | null}
 */
function getImportAttributesClause(node, options) {
	const text = /** @type {string} */ (options.originalText);
	const source = /** @type {AST.NodeWithLocation} */ (/** @type {unknown} */ (node.source));
	const keywordIndex = skipWhitespaceAndComments(text, options.locEnd(source));
	const keyword = text.startsWith('assert', keywordIndex)
		? 'assert'
		: text.startsWith('with', keywordIndex)
			? 'with'
			: null;
	if (!keyword) {
		return null;
	}
	const braceIndex = skipWhitespaceAndComments(text, keywordIndex + keyword.length);
	return text.charAt(braceIndex) === '{' ? { keyword, braceIndex } : null;
}

/**
 * Whether the attributes are a lone `type: "…"` with no comments, which
 * Prettier never breaks
 * @param {AST.ImportAttribute[]} attributes
 * @returns {boolean}
 */
function isSingleTypeImportAttributes(attributes) {
	if (attributes.length !== 1) {
		return false;
	}
	const [attribute] = attributes;
	const { key, value } = attribute;
	return (
		((key.type === 'Identifier' && key.name === 'type') ||
			(key.type === 'Literal' && key.value === 'type')) &&
		value.type === 'Literal' &&
		typeof value.value === 'string' &&
		!hasComment(
			/** @type {AST.Node & AST.NodeWithMaybeComments} */ (/** @type {unknown} */ (attribute)),
		) &&
		!hasComment(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (key)) &&
		!hasComment(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (value))
	);
}

/**
 * Print the attributes clause of an import or re-export, like Prettier's
 * `printImportAttributes`: the keyword from the source, then the attributes
 * as an object literal, so `bracketSpacing`, `objectWrap`, and breaking
 * apply. A lone `type` attribute never breaks.
 * @param {AstPath<ModuleDeclarationWithSource>} path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printImportAttributes(path, options, print) {
	const { node } = path;
	const clause = node.source ? getImportAttributesClause(node, options) : null;
	if (!clause) {
		return '';
	}

	/** @type {Doc} */
	let attributesDoc = printObject(node, path, options, print);
	if (isSingleTypeImportAttributes(node.attributes ?? [])) {
		attributesDoc = removeLines(attributesDoc);
	}

	return [' ', clause.keyword, ' ', attributesDoc];
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
	const isForLoopInit = isForHeadDeclaration(
		node,
		/** @type {AST.Node | null} */ (path.getParentNode()),
	);

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
 * Whether a variable declaration is the head of a `for` loop (its init, or the
 * left side of `in`/`of`), which takes no `;`.
 * @param {AST.Node} node - The variable declaration
 * @param {AST.Node | null | undefined} parent - Its parent
 * @returns {boolean}
 */
function isForHeadDeclaration(node, parent) {
	if (!parent) {
		return false;
	}
	switch (parent.type) {
		case 'ForStatement':
			return parent.init === node;
		case 'ForOfStatement':
		case 'ForInStatement':
			return parent.left === node;
		case 'JSXForExpression':
			return parent.statementType === 'ForStatement' ? parent.init === node : parent.left === node;
		default:
			return false;
	}
}

/**
 * Prettier's `removeLines` for a hugged call argument's signature. Some of the
 * plugin's printers offer a broken layout as a later state of a
 * conditionalGroup, which `removeLines` leaves in place, so the signature
 * could still break inside a hugged argument. Keep only the first state.
 * @param {Doc} doc
 * @returns {Doc}
 */
function removeLinesForHug(doc) {
	return removeLines(
		mapDoc(doc, (part) =>
			typeof part === 'object' &&
			part !== null &&
			!Array.isArray(part) &&
			part.type === 'group' &&
			part.expandedStates
				? part.contents
				: part,
		),
	);
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

	// Function name (if any), with its comments
	if (node.id) {
		parts.push(' ');
		parts.push(path.call(print, 'id'));
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
 * name is written: no type annotation, return type, or type parameters, and,
 * like Prettier's `canPrintParamsWithoutParens`, no comment on the parameter
 * or before `=>`.
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
		!node.typeParameters &&
		!(/** @type {AST.Comment[] | undefined} */ (node.comments)?.length) &&
		!hasComment(node.params[0])
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
				printLeadingComments(arrow, arrow.leadingComments ?? [], options),
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
		// of a call too. The arguments about the outer arrow's own comments and
		// parentheses (a superclass's) don't apply to it.
		bodyDoc =
			arrow.body.type === 'ArrowFunctionExpression'
				? arrowPath.call(
						(bodyPath) =>
							args
								? print(bodyPath, {
										...args,
										suppressLeadingComments: false,
										suppressTrailingComments: false,
										suppressOwnParens: false,
									})
								: print(bodyPath),
						'body',
					)
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
		return printCommentsBeforeArrow(node, parts, options);
	}

	const shouldExpandParameters = Boolean(args?.expandLastArg || args?.expandFirstArg);
	/** @type {Doc} */
	let typeParametersDoc = node.typeParameters ? path.call(print, 'typeParameters') : '';
	/** @type {Doc} */
	let returnTypeDoc = printTypeAnnotationProperty(path, print, 'returnType');
	if (shouldExpandParameters) {
		if (willBreak(returnTypeDoc)) {
			throw new ArgExpansionBailout();
		}
		returnTypeDoc = group(removeLinesForHug(returnTypeDoc));
		if (getFunctionParameters(node).length > 0 && !isDecoratedFunction(path)) {
			if (willBreak(typeParametersDoc)) {
				throw new ArgExpansionBailout();
			}
			typeParametersDoc = removeLinesForHug(typeParametersDoc);
		}
	}

	parts.push(
		group([
			typeParametersDoc,
			printFunctionParameters(path, options, print, shouldExpandParameters),
			returnTypeDoc,
		]),
	);
	return printCommentsBeforeArrow(node, parts, options);
}

/**
 * Add the comments before an arrow's `=>`, which the parser keeps in the
 * arrow's `comments`, to its printed signature. No line break may come
 * before `=>`, so they stay on its line, one after another: source with a
 * line comment there doesn't parse. Prettier 3.9.6 prints each on its own
 * line, which puts a line break before `=>` and doesn't parse either.
 * @param {AST.ArrowFunctionExpression} node - The arrow
 * @param {Doc[]} parts - The printed signature
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc[]}
 */
function printCommentsBeforeArrow(node, parts, options) {
	for (const comment of /** @type {AST.Comment[] | undefined} */ (node.comments) ?? []) {
		parts.push(' ', printComment(comment, options.originalText));
	}
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
 * line because it can break right after its first token. That includes a
 * template printed as embedded code (see {@link getTemplateEmbedLabel}), unless
 * it is HTML that doesn't start and end with whitespace.
 * @param {AST.Node} functionBody - The arrow body
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function mayBreakAfterShortPrefix(functionBody, options) {
	const bodyLabel = getTemplateEmbedLabel(functionBody);
	return (
		functionBody.type === 'ArrayExpression' ||
		functionBody.type === 'ObjectExpression' ||
		functionBody.type === 'ArrowFunctionExpression' ||
		isBlockBody(functionBody) ||
		isTemplateExpression(functionBody) ||
		(bodyLabel?.hug !== false &&
			(Boolean(bodyLabel?.embed) ||
				isTemplateOnItsOwnLine(functionBody, /** @type {string} */ (options.originalText))))
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

/** Template values that lay out like an element in a JS expression position. */
const TEMPLATE_VALUE_TYPES = new Set([
	'JSXElement',
	'JSXFragment',
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
	'JSXCodeBlock',
]);

/**
 * Check whether an expression is a TSRX template value: an element or
 * fragment, template control flow (`@if`, `@for`, `@switch`, `@try`), or a
 * `@{ … }` code block. Where Prettier treats a JSX element specially, the
 * formatter treats these the same way, so a multi-line one after `=`,
 * `return`, or `=>` gets parentheses like an element.
 * @param {AST.Node} node - The node to check
 * @returns {boolean}
 */
function isTemplateExpression(node) {
	return TEMPLATE_VALUE_TYPES.has(node.type);
}

/**
 * A `@{ … }` code block that is the body of a function, like
 * `function App() @{ … }` or `(props) => @{ … }`, rather than a value.
 * @param {AstPath} path
 * @returns {boolean}
 */
function isFunctionBodyCodeBlock(path) {
	const parent = /** @type {AST.Node | null} */ (path.parent);
	return (
		path.node.type === 'JSXCodeBlock' &&
		path.key === 'body' &&
		(parent?.type === 'FunctionDeclaration' ||
			parent?.type === 'FunctionExpression' ||
			/** @type {string | undefined} */ (parent?.type) === 'TSDeclareFunction' ||
			(parent?.type === 'ArrowFunctionExpression' && !parent.expression))
	);
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
 * Whether the only parameter of a function hugs its parentheses, like
 * Prettier's `shouldHugTheOnlyFunctionParameter`: a destructuring pattern
 * (with at most a trivial default) or a name typed as an object or mapped
 * type. Anything else, like `props: Props<{ … }>` or `e: E & { … }`, breaks
 * the parameter list instead.
 * @param {FunctionLikeNode} node - The function-like node
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
				isObjectType(parameter.typeAnnotation.typeAnnotation)) ||
			// `({ a, b } = {})`: a destructured parameter with a trivial default
			(parameter.type === 'AssignmentPattern' &&
				(parameter.left.type === 'ObjectPattern' || parameter.left.type === 'ArrayPattern') &&
				(parameter.right.type === 'Identifier' ||
					(parameter.right.type === 'ObjectExpression' &&
						parameter.right.properties.length === 0) ||
					(parameter.right.type === 'ArrayExpression' && parameter.right.elements.length === 0))))
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
 * Print a parameter list like Prettier's `printFunctionParameters`, for
 * functions, methods, TypeScript signatures, and function and constructor
 * types. The list breaks one parameter per line (with a trailing comma under
 * `trailingComma: "all"`) unless its only parameter hugs the parentheses.
 * @param {AstPath<FunctionLikeNode>} path - The function-like node's path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [shouldExpandParameters] - Whether the function is a hugged
 * call argument, which keeps its parameters on one line
 * @param {boolean} [shouldPrintTypeParameters] - Print the node's type parameters before `(`
 * @returns {Doc[]}
 */
function printFunctionParameters(
	path,
	options,
	print,
	shouldExpandParameters = false,
	shouldPrintTypeParameters = false,
) {
	const functionNode = path.node;
	const parameters = getFunctionParameters(functionNode);
	/** @type {Doc} */
	const typeParametersDoc =
		shouldPrintTypeParameters && functionNode.typeParameters
			? path.call(print, 'typeParameters')
			: '';

	if (parameters.length === 0) {
		return [
			typeParametersDoc,
			'(',
			printDanglingCommentsInList(functionNode.innerComments, options.originalText),
			')',
		];
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
		if (willBreak(typeParametersDoc) || willBreak(printed)) {
			throw new ArgExpansionBailout();
		}
		return [group([removeLinesForHug(typeParametersDoc), '(', removeLinesForHug(printed), ')'])];
	}

	const hasNotParameterDecorator = parameters.every(
		(node) =>
			!(/** @type {AST.Identifier} */ (node).decorators) ||
			/** @type {AST.Identifier} */ (node).decorators.length === 0,
	);

	if ((shouldHugParameters && hasNotParameterDecorator) || isParametersInTestCall) {
		return [typeParametersDoc, '(', ...printed, ')'];
	}

	return [
		typeParametersDoc,
		'(',
		indent([softline, ...printed]),
		ifBreak(shouldPrintComma(options, 'all') && !hasRestParameter(functionNode) ? ',' : ''),
		softline,
		')',
	];
}

/**
 * The token a `TSTypeAnnotation` starts with, like Prettier's
 * `getTypeAnnotationFirstToken`: the `=>` of a function or constructor type,
 * none in a type predicate (`x is T`), and `:` everywhere else
 * @param {AST.Node | null} parent - The node that holds the annotation
 * @param {string | number | null} key - The property that holds it
 * @returns {string}
 */
function getTypeAnnotationToken(parent, key) {
	if (
		(parent?.type === 'TSFunctionType' || parent?.type === 'TSConstructorType') &&
		(key === 'typeAnnotation' || key === 'returnType')
	) {
		return '=>';
	}
	return parent?.type === 'TSTypePredicate' ? '' : ':';
}

/**
 * Print a type annotation or return type with its `:` (or `=>`), like
 * Prettier's `printTypeAnnotationProperty`. The `TSTypeAnnotation` prints
 * the token itself, after its leading comments, so that a comment before
 * the `:` stays there (`let x /* c *\/ : T`). A space goes before those
 * comments, and always before a `=>`.
 * @param {AstPath} path - The path to the node that holds the annotation
 * @param {PrintFn} print - Print callback
 * @param {string} [key] - The property that holds the annotation
 * @returns {Doc[]}
 */
function printTypeAnnotationProperty(path, print, key = 'typeAnnotation') {
	const annotation = /** @type {AST.Node & AST.NodeWithMaybeComments | null | undefined} */ (
		path.node[key]
	);
	if (!annotation) {
		return [];
	}
	if (annotation.type !== 'TSTypeAnnotation') {
		return [': ', path.call(print, key)];
	}
	return getTypeAnnotationToken(path.node, key) === '=>' || annotation.leadingComments?.length
		? [' ', path.call(print, key)]
		: [path.call(print, key)];
}

/**
 * The return type of a function-like node, without its `TSTypeAnnotation`
 * wrapper. TypeScript signatures keep it in `typeAnnotation`.
 * @param {FunctionLikeNode} functionNode - The function-like node
 * @returns {AST.Node | undefined}
 */
function getReturnTypeNode(functionNode) {
	const returnType =
		/** @type {{ returnType?: AST.Node }} */ (functionNode).returnType ??
		/** @type {{ typeAnnotation?: AST.Node }} */ (functionNode).typeAnnotation;
	if (returnType?.type === 'TSTypeAnnotation') {
		return /** @type {AST.TSTypeAnnotation} */ (returnType).typeAnnotation;
	}
	return returnType;
}

/**
 * Check whether the parameter list should be grouped separately from the return
 * type, so a breaking return type does not force the parameters to break too.
 * @param {FunctionLikeNode} functionNode - The function-like node
 * @param {Doc} returnTypeDoc - The printed return type
 * @param {AST.TSTypeParameterDeclaration | null | undefined} [typeParameters] - The
 *   type parameters, which a class method keeps on the method rather than its value
 * @returns {boolean}
 */
function shouldGroupFunctionParameters(
	functionNode,
	returnTypeDoc,
	typeParameters = functionNode.typeParameters,
) {
	const returnTypeNode = getReturnTypeNode(functionNode);
	if (!returnTypeNode) {
		return false;
	}
	const typeParameterList = typeParameters?.params;
	if (typeParameterList) {
		if (typeParameterList.length > 1) {
			return false;
		}
		if (typeParameterList.length === 1) {
			const typeParameter = typeParameterList[0];
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
 * Like Prettier, a constructor with more than one parameter that declares a
 * parameter property (`private readonly a: string`) always breaks its
 * parameters, one per line.
 * @param {FunctionLikeNode} functionNode - The function-like node
 * @returns {boolean}
 */
function shouldBreakFunctionParameters(functionNode) {
	const parameters = getFunctionParameters(functionNode);
	return (
		parameters.length > 1 &&
		parameters.some((parameter) => parameter.type === 'TSParameterProperty')
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
	const returnTypeDoc = printTypeAnnotationProperty(path, print, 'returnType');
	if (shouldGroupFunctionParameters(node, returnTypeDoc)) {
		return group([group(paramsPart), ...returnTypeDoc]);
	}
	return group([...paramsPart, ...returnTypeDoc]);
}

/**
 * Print the function of a class or object method from its parameters on, like
 * Prettier's `printMethodValue`: the parameters and return type as one group,
 * then the body, or a semicolon for a bodiless (abstract, declared, or
 * overload) method.
 * @param {AstPath<AST.FunctionExpression>} path - The path of the method's function
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {AST.TSTypeParameterDeclaration | null | undefined} [typeParameters] - The
 *   method's type parameters, which the caller prints before the function
 * @returns {Doc[]}
 */
function printMethodValue(path, options, print, typeParameters = path.node.typeParameters) {
	const node = path.node;
	const parametersDoc = printFunctionParameters(path, options, print);
	const returnTypeDoc = printTypeAnnotationProperty(path, print, 'returnType');
	/** @type {Doc[]} */
	const parts = [
		node.typeParameters ? path.call(print, 'typeParameters') : '',
		group([
			shouldBreakFunctionParameters(node)
				? group(parametersDoc, { shouldBreak: true })
				: shouldGroupFunctionParameters(node, returnTypeDoc, typeParameters)
					? group(parametersDoc)
					: parametersDoc,
			returnTypeDoc,
		]),
	];

	// Bodiless members terminate with a semicolon: inventing an empty body
	// makes an abstract method concrete.
	if (node.body) {
		parts.push(' ', path.call(print, 'body'));
	} else {
		parts.push(semi(options));
	}

	return parts;
}

/**
 * Print a function type, constructor type, call signature, or construct
 * signature like Prettier's `printFunctionType`: the type parameters,
 * parameters, and return type as one group.
 * @param {AST.TSFunctionType | AST.TSConstructorType | AST.TSCallSignatureDeclaration | AST.TSConstructSignatureDeclaration} node - The node
 * @param {AstPath<AST.TSFunctionType | AST.TSConstructorType | AST.TSCallSignatureDeclaration | AST.TSConstructSignatureDeclaration>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printFunctionType(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];

	// `abstract new () => T` only accepts abstract constructors
	if (node.type === 'TSConstructorType' && node.abstract) {
		parts.push('abstract ');
	}
	if (node.type === 'TSConstructorType' || node.type === 'TSConstructSignatureDeclaration') {
		parts.push('new ');
	}

	/** @type {Doc} */
	let parametersDoc = printFunctionParameters(path, options, print, false, true);

	const isArrowType = node.type === 'TSFunctionType' || node.type === 'TSConstructorType';
	/** @type {Doc[]} */
	const returnTypeDoc = node.typeAnnotation
		? printTypeAnnotationProperty(path, print)
		: isArrowType
			? [' => ']
			: [];

	if (shouldGroupFunctionParameters(node, returnTypeDoc)) {
		parametersDoc = group(parametersDoc);
	}

	parts.push(parametersDoc, returnTypeDoc);

	return group(parts);
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
 * its own line. Like Prettier, it also prints the module specifier and import
 * attributes of an import type, which take no trailing comma.
 * @param {AstPath<AST.CallExpression | AST.NewExpression | AST.TSImportType>} path - The call, new expression, or import type path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [keepOnCallLine] - Whether the arguments may stay on the
 *   call's line (see {@link keepsArgumentsOnCallLine}). Like Prettier, only a
 *   call printed on its own may, not one in a member chain.
 * @returns {Doc}
 */
function printCallArguments(path, options, print, keepOnCallLine = true) {
	const { node } = path;
	const parent = /** @type {AST.Node | null} */ (path.parent);
	const args = getCallArguments(node);

	if (args.length === 0) {
		return group(['(', printDanglingCommentsInList(node.innerComments, options.originalText), ')']);
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
	const printArgument = (index, extra) => {
		/** @param {AstPath} argumentPath */
		const printAt = (argumentPath) => {
			const printArgs = argumentPrintArgs(index, extra);
			return printArgs ? print(argumentPath, printArgs) : print(argumentPath);
		};
		// An import type's arguments are its `argument` and `options`
		if (node.type === 'TSImportType') {
			return /** @type {AstPath<AST.TSImportType>} */ (path).call(
				printAt,
				index === 0 ? 'argument' : 'options',
			);
		}
		return /** @type {AstPath<AST.CallExpression | AST.NewExpression>} */ (path).call(
			printAt,
			'arguments',
			index,
		);
	};

	if (
		keepOnCallLine &&
		node.type !== 'TSImportType' &&
		keepsArgumentsOnCallLine(
			/** @type {AstPath<AST.CallExpression | AST.NewExpression>} */ (path),
			options,
		)
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

	const trailingComma =
		node.type !== 'TSImportType' && shouldPrintComma(options, 'all') ? ifBreak(',') : '';

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
 * The arguments of a call or `new` expression, or the module specifier and
 * import attributes of an import type, like Prettier's `getCallArguments`.
 * @param {AST.CallExpression | AST.NewExpression | AST.TSImportType} node
 * @returns {AST.Node[]}
 */
function getCallArguments(node) {
	if (node.type === 'TSImportType') {
		return node.options ? [node.argument, node.options] : [node.argument];
	}
	return node.arguments || [];
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
		if (
			isBlockBody(body) ||
			isTemplateExpression(body) ||
			body.type === 'ObjectExpression' ||
			body.type === 'ArrayExpression'
		) {
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
 * parentheses. So does a lone template printed as embedded code (see
 * {@link getTemplateEmbedLabel}), unless it is HTML that doesn't start and end
 * with whitespace.
 * @param {AST.Node[]} args - The call arguments
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function shouldExpandLastArg(args, options) {
	if (args.length === 1) {
		const argLabel = getTemplateEmbedLabel(args[0]);
		if (argLabel?.embed && argLabel.hug !== false) {
			return true;
		}
	}

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
		parts.push(path.call(print, 'id'));
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
		parts.push(path.call(print, 'id'));
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
 * Print a loop, `if` or `else` body after its header, like Prettier's
 * `printClause`. A block, or the `if` of an `else if`, stays on the header's
 * line. Another statement moves to its own indented line when the enclosing
 * group breaks. A body whose first comment starts its line or spans lines
 * starts on a new line. An empty statement body prints its `;` against the
 * header, with its comments around it.
 * @param {AstPath} path - The path to the statement
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {string} [property] - The property that holds the body
 * @returns {Doc}
 */
function printClause(path, options, print, property = 'body') {
	return path.call((bodyPath) => {
		const body = /** @type {AST.Statement & AST.NodeWithMaybeComments} */ (bodyPath.node);
		const doc = print(bodyPath);
		const comments = getTypeCastParens(bodyPath, options)?.ahead ?? body.leadingComments ?? [];

		if (body.type === 'EmptyStatement') {
			return comments.length > 0 ? [' ', doc] : doc;
		}

		const isBlock = body.type === 'BlockStatement';
		const firstComment = /** @type {AST.NodeWithLocation | undefined} */ (comments[0]);
		const text = options.originalText ?? '';
		if (
			firstComment &&
			(hasNewline(text, firstComment.start, { backwards: true }) ||
				text.slice(firstComment.start, firstComment.end).includes('\n'))
		) {
			return isBlock ? [hardline, doc] : indent([hardline, doc]);
		}

		if (
			isBlock ||
			(body.type === 'IfStatement' &&
				bodyPath.getParentNode()?.type === 'IfStatement' &&
				bodyPath.key === 'alternate')
		) {
			return [' ', doc];
		}

		return indent([line, doc]);
	}, property);
}

/**
 * Print the condition of an `if`, `while` or `do … while` statement inside its
 * parentheses, like Prettier's `printIfOrWhileConditionOrWithStatementObject`:
 * a condition that doesn't fit moves onto its own lines. A negated logical
 * condition (`!(a && b)`, `!!(a && b)`) stays on the keyword's line and
 * breaks inside its own parentheses instead.
 * @param {AST.Expression} testNode - The condition
 * @param {Doc} testDoc - The printed condition
 * @returns {Doc}
 */
function printStatementCondition(testNode, testDoc) {
	return shouldInlineCondition(testNode) ? testDoc : group([indent([softline, testDoc]), softline]);
}

/**
 * Whether a statement's condition is `!(…)` or `!!(…)` around a logical
 * expression, which Prettier keeps on the keyword's line
 * (`shouldInlineCondition`).
 * @param {AST.Node} node - The condition
 * @returns {boolean}
 */
function shouldInlineCondition(node) {
	if (hasComment(node) || node.type !== 'UnaryExpression' || node.operator !== '!') {
		return false;
	}
	let argument = node.argument;
	if (argument.type === 'UnaryExpression' && argument.operator === '!') {
		argument = argument.argument;
	}
	return argument.type === 'LogicalExpression';
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
	// Like Prettier, the test's comments stay inside the parentheses, where a
	// JSDoc cast keeps its meaning
	const test = path.call(print, 'test');

	const testDoc = group(['if (', printStatementCondition(node.test, test), ')']);

	/** @type {Doc[]} */
	const parts = [group([testDoc, printClause(path, options, print, 'consequent')])];

	// Handle the alternate
	if (node.alternate) {
		// Like Prettier, `else` follows a block on its line, and anything else
		// on the next line. The comments before `else`, which the parser keeps
		// on the statement, go between them.
		const isConsequentBlock = node.consequent.type === 'BlockStatement';
		const comments = /** @type {AST.NodeWithMaybeComments} */ (node).innerComments ?? [];
		const text = options.originalText ?? '';
		/** @type {Doc} */
		let separator = isConsequentBlock ? ' ' : '';
		if (!isConsequentBlock) {
			parts.push(hardline);
		}
		if (comments.length > 0) {
			const first = /** @type {AST.NodeWithLocation} */ (comments[0]);
			const last = /** @type {AST.NodeWithLocation} */ (comments[comments.length - 1]);
			if (isPreviousLineEmpty(text, first.start)) {
				parts.push(isConsequentBlock ? [hardline, hardline] : hardline);
			} else if (hasNewline(text, first.start, { backwards: true })) {
				parts.push(isConsequentBlock ? hardline : '');
			} else {
				parts.push(' ');
			}
			parts.push(
				join(
					hardline,
					comments.map((comment) => printComment(comment, text)),
				),
			);
			separator =
				comments[comments.length - 1].type === 'Line' || hasNewline(text, last.end)
					? hardline
					: ' ';
		}

		parts.push(separator, directive ? '@else' : 'else');
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
			parts.push(group(printClause(path, options, print, 'alternate')));
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
 * @returns {Doc}
 */
function printForInStatement(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push('for (');
	parts.push(path.call(print, 'left'));
	parts.push(' in ');
	parts.push(path.call(print, 'right'));

	parts.push(')', printClause(path, options, print));

	return group(parts);
}

/**
 * Print a for-of statement (with TSRX index/key extensions)
 * @param {AST.ForOfStatement} node - The for-of statement node
 * @param {AstPath<AST.ForOfStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [directive]
 * @returns {Doc}
 */
function printForOfStatement(node, path, options, print, directive = false) {
	/** @type {Doc[]} */
	const parts = [];
	parts.push(node.await ? 'for await (' : 'for (');
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

	parts.push(')', printClause(path, options, print));
	if (node.empty) {
		parts.push(directive ? ' @empty ' : ' empty ');
		parts.push(path.call(print, 'empty'));
	}

	return group(parts);
}

/**
 * Print a for statement
 * @param {AST.ForStatement} node - The for statement node
 * @param {AstPath<AST.ForStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printForStatement(node, path, options, print) {
	const body = printClause(path, options, print);
	if (!node.init && !node.test && !node.update) {
		return group(['for (;;)', body]);
	}

	// Like Prettier, a header that doesn't fit puts each clause on its own
	// line, and an empty clause still gets its line (`for (let i = 0; ;)`)
	return group([
		'for (',
		group([
			indent([
				softline,
				node.init ? path.call(print, 'init') : '',
				';',
				line,
				node.test ? path.call(print, 'test') : '',
				';',
				node.update ? [line, path.call(print, 'update')] : '',
			]),
			softline,
		]),
		')',
		body,
	]);
}

/**
 * Print a while statement
 * @param {AST.WhileStatement} node - The while statement node
 * @param {AstPath<AST.WhileStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printWhileStatement(node, path, options, print) {
	const test = path.call(print, 'test');

	/** @type {Doc[]} */
	const parts = [];
	parts.push(
		'while (',
		printStatementCondition(node.test, test),
		')',
		printClause(path, options, print),
	);

	return group(parts);
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
	const test = path.call(print, 'test');

	/** @type {Doc[]} */
	const parts = [];
	parts.push(group(['do', printClause(path, options, print)]));
	// Like Prettier, only a block body keeps `while` on its closing line
	parts.push(node.body.type === 'BlockStatement' ? ' ' : hardline);
	parts.push('while (', printStatementCondition(node.test, test), ')');
	parts.push(semi(options));

	return parts;
}

/**
 * Whether a node is the only parameter of the function holding it and hugs
 * its parentheses. Mirrors Prettier's `shouldHugTheOnlyParameter`, for use as
 * a `path.match` predicate on the function.
 * @param {AST.Node} node - The possible function
 * @param {string | null} name - The key of the parameter in `node`
 * @returns {boolean}
 */
function shouldHugTheOnlyParameter(node, name) {
	return (
		(name === 'params' || name === 'parameters') &&
		shouldHugTheOnlyFunctionParameter(/** @type {FunctionLikeNode} */ (node))
	);
}

/**
 * Whether the source has a line break between an object's `{` and its first
 * member, which keeps the object expanded under `objectWrap: "preserve"`.
 * @param {number} openingBraceIndex - The position of the `{`
 * @param {AST.Node} firstMember - The first property or attribute
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function hasNewLineAfterOpeningBrace(openingBraceIndex, firstMember, options) {
	const text = /** @type {string} */ (options.originalText);
	const firstMemberStart = options.locStart(/** @type {AST.NodeWithLocation} */ (firstMember));
	return text.slice(openingBraceIndex, firstMemberStart).includes('\n');
}

/**
 * Print an object literal, an object pattern, or the attributes of an import
 * or re-export like Prettier's `printObject`. Under `objectWrap: "preserve"`
 * (the default) an object literal stays expanded when the source has a line
 * break between `{` and its first property; otherwise it breaks only when it
 * doesn't fit. A pattern breaks when it destructures a nested pattern, except
 * in a parameter list. A blank line after a property is kept.
 * @param {AST.ObjectExpression | AST.ObjectPattern | ModuleDeclarationWithSource} node - The object node, or the declaration whose attributes to print
 * @param {AstPath<AST.ObjectExpression | AST.ObjectPattern | ModuleDeclarationWithSource>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printObject(node, path, options, print) {
	const parent = /** @type {AST.Node} */ (path.parent);
	const isImportAttributes = node.type !== 'ObjectExpression' && node.type !== 'ObjectPattern';
	const property = isImportAttributes ? 'attributes' : 'properties';
	/** @type {AST.Node[]} */
	const children = /** @type {Record<string, AST.Node[]>} */ (/** @type {unknown} */ (node))[
		property
	];
	const openingBraceIndex = isImportAttributes
		? /** @type {ImportAttributesClause} */ (getImportAttributesClause(node, options)).braceIndex
		: options.locStart(/** @type {AST.NodeWithLocation} */ (node));

	const shouldBreak =
		(node.type === 'ObjectPattern' &&
			parent.type !== 'FunctionDeclaration' &&
			parent.type !== 'FunctionExpression' &&
			parent.type !== 'ArrowFunctionExpression' &&
			parent.type !== 'AssignmentPattern' &&
			parent.type !== 'CatchClause' &&
			node.properties.some(
				(property) =>
					property.type === 'Property' &&
					(property.value.type === 'ObjectPattern' || property.value.type === 'ArrayPattern'),
			)) ||
		(node.type !== 'ObjectPattern' &&
			options.objectWrap === 'preserve' &&
			children.length > 0 &&
			hasNewLineAfterOpeningBrace(openingBraceIndex, children[0], options));

	/** @type {Doc[]} */
	let separatorParts = [];
	/** @type {Doc[]} */
	const parts = /** @type {AstPath} */ (path).map((childPath) => {
		const result = [...separatorParts, print(childPath)];
		separatorParts = [',', line];
		if (isNextLineEmpty(/** @type {AST.Node} */ (childPath.node), options)) {
			separatorParts.push(hardline);
		}
		return result;
	}, property);

	const canHaveTrailingSeparator = children[children.length - 1]?.type !== 'RestElement';

	/** @type {Doc[]} */
	const annotationParts = [];
	if (node.type === 'ObjectPattern') {
		if (/** @type {{ optional?: boolean }} */ (node).optional) {
			annotationParts.push('?');
		}
		annotationParts.push(...printTypeAnnotationProperty(path, print));
	}

	/** @type {Doc[]} */
	let content;
	if (parts.length === 0) {
		content = [
			group([
				'{',
				printDanglingCommentsInList(
					/** @type {AST.NodeWithMaybeComments} */ (node).innerComments,
					options.originalText,
				),
				'}',
			]),
			...annotationParts,
		];
	} else {
		const spacing = options.bracketSpacing === false ? softline : line;
		content = [
			'{',
			indent([spacing, ...parts]),
			canHaveTrailingSeparator && shouldPrintComma(options) ? ifBreak(',') : '',
			spacing,
			'}',
			...annotationParts,
		];
	}

	// A pattern that is the only, hugged parameter breaks with the parameter
	// list rather than on its own, and `printAssignment` groups the left side
	// of an assignment when its layout needs it (`break-lhs` doesn't).
	if (
		path.match(
			(node) => node.type === 'ObjectPattern' && getDecorators(node).length === 0,
			shouldHugTheOnlyParameter,
		) ||
		(!shouldBreak &&
			path.match(
				(node) => node.type === 'ObjectPattern',
				(node) => node.type === 'AssignmentExpression' || node.type === 'VariableDeclarator',
			))
	) {
		return content;
	}

	return group(content, { shouldBreak });
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

	// Class name (optional for ClassExpression), with its comments
	if (node.id) {
		parts.push(' ');
		parts.push(printHeadingPart(path, options, print, 'id'));
	}

	// Add TypeScript generics if present
	if (node.typeParameters) {
		parts.push(printHeadingPart(path, options, print, 'typeParameters'));
	}

	const groupMode = shouldPrintHeritageInGroupMode(node, path);
	/** @type {Doc[]} */
	const heritage = [];
	// Whether the heading ends with a comment after the superclass
	let endsWithComment = false;
	/** @type {AST.Comment[]} */
	let bodyComments = [];
	if (node.superClass) {
		const superClassNode = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (node.superClass);
		// A JSDoc cast prints its comments, and parentheses the superclass needs
		// no others around
		const isTypeCast = Boolean(
			path.call((superPath) => getTypeCastParens(superPath, options), 'superClass'),
		);
		// Like Prettier's `printClass`, the class prints the superclass's
		// comments, around the parentheses it adds and the type arguments
		const printsComments = !isTypeCast;
		const addsParens = !isTypeCast && superClassNeedsParens(superClassNode);
		// A `prettier-ignore` after the superclass stays inside the parentheses,
		// where it keeps ignoring the superclass on the next format. After them,
		// it would lead the body.
		const trailingComments = superClassNode.trailingComments ?? [];
		const printsTrailingComments = !(addsParens && trailingComments.some(isPrettierIgnoreComment));
		const superClass = path.call(
			(superPath) =>
				print(superPath, {
					// The class owns these parens, so the superclass must not add its own
					suppressOwnParens: addsParens,
					suppressLeadingComments: printsComments,
					suppressTrailingComments: printsTrailingComments,
				}),
			'superClass',
		);
		// A line comment after the superclass and its type arguments ends the
		// heading, and the next format moves it into the body, as the parser
		// does with one before the body (Prettier moves it on its next pass
		// too), so it prints there
		if (!node.implements?.length && printsTrailingComments) {
			bodyComments = trailingComments.filter((comment) => comment.type === 'Line');
		}
		const headingComments = printsTrailingComments
			? trailingComments.filter((comment) => !bodyComments.includes(comment))
			: [];
		/** @type {Doc} */
		let superClassDoc = superClass;
		if (addsParens) {
			// Each decorator prints on its own line, so the class is indented
			// inside the parens to keep them off column zero.
			superClassDoc =
				getDecorators(superClassNode).length > 0
					? ['(', indent([hardline, superClass]), hardline, ')']
					: ['(', superClass, ')'];
		}
		const parent = /** @type {AST.Node | null} */ (path.getParentNode());
		if (parent?.type === 'AssignmentExpression') {
			// Like Prettier's `printSuperClass`, a superclass that doesn't fit
			// after `= class extends` moves into parentheses of its own
			superClassDoc = group(
				ifBreak(['(', indent([softline, superClassDoc]), softline, ')'], superClassDoc),
			);
		}
		/** @type {Doc[]} */
		const superClassParts = [
			'extends ',
			...(printsComments
				? printLeadingComments(superClassNode, superClassNode.leadingComments ?? [], options)
				: []),
			superClassDoc,
		];
		if (node.superTypeParameters) {
			superClassParts.push(path.call(print, 'superTypeParameters'));
		}
		superClassParts.push(...printTrailingComments(superClassNode, options, headingComments));
		const typeArguments = /** @type {AST.NodeWithMaybeComments | undefined} */ (
			node.superTypeParameters
		);
		endsWithComment =
			!node.implements?.length &&
			Boolean(headingComments.length || typeArguments?.trailingComments?.length);
		heritage.push(groupMode ? [line, group(superClassParts)] : [' ', superClassParts]);
	}

	// Heritage type arguments and implements clauses are what TypeScript
	// checks the class against, so dropping them silently loses those checks
	heritage.push(printHeritageClauses(node, path, options, print, groupMode));

	const body = path.call(
		(bodyPath) =>
			bodyComments.length > 0 ? print(bodyPath, { firstComments: bodyComments }) : print(bodyPath),
		'body',
	);
	if (!groupMode) {
		return [...parts, ...heritage, ' ', body];
	}

	// Like Prettier, a class whose heading breaks starts its body on a new
	// line, so the body does not read as one more heritage clause. A comment
	// that ended the heading's line, after the superclass or before the `{`,
	// would move into the body on the next format, as it does in Prettier, so
	// the body starts on its line.
	const heritageGroupId = Symbol('heritageGroup');
	const bodyNode = /** @type {AST.NodeWithMaybeComments} */ (node.body);
	return [
		group([...parts, indent(heritage)], { id: heritageGroupId }),
		node.body.body.length > 0 && !endsWithComment && !bodyNode.leadingComments?.length
			? ifBreak(hardline, ' ', { groupId: heritageGroupId })
			: ' ',
		body,
	];
}

/**
 * Print the name or the type parameters of a class or interface heading. Like
 * Prettier's `printClass`, their trailing comments indent, so one on a line of
 * its own lines up with the heritage clauses after it.
 * @param {AstPath} path - The path to the class or interface
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {'id' | 'typeParameters'} key - The part to print
 * @returns {Doc}
 */
function printHeadingPart(path, options, print, key) {
	const part = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (path.node[key]);
	if (!part.trailingComments?.length) {
		return path.call(print, key);
	}
	return [
		path.call((partPath) => print(partPath, { suppressTrailingComments: true }), key),
		indent(printTrailingComments(part, options)),
	];
}

/**
 * Whether a class or interface heading prints its heritage clauses in a group
 * that puts each clause on its own line when the heading does not fit, like
 * Prettier's `shouldPrintClassInGroupMode`. A heading with one clause keeps it
 * on the heading's line unless that clause is a plain qualified name, which
 * has nowhere else to break.
 * @param {AST.ClassDeclaration | AST.ClassExpression | AST.TSInterfaceDeclaration} node
 * @param {AstPath} path - The path to `node`
 * @returns {boolean}
 */
function shouldPrintHeritageInGroupMode(node, path) {
	const superClass = node.type === 'TSInterfaceDeclaration' ? null : node.superClass;
	if (
		node.id?.trailingComments?.length ||
		node.typeParameters?.trailingComments?.length ||
		// A comment after the superclass ends the heading, after the type
		// arguments. The next format may attach it to them or to the body, so,
		// unlike Prettier, whose output then changes, it doesn't break the
		// heading.
		superClass?.leadingComments?.length ||
		hasMultipleHeritage(node)
	) {
		return true;
	}

	if (superClass) {
		if (path.getParentNode()?.type === 'AssignmentExpression') {
			return false;
		}
		let expression = superClass;
		while (expression.type === 'ChainExpression' || expression.type === 'TSNonNullExpression') {
			expression = expression.expression;
		}
		return (
			!(/** @type {AST.ClassDeclaration} */ (node).superTypeParameters) &&
			expression.type === 'MemberExpression'
		);
	}

	// The parser gives `implements` clauses the same shape as `extends` ones,
	// with a qualified name (`ns.Base`) as a `TSQualifiedName`
	const clause = /** @type {AST.TSExpressionWithTypeArguments | undefined} */ (
		node.type === 'TSInterfaceDeclaration' ? node.extends?.[0] : node.implements?.[0]
	);
	const expression = /** @type {AST.Node | undefined} */ (clause?.expression);
	return (
		!clause?.typeParameters &&
		(expression?.type === 'MemberExpression' || expression?.type === 'TSQualifiedName')
	);
}

/**
 * Whether a class or interface names more than one heritage type, counting
 * the superclass.
 * @param {AST.ClassDeclaration | AST.ClassExpression | AST.TSInterfaceDeclaration} node
 * @returns {boolean}
 */
function hasMultipleHeritage(node) {
	if (node.type === 'TSInterfaceDeclaration') {
		return (node.extends?.length ?? 0) > 1;
	}
	return (node.superClass ? 1 : 0) + (node.implements?.length ?? 0) > 1;
}

/**
 * Print the `implements` clause of a class or the `extends` clause of an
 * interface, like Prettier's `printHeritageClauses`. With more than one
 * heritage type, the keyword starts its own line when the heading breaks, and
 * the types follow it on one line or, when they do not fit, one per line
 * below it.
 *
 * The comments before the keyword of a class with nothing before the clause
 * (the class's inner comments, Prettier's dangling comments marked with the
 * clause's name) print on their own lines before the keyword, or after it
 * with only one heritage type. There, unlike Prettier, which prints the type
 * right after them, a line comment ends its line, so that it doesn't comment
 * the type out, and a block comment is followed by a space, as it is once
 * Prettier formats its output again.
 * @param {AST.ClassDeclaration | AST.ClassExpression | AST.TSInterfaceDeclaration} node
 * @param {AstPath} path - The path to `node`
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} groupMode - Whether the heading groups its clauses
 * @returns {Doc}
 */
function printHeritageClauses(node, path, options, print, groupMode) {
	const [listName, list] =
		node.type === 'TSInterfaceDeclaration'
			? ['extends', node.extends]
			: ['implements', node.implements];
	if (!list || list.length === 0) {
		return '';
	}

	const comments = /** @type {AST.NodeWithMaybeComments} */ (node).innerComments ?? [];
	const clauses = join([',', line], path.map(print, listName));
	if (!hasMultipleHeritage(node)) {
		/** @type {Doc[]} */
		const printed = [listName, ' '];
		for (const comment of comments) {
			printed.push(
				printComment(comment, options.originalText),
				comment.type === 'Line' ? hardline : ' ',
			);
		}
		printed.push(clauses);
		return groupMode ? [line, group(printed)] : [' ', printed];
	}
	/** @type {Doc[]} */
	const printedComments = comments.map((comment) => printComment(comment, options.originalText));
	return [
		line,
		printedComments.length > 0 ? [join(hardline, printedComments), hardline] : '',
		listName,
		group(indent([line, clauses])),
	];
}

/**
 * Print a try statement (with TSRX pending block extension), like Prettier's
 * `printTryStatement`
 * @param {AST.TryStatement} node - The try statement node
 * @param {AstPath<AST.TryStatement>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {boolean} [directive=false] - Whether this is a JSX @try expression.
 * @returns {Doc[]}
 */
function printTryStatement(node, path, options, print, directive = false) {
	/** @type {Doc[]} */
	const parts = ['try ', path.call(print, 'block')];

	if (node.pending) {
		parts.push(directive ? ' @pending ' : ' pending ', path.call(print, 'pending'));
	}

	if (node.handler) {
		parts.push(' ', path.call(print, 'handler'));
	}

	if (node.finalizer) {
		parts.push(' finally ', path.call(print, 'finalizer'));
	}

	return parts;
}

/**
 * Print a `catch` clause (`@catch` in a template `@try`), like Prettier's
 * `printCatchClause`: parameters with a line comment, or a block comment on
 * a line of its own, go on their own indented line
 * @param {AST.CatchClause} node - The catch clause
 * @param {AstPath<AST.CatchClause>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printCatchClause(node, path, options, print) {
	const parent = /** @type {AST.Node | null} */ (path.parent);
	const keyword = parent?.type === 'JSXTryExpression' ? '@catch ' : 'catch ';
	if (!node.param) {
		return [keyword, path.call(print, 'body')];
	}

	const text = /** @type {string} */ (options.originalText);
	const params = [node.param, node.resetParam].filter((param) => !!param);
	const parameterHasComments = params.some((param) => {
		const { leadingComments = [], trailingComments = [] } =
			/** @type {AST.NodeWithMaybeComments} */ (param);
		return (
			leadingComments.some(
				(comment) =>
					comment.type !== 'Block' ||
					hasNewline(text, /** @type {AST.NodeWithLocation} */ (comment).end),
			) ||
			trailingComments.some(
				(comment) =>
					comment.type !== 'Block' ||
					hasNewline(text, /** @type {AST.NodeWithLocation} */ (comment).start, {
						backwards: true,
					}),
			)
		);
	});
	// A template `@catch` may also name its reset function, which breaks onto
	// its own line like a second function parameter
	const printed = [path.call(print, 'param')];
	if (node.resetParam) {
		printed.push(path.call(print, 'resetParam'));
	}

	return [
		keyword,
		parameterHasComments
			? ['(', indent([softline, join([',', line], printed)]), softline, ') ']
			: ['(', join(', ', printed), ') '],
		path.call(print, 'body'),
	];
}

/**
 * Print a class body
 * @param {AST.ClassBody} node - The class body node
 * @param {AstPath<AST.ClassBody>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {AST.Comment[]} [firstComments] - Comments from the heading that
 *   print as the body's first lines
 * @returns {Doc}
 */
function printClassBody(node, path, options, print, firstComments = []) {
	if (!node.body || node.body.length === 0) {
		const innerComments = /** @type {AST.NodeWithMaybeComments} */ (node).innerComments ?? [];
		const comments = [...firstComments, ...innerComments];
		// Like Prettier's `printDanglingComments`, on consecutive lines
		return comments.length === 0
			? '{}'
			: [
					'{',
					indent([
						hardline,
						join(
							hardline,
							comments.map((comment) => printComment(comment, options.originalText)),
						),
					]),
					hardline,
					'}',
				];
	}

	const members = path.map(print, 'body');

	// Like Prettier, every member starts its own line, and one blank line
	// stays where the source has one
	/** @type {Doc[]} */
	const parts = firstComments.flatMap((comment) => [
		printComment(comment, options.originalText),
		hardline,
	]);
	for (let i = 0; i < members.length; i++) {
		if (i > 0) {
			parts.push(hardline);
			if (shouldAddBlankLine(node.body[i - 1], node.body[i], options)) {
				parts.push(hardline);
			}
		}
		parts.push(members[i]);
		if (
			options.semi === false &&
			needsClassPropertySemicolon(node.body[i], node.body[i + 1], node.body, options)
		) {
			parts.push(';');
		}
	}

	return ['{', indent([hardline, parts]), hardline, '}'];
}

/**
 * Whether a class field printed without semicolons still needs one, because
 * the next member would otherwise continue its value or type (`x = a` then
 * `[k] = 1` reads as `x = a[k] = 1`) or a bare `static`, `get` or `set` field
 * would become that member's modifier. Mirrors Prettier's
 * shouldPrintSemicolonAfterClassProperty.
 * @param {AST.Node} node - The member just printed
 * @param {AST.Node | undefined} next - The member after it
 * @param {AST.Node[]} members - The class body's members
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function needsClassPropertySemicolon(node, next, members, options) {
	if (node.type !== 'PropertyDefinition' || !next) {
		return false;
	}

	// Only these keywords modify a member on the next line; `readonly`,
	// `declare`, `async` and the rest must share its line
	const name = getPrintedKeyName(node, members, options);
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
	const nextName = getPrintedKeyName(next, members, options);
	if (nextName === 'in' || nextName === 'instanceof') {
		return true;
	}

	// `[` indexes the field's value and `*` multiplies it
	return next.computed || (next.type === 'MethodDefinition' && next.value.generator === true);
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

	parts.push(...printTypeAnnotationProperty(path, print));

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

	// TypeScript generics live on the method node, not on its value
	if (node.typeParameters) {
		parts.push(path.call(print, 'typeParameters'));
	}

	parts.push(
		...path.call(
			(valuePath) =>
				printMethodValue(
					/** @type {AstPath<AST.FunctionExpression>} */ (valuePath),
					options,
					print,
					node.typeParameters,
				),
			'value',
		),
	);

	return parts;
}

/**
 * Print a member expression like Prettier's `printMemberExpression`. A lookup
 * in a long chain of plain property accesses can break before its `.`, except
 * where Prettier keeps it inline: a computed lookup, `a.b` outside a longer
 * chain, a `new` callee, an assignment target, and a lookup on a call with
 * arguments or a member chain in an assigned value.
 * @param {AST.MemberExpression} node - The member expression node
 * @param {AstPath<AST.MemberExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printMemberExpression(node, path, options, print) {
	const objectDoc = path.call(print, 'object');
	const lookupDoc = printMemberLookup(path, print);
	const firstNonMemberParent = findAncestor(
		path,
		(ancestor) => ancestor.type !== 'MemberExpression' && ancestor.type !== 'TSNonNullExpression',
	);
	const firstNonChainElementWrapperParent = findAncestor(
		path,
		(ancestor) => ancestor.type !== 'ChainExpression' && ancestor.type !== 'TSNonNullExpression',
	);
	const objectLabel = /** @type {{ label?: { memberChain?: boolean } }} */ (objectDoc).label;
	const object = stripChainElementWrappers(node.object);

	const shouldInline =
		(firstNonMemberParent?.type === 'AssignmentExpression' &&
			firstNonMemberParent.left.type !== 'Identifier') ||
		shouldInlineNewExpressionCallee(path) ||
		node.computed ||
		(node.object.type === 'Identifier' &&
			node.property.type === 'Identifier' &&
			firstNonChainElementWrapperParent?.type !== 'MemberExpression') ||
		((firstNonChainElementWrapperParent?.type === 'AssignmentExpression' ||
			firstNonChainElementWrapperParent?.type === 'VariableDeclarator') &&
			((object.type === 'CallExpression' && object.arguments.length > 0) ||
				Boolean(objectLabel?.memberChain)));

	return label(objectLabel, [
		objectDoc,
		lineSuffixBoundary,
		shouldInline ? lookupDoc : group(indent([softline, lookupDoc])),
	]);
}

/**
 * The closest ancestor of the node at `path` that matches `predicate`.
 * @param {AstPath} path
 * @param {(node: AST.Node) => boolean} predicate
 * @returns {AST.Node | null}
 */
function findAncestor(path, predicate) {
	for (let level = 0; ; level++) {
		const ancestor = /** @type {AST.Node | null} */ (path.getParentNode(level));
		if (!ancestor || predicate(ancestor)) {
			return ancestor;
		}
	}
}

/**
 * Whether a member expression is part of a `new` callee, where a line break
 * would read as the end of the callee (Prettier's
 * `shouldInlineNewExpressionCallee`).
 * @param {AstPath} path - The path to the member expression
 * @returns {boolean}
 */
function shouldInlineNewExpressionCallee(path) {
	/** @type {AST.Node} */
	let child = /** @type {AST.Node} */ (path.node);
	for (let level = 0; ; level++) {
		const ancestor = /** @type {AST.Node | null} */ (path.getParentNode(level));
		if (!ancestor) {
			return false;
		}
		if (!(
			(ancestor.type === 'MemberExpression' && ancestor.object === child) ||
			(ancestor.type === 'TSNonNullExpression' && ancestor.expression === child)
		)) {
			return ancestor.type === 'NewExpression' && ancestor.callee === child;
		}
		child = ancestor;
	}
}

/**
 * Print the `.property`, `?.property` or `[property]` part of a member
 * expression (Prettier's `printMemberLookup`).
 * @param {AstPath} path - The path to the member expression
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printMemberLookup(path, print) {
	const node = /** @type {AST.MemberExpression} */ (path.node);
	const property = path.call(print, 'property');
	const optional = node.optional ? '?.' : '';

	if (!node.computed) {
		return [optional || '.', property];
	}

	if (isNumericLiteral(node.property)) {
		return [optional, '[', property, ']'];
	}

	return group([optional, '[', indent([softline, property]), softline, ']']);
}

/**
 * Print a call expression like Prettier's `printCallExpression`. A call on a
 * member lookup prints as a member chain, except for the calls whose arguments
 * stay on the call's line (see {@link keepsArgumentsOnCallLine}).
 * @param {AstPath} path - The path to the call
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printCallExpression(path, options, print) {
	const node = /** @type {AST.SimpleCallExpression} */ (path.node);
	if (
		node.callee.type === 'MemberExpression' &&
		!keepsArgumentsOnCallLine(path, options) &&
		path.call((calleePath) => canInlineChainNode(calleePath, options), 'callee')
	) {
		return printMemberChain(path, options, print);
	}

	/** @type {Doc[]} */
	const parts = [path.call(print, 'callee')];
	if (node.optional) {
		parts.push('?.');
	}
	if (node.typeArguments) {
		parts.push(path.call(print, 'typeArguments'));
	}
	parts.push(printCallArguments(path, options, print));

	// Like Prettier, a call on a call groups its argument lists, so the
	// arguments of a long curried call break first
	// (see `isLongCurriedCallExpression`)
	return node.callee.type === 'CallExpression' ? group(parts) : parts;
}

/**
 * Whether a call keeps its arguments on the call's line, as Prettier's
 * `printCallExpression` does for a test call, a `require` of one module, an
 * AMD module definition, and a call on one template literal that starts on its
 * line.
 * @param {AstPath} path - The path to the call or `new` expression
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function keepsArgumentsOnCallLine(path, options) {
	const node = /** @type {AST.CallExpression | AST.NewExpression} */ (path.node);
	const args = node.arguments ?? [];
	const isTemplateLiteralSingleArg =
		args.length === 1 &&
		isTemplateOnItsOwnLine(args[0], /** @type {string} */ (options.originalText));
	// Like Prettier, a template printed as embedded code prints like any other
	// argument, which hugs the parentheses (see shouldExpandLastArg)
	if (isTemplateLiteralSingleArg && getTemplateEmbedLabel(args[0])?.embed) {
		return false;
	}
	return (
		isTemplateLiteralSingleArg ||
		isSimpleModuleImport(node) ||
		isCommonsJsOrAmdModuleDefinition(path) ||
		isTestCall(node, /** @type {AST.Node | null} */ (path.parent))
	);
}

/**
 * @typedef {{ node: AST.Node, printed: Doc, hasTrailingEmptyLine?: boolean }} PrintedChainNode
 */

/**
 * Print a call on a member expression, and the calls and lookups before it, as
 * a member chain, like Prettier's `printMemberChain`:
 *
 *   promise
 *     .then((result) => result.value)
 *     .catch((error) => console.error(error));
 *
 * The chain splits into groups, each a `.name` lookup with its calls. A short
 * chain prints on one line. A longer one prints on one line when it fits and
 * has only simple arguments, and otherwise with one group per indented line.
 * A short head (`this`, a factory like `Object` or `z`, or a short identifier
 * in a statement) stays on the first line with the first group.
 * @param {AstPath<AST.CallExpression>} path - The path to the outermost call
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printMemberChain(path, options, print) {
	const node = path.node;
	const parent = /** @type {AST.Node} */ (path.getParentNode());
	const isExpressionStatement =
		/** @type {AST.Node | null} */ (
			parent.type === 'ChainExpression' ? path.getParentNode(1) : parent
		)?.type === 'ExpressionStatement';
	const text = options.originalText ?? '';

	// Linearize the chain: `a().b()` is Call(Member(Call(a))), and prints as
	// the list [a, (), .b, ()]
	/** @type {PrintedChainNode[]} */
	const printedNodes = [];

	/**
	 * Whether a blank line typed after a call (or the first group, past its
	 * parentheses) is kept
	 * @param {AST.Node} chainNode
	 * @returns {boolean}
	 */
	const shouldInsertEmptyLineAfter = (chainNode) => {
		const nextCharIndex = getNextNonSpaceNonCommentCharacterIndex(
			text,
			/** @type {AST.NodeWithLocation} */ (chainNode).end,
		);
		if (nextCharIndex !== false && text.charAt(nextCharIndex) === ')') {
			return isNextLineEmptyAfterIndex(text, nextCharIndex + 1);
		}
		return isNextLineEmpty(chainNode, options);
	};

	/**
	 * @param {AstPath} chainPath
	 */
	const printCallTail = (chainPath) => {
		const call = /** @type {AST.SimpleCallExpression} */ (chainPath.node);
		return [
			call.optional ? '?.' : '',
			call.typeArguments ? chainPath.call(print, 'typeArguments') : '',
			printCallArguments(chainPath, options, print, false),
		];
	};

	/**
	 * @param {AstPath} chainPath
	 */
	const rec = (chainPath) => {
		const chainNode = /** @type {AST.Node} */ (chainPath.node);
		const printsItself = !canInlineChainNode(chainPath, options);
		if (
			chainNode.type === 'CallExpression' &&
			(chainNode.callee.type === 'MemberExpression' ||
				chainNode.callee.type === 'CallExpression') &&
			!printsItself
		) {
			const hasTrailingEmptyLine = shouldInsertEmptyLineAfter(chainNode);
			printedNodes.unshift({
				node: chainNode,
				hasTrailingEmptyLine,
				printed: [
					printChainNodeComments(chainNode, printCallTail(chainPath), options),
					hasTrailingEmptyLine ? hardline : '',
				],
			});
			chainPath.call(rec, 'callee');
		} else if (chainNode.type === 'MemberExpression' && !printsItself) {
			printedNodes.unshift({
				node: chainNode,
				printed: printChainNodeComments(chainNode, printMemberLookup(chainPath, print), options),
			});
			chainPath.call(rec, 'object');
		} else if (chainNode.type === 'ChainExpression' && !printsItself) {
			chainPath.call(rec, 'expression');
		} else if (chainNode.type === 'TSNonNullExpression' && !printsItself) {
			printedNodes.unshift({
				node: chainNode,
				printed: printChainNodeComments(chainNode, '!', options),
			});
			chainPath.call(rec, 'expression');
		} else {
			printedNodes.unshift({ node: chainNode, printed: print(chainPath) });
		}
	};

	// The outermost call's comments print with it, in printTsrxNode
	printedNodes.unshift({ node, printed: printCallTail(path) });
	path.call(rec, 'callee');

	// Group the list. The first group is the first node, followed by
	//   - as many calls as possible: < fn()()() >.something()
	//   - as many numeric lookups as possible: < fn()[0][1] >.something()
	//   - then all the lookups but the last one: < this.items >.something()
	// Each following group is lookups, then the calls after them:
	//   a().b.c().d().e  ->  [a, ()] [.b, .c, ()] [.d, ()] [.e]
	/** @type {PrintedChainNode[][]} */
	const groups = [];
	let currentGroup = [printedNodes[0]];
	let index = 1;
	for (; index < printedNodes.length; ++index) {
		const chainNode = printedNodes[index].node;
		if (
			chainNode.type === 'TSNonNullExpression' ||
			chainNode.type === 'ChainExpression' ||
			chainNode.type === 'CallExpression' ||
			(chainNode.type === 'MemberExpression' &&
				chainNode.computed &&
				isNumericLiteral(chainNode.property))
		) {
			currentGroup.push(printedNodes[index]);
		} else {
			break;
		}
	}
	if (printedNodes[0].node.type !== 'CallExpression') {
		for (; index + 1 < printedNodes.length; ++index) {
			if (
				printedNodes[index].node.type === 'MemberExpression' &&
				printedNodes[index + 1].node.type === 'MemberExpression'
			) {
				currentGroup.push(printedNodes[index]);
			} else {
				break;
			}
		}
	}
	groups.push(currentGroup);
	currentGroup = [];

	let hasSeenCallExpression = false;
	for (; index < printedNodes.length; ++index) {
		const chainNode = printedNodes[index].node;
		if (hasSeenCallExpression && chainNode.type === 'MemberExpression') {
			// `[0]` ends the current group instead of starting the next one
			if (chainNode.computed && isNumericLiteral(chainNode.property)) {
				currentGroup.push(printedNodes[index]);
				continue;
			}
			groups.push(currentGroup);
			currentGroup = [];
			hasSeenCallExpression = false;
		}
		if (chainNode.type === 'CallExpression' || chainNode.type === 'ImportExpression') {
			hasSeenCallExpression = true;
		}
		currentGroup.push(printedNodes[index]);
		if (/** @type {AST.NodeWithMaybeComments} */ (chainNode).trailingComments?.length) {
			groups.push(currentGroup);
			currentGroup = [];
			hasSeenCallExpression = false;
		}
	}
	if (currentGroup.length > 0) {
		groups.push(currentGroup);
	}

	// A factory (`Object.keys()`, `z.object()`, `_.values()`) or `this` is the
	// subject of the calls after it, and so is a short identifier in a
	// statement (`d3.scaleLinear()`): the first group stays on the first line
	/** @param {string} name */
	const isFactory = (name) => /^[A-Z]|^[$_]+$/.test(name);
	/** @param {string} name */
	const isShort = (name) => name.length <= (options.tabWidth ?? 2);
	const shouldNotWrap = () => {
		const firstLookup = /** @type {AST.MemberExpression | undefined} */ (groups[1][0]?.node);
		const hasComputed = Boolean(firstLookup?.computed);
		if (groups[0].length === 1) {
			const firstNode = groups[0][0].node;
			return (
				firstNode.type === 'ThisExpression' ||
				(firstNode.type === 'Identifier' &&
					(isFactory(firstNode.name) ||
						(isExpressionStatement && isShort(firstNode.name)) ||
						hasComputed))
			);
		}
		const lastNode = /** @type {AST.Node} */ (groups[0].at(-1)?.node);
		return (
			lastNode.type === 'MemberExpression' &&
			lastNode.property.type === 'Identifier' &&
			(isFactory(lastNode.property.name) || hasComputed)
		);
	};
	const shouldMerge = groups.length >= 2 && !hasComment(groups[1][0].node) && shouldNotWrap();

	/** @param {PrintedChainNode[]} printedGroup */
	const printGroup = (printedGroup) => printedGroup.map((tuple) => tuple.printed);
	/** @param {PrintedChainNode[][]} indentedGroups */
	const printIndentedGroup = (indentedGroups) =>
		indentedGroups.length === 0
			? ''
			: indent([hardline, join(hardline, indentedGroups.map(printGroup))]);

	const printedGroups = groups.map(printGroup);
	const oneLine = printedGroups;

	const cutoff = shouldMerge ? 3 : 2;
	const flatGroups = groups.flat();
	const nodeHasComment =
		flatGroups
			.slice(1, -1)
			.some(({ node }) =>
				hasOwnLeadingComments(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (node)),
			) ||
		flatGroups
			.slice(0, -1)
			.some(
				({ node }) => /** @type {AST.NodeWithMaybeComments} */ (node).trailingComments?.length,
			) ||
		Boolean(
			groups[cutoff] &&
			hasOwnLeadingComments(
				/** @type {AST.Node & AST.NodeWithMaybeComments} */ (groups[cutoff][0].node),
			),
		);

	// A chain with a single `.` group prints as it is
	if (
		groups.length <= cutoff &&
		!nodeHasComment &&
		groups.every((printedGroup) => !printedGroup.at(-1)?.hasTrailingEmptyLine)
	) {
		return isLongCurriedCallExpression(path) ? oneLine : group(oneLine);
	}

	// Keep a blank line typed after the last node before the indented groups
	const lastNodeBeforeIndent = /** @type {AST.Node} */ (groups[shouldMerge ? 1 : 0].at(-1)?.node);
	const shouldHaveEmptyLineBeforeIndent =
		lastNodeBeforeIndent.type !== 'CallExpression' &&
		shouldInsertEmptyLineAfter(lastNodeBeforeIndent);

	/** @type {Doc} */
	const expanded = [
		printGroup(groups[0]),
		shouldMerge ? printGroup(groups[1]) : '',
		shouldHaveEmptyLineBeforeIndent ? hardline : '',
		printIndentedGroup(groups.slice(shouldMerge ? 2 : 1)),
	];

	const callExpressions = /** @type {AST.CallExpression[]} */ (
		printedNodes.map(({ node }) => node).filter(({ type }) => type === 'CallExpression')
	);

	const lastGroupWillBreakAndOtherCallsHaveFunctionArguments = () => {
		const lastGroupNode = /** @type {AST.Node} */ (groups.at(-1)?.at(-1)?.node);
		const lastGroupDoc = /** @type {Doc} */ (printedGroups.at(-1));
		return (
			lastGroupNode.type === 'CallExpression' &&
			willBreak(lastGroupDoc) &&
			callExpressions
				.slice(0, -1)
				.some((call) =>
					call.arguments.some(
						(argument) =>
							argument.type === 'FunctionExpression' || argument.type === 'ArrowFunctionExpression',
					),
				)
		);
	};

	/** @type {Doc} */
	let result;
	// Don't try the one-line form when the chain has comments, when it has more
	// than two calls and any argument that isn't simple, when any group but
	// the last breaks, or when the last call breaks and another call takes a
	// function
	if (
		nodeHasComment ||
		(callExpressions.length > 2 &&
			callExpressions.some((call) =>
				call.arguments.some((argument) => !isSimpleCallArgument(argument)),
			)) ||
		printedGroups.slice(0, -1).some(willBreak) ||
		lastGroupWillBreakAndOtherCallsHaveFunctionArguments()
	) {
		result = group(expanded);
	} else {
		result = [
			// Only `oneLine` needs the check: choosing `expanded` means the parent
			// group broke already
			willBreak(oneLine) || shouldHaveEmptyLineBeforeIndent ? breakParent : '',
			conditionalGroup([oneLine, expanded]),
		];
	}

	return label({ memberChain: true }, result);
}

/**
 * Whether a node of a member chain prints as part of the chain. One that needs
 * parentheses, prints inside a JSDoc cast's parentheses, or prints verbatim
 * keeps its own printer and ends the chain.
 * @param {AstPath} path - The path to the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function canInlineChainNode(path, options) {
	const node = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (path.node);
	return (
		!needsParens(path, options) && !getTypeCastParens(path, options) && !hasPrettierIgnore(node)
	);
}

/**
 * Print a member chain node's comments around its part of the chain, since
 * the chain prints the node without `print`.
 * @param {AST.Node} node - The node
 * @param {Doc} doc - The node's part of the chain
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc}
 */
function printChainNodeComments(node, doc, options) {
	const commentNode = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (node);
	if (!commentNode.leadingComments?.length && !commentNode.trailingComments?.length) {
		return doc;
	}
	return finishTsrxNode(
		commentNode,
		printLeadingComments(commentNode, commentNode.leadingComments ?? [], options),
		doc,
		options,
	);
}

/**
 * The index of the first character after `startIndex` that isn't a space, a
 * line break or part of a comment (Prettier's
 * `getNextNonSpaceNonCommentCharacterIndex`).
 * @param {string} text
 * @param {number} startIndex
 * @returns {number | false}
 */
function getNextNonSpaceNonCommentCharacterIndex(text, startIndex) {
	/** @type {number | false | null} */
	let previousIndex = null;
	/** @type {number | false} */
	let index = startIndex;
	while (index !== previousIndex) {
		previousIndex = index;
		index = skipSpaces(text, index);
		index = skipInlineComment(text, index);
		index = skipTrailingComment(text, index);
		index = skipNewline(text, index);
	}
	return index;
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
		const argumentDoc = path.call(print, 'argument');
		// Like Prettier, an operand with comments prints in parentheses that
		// break around it
		parts.push(
			hasComment(node.argument)
				? group(['(', indent([softline, argumentDoc]), softline, ')'])
				: argumentDoc,
		);
	} else {
		parts.push(path.call(print, 'argument'), node.operator);
	}

	return parts;
}

/**
 * Print an await expression like Prettier's `printAwaitExpression`. As the
 * callee of a call or the object of a member access, it breaks onto its own
 * indented line inside its parentheses, unless it starts the argument of an
 * enclosing `await`, where the enclosing group lays out the lines so
 * `await (await` stays together.
 * @param {AST.AwaitExpression} node - The await expression node
 * @param {AstPath<AST.AwaitExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printAwaitExpression(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = ['await ', path.call(print, 'argument')];
	if (!isParenthesizedCalleeOrObject(path, options, false)) {
		return parts;
	}

	const inner = [indent([softline, ...parts]), softline];
	/** @type {AST.Node | null} */
	let ancestor;
	for (let level = 0; ; level++) {
		ancestor = /** @type {AST.Node | null} */ (path.getParentNode(level));
		if (!ancestor || ancestor.type === 'AwaitExpression' || ancestor.type === 'BlockStatement') {
			break;
		}
	}
	if (ancestor?.type === 'AwaitExpression' && startsWithNode(ancestor.argument, node)) {
		return inner;
	}
	return group(inner);
}

/**
 * Whether the node at `path` is the callee of a call (or of a `new`, with
 * `includeNew`) or the object of a member access, which print it in its own
 * parentheses. A JSDoc cast's parentheses lay the node out themselves.
 * @param {AstPath} path - The path to the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {boolean} includeNew - Whether the callee of a `new` counts
 * @returns {boolean}
 */
function isParenthesizedCalleeOrObject(path, options, includeNew) {
	const { key, parent } = path;
	if (!parent || getTypeCastParens(path, options)) {
		return false;
	}
	return (
		(key === 'callee' &&
			(parent.type === 'CallExpression' || (includeNew && parent.type === 'NewExpression'))) ||
		(key === 'object' && parent.type === 'MemberExpression')
	);
}

/**
 * Prettier's `startsWithNoLookaheadToken` with an identity check: whether
 * `target` is the leftmost part of `node`, where printing `node` starts.
 * @param {AST.Node} node - The expression
 * @param {AST.Node} target - The node to look for
 * @returns {boolean}
 */
function startsWithNode(node, target) {
	/** @type {AST.Node} */
	let current = node;
	while (current !== target) {
		const key =
			current.type === 'SequenceExpression' ? 'expressions' : getLeftmostChildKey(current);
		if (!key) {
			return false;
		}
		/** @type {AST.Node} */
		const child = /** @type {Record<string, any>} */ (current)[key];
		// A called or tagged function expression prints in its own parentheses
		current = Array.isArray(child) ? child[0] : child;
		if ((key === 'callee' || key === 'tag') && current.type === 'FunctionExpression') {
			return false;
		}
	}
	return true;
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

	if (!node.argument) {
		return parts;
	}

	// A line break right after `yield` ends the expression, as after `return`,
	// so a comment that ends its line keeps the argument in parentheses. These
	// replace any the argument would print for itself. Prettier drops them
	// and changes the yielded value; `yield*` may break before its argument.
	if (
		!node.delegate &&
		path.call(
			(argumentPath) => getOwnLineCommentAhead(argumentPath, options, { endsStatement: true }),
			'argument',
		)
	) {
		parts.push(
			' (',
			indent([
				hardline,
				path.call((argumentPath) => print(argumentPath, { suppressOwnParens: true }), 'argument'),
			]),
			hardline,
			')',
		);
	} else {
		parts.push(' ', path.call(print, 'argument'));
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
 * Print a template literal like Prettier's `printTemplateLiteral`.
 * @param {AST.TemplateLiteral} node - The template literal node
 * @param {AstPath<AST.TemplateLiteral>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTemplateLiteral(node, path, options, print) {
	const expressionDocs = printTemplateExpressions(path, options, print);
	/** @type {Doc[]} */
	const parts = [lineSuffixBoundary, '`'];
	node.quasis.forEach((quasi, index) => {
		// Like Prettier, a line break in the text is a `literalline`, which
		// breaks the groups around the template and restarts the column
		parts.push(replaceEndOfLine(quasi.value.raw));
		if (index < expressionDocs.length) {
			parts.push(expressionDocs[index]);
		}
	});
	parts.push('`');
	return parts;
}

/**
 * Print the expressions of a template literal, like Prettier's
 * `printTemplateExpressions`.
 * @param {AstPath} path - The path to the template literal
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc[]}
 */
function printTemplateExpressions(path, options, print) {
	const node = /** @type {AST.TemplateLiteral} */ (path.node);
	const indents = getTemplateLiteralExpressionIndents(node, options);
	return path.map(
		(expressionPath, index) =>
			printTemplateExpression(expressionPath, node, index, indents[index], options, print),
		'expressions',
	);
}

/**
 * Print an expression inside `${…}` like Prettier's `printTemplateExpression`.
 * An expression written on one line stays on one line: breaking it would
 * change nothing in the string, and the next pass would read the breaks as
 * written ones. One written across lines, or one that breaks anyway (a
 * function body), prints normally, aligned with the line of the template it
 * starts on.
 * @param {AstPath} path - The path to the expression
 * @param {AST.TemplateLiteral} templateLiteral - The template literal
 * @param {number} index - The expression's index
 * @param {{ indentSize: number, previousQuasiText: string }} lineIndent - See {@link getTemplateLiteralExpressionIndents}
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printTemplateExpression(path, templateLiteral, index, lineIndent, options, print) {
	const node = /** @type {AST.Node} */ (path.node);
	/** @type {Doc} */
	let expressionDoc = print(path);

	const { quasis } = templateLiteral;
	const text = options.originalText ?? '';
	const start = /** @type {AST.NodeWithLocation} */ (quasis[index]).end;
	const end = /** @type {AST.NodeWithLocation} */ (quasis[index + 1]).start;
	let interpolationHasNewline = text.slice(start, end).includes('\n');

	if (!interpolationHasNewline) {
		// Never add a line break to an interpolation that didn't have one, unless
		// one is introduced anyway, e.g. by a function body
		const rendered = printDocToString(
			expressionDoc,
			/** @type {Parameters<typeof printDocToString>[1]} */ ({
				...options,
				printWidth: Number.POSITIVE_INFINITY,
			}),
		).formatted;
		if (rendered.includes('\n')) {
			interpolationHasNewline = true;
		} else {
			expressionDoc = rendered;
		}
	}

	// Breaking at `${` and `}` reads better than breaking inside a member
	// expression
	if (
		interpolationHasNewline &&
		(hasComment(node) ||
			node.type === 'Identifier' ||
			stripChainElementWrappers(node).type === 'MemberExpression' ||
			node.type === 'ConditionalExpression' ||
			node.type === 'SequenceExpression' ||
			isCastExpression(node) ||
			isBinaryish(node))
	) {
		expressionDoc = [indent([softline, expressionDoc]), softline];
	}

	// An expression that starts a line of the template indents from that line
	// instead of from the backtick's
	expressionDoc =
		lineIndent.indentSize === 0 && lineIndent.previousQuasiText.endsWith('\n')
			? align(Number.NEGATIVE_INFINITY, expressionDoc)
			: addAlignmentToDoc(expressionDoc, lineIndent.indentSize, options.tabWidth ?? 2);

	return group(['${', expressionDoc, lineSuffixBoundary, '}']);
}

/**
 * The indentation of the template line each expression of a template literal
 * starts on, like Prettier's `getTemplateLiteralExpressionIndent`.
 * @param {AST.TemplateLiteral} templateLiteral
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {{ indentSize: number, previousQuasiText: string }[]}
 */
function getTemplateLiteralExpressionIndents(templateLiteral, options) {
	const tabWidth = options.tabWidth ?? 2;
	let previousQuasiIndentSize = 0;
	return templateLiteral.quasis.map((quasi) => {
		const text = quasi.value.raw;
		const lastNewlineIndex = text.lastIndexOf('\n');
		const indentSize =
			lastNewlineIndex === -1
				? previousQuasiIndentSize
				: getAlignmentSize(
						/** @type {RegExpMatchArray} */ (text.slice(lastNewlineIndex + 1).match(/^[\t ]*/))[0],
						tabWidth,
					);
		previousQuasiIndentSize = indentSize;
		return { indentSize, previousQuasiText: text };
	});
}

/**
 * The width of leading whitespace, with tabs aligned to the next multiple of
 * `tabWidth` (Prettier's `getAlignmentSize`).
 * @param {string} text
 * @param {number} tabWidth
 * @returns {number}
 */
function getAlignmentSize(text, tabWidth) {
	let size = 0;
	for (const character of text) {
		size = character === '\t' ? size + tabWidth - (size % tabWidth) : size + 1;
	}
	return size;
}

/**
 * @callback TextToDoc
 * @param {string} text - The embedded code
 * @param {Options} options - Its parser and options
 * @returns {Promise<Doc>}
 */

/**
 * @callback TemplateEmbedPrint
 * @param {TextToDoc} textToDoc - Prettier's formatter for the embedded code
 * @param {PrintFn} print - Print callback
 * @param {AstPath} path - The path to the template literal
 * @param {TsrxFormatOptions & Options} options - Prettier options
 * @returns {Promise<Doc | null>}
 */

/**
 * The docs of template literals whose code another language's printer
 * formats, by template (see {@link getTemplateLiteralEmbed}). The printer
 * prints one in place of the template, inside the template's comments.
 * @type {WeakMap<AST.TemplateLiteral, Doc>}
 */
const embeddedTemplateDocs = new WeakMap();

/**
 * Prettier's embedded-language printers for template literals, in the order
 * its JS `embed` tries them.
 * @type {{ test: (path: AstPath) => boolean, print: TemplateEmbedPrint }[]}
 */
const TEMPLATE_EMBEDS = [
	{ test: isEmbedCss, print: printEmbedCss },
	{ test: isEmbedGraphQL, print: printEmbedGraphQL },
	{
		test: isEmbedHtml,
		print: (textToDoc, print, path, options) =>
			printEmbedHtmlLike('html', textToDoc, print, path, options),
	},
	{
		test: isAngularComponentTemplate,
		print: (textToDoc, print, path, options) =>
			printEmbedHtmlLike('angular', textToDoc, print, path, options),
	},
	{ test: isEmbedMarkdown, print: printEmbedMarkdown },
];

/**
 * Prettier's JS `embed`: a template literal tagged or marked as CSS, GraphQL,
 * HTML, or Markdown code is printed by that language's printer, which only
 * runs with `embeddedLanguageFormatting: "auto"`. Returns the function that
 * Prettier calls with `textToDoc`, or null. The function keeps the doc in
 * {@link embeddedTemplateDocs} instead of returning it, so the template still
 * prints through `printTsrxNode` with its comments. Like Prettier, a template
 * whose code doesn't parse prints as written: the function throws, and
 * Prettier drops the error.
 * @param {AstPath<AST.TemplateLiteral>} path - The path to the template literal
 * @returns {((textToDoc: TextToDoc, print: PrintFn, path: AstPath, options: Options) => Promise<undefined>) | null}
 */
function getTemplateLiteralEmbed(path) {
	const node = path.node;
	// A quasi with an invalid escape sequence has no cooked value
	if (node.quasis.some((quasi) => quasi.value.cooked === null)) {
		return null;
	}
	const embed = TEMPLATE_EMBEDS.find(({ test }) => test(path));
	// Like Prettier, leave alone the code in a node that `prettier-ignore` keeps
	if (
		!embed ||
		/** @type {unknown[]} */ (path.stack).some(
			(item) =>
				item !== null &&
				typeof item === 'object' &&
				!Array.isArray(item) &&
				typeof (/** @type {{ type?: unknown }} */ (item).type) === 'string' &&
				hasPrettierIgnore(/** @type {AST.Node} */ (item)),
		)
	) {
		return null;
	}
	if (node.quasis.length === 1 && node.quasis[0].value.raw.trim() === '') {
		embeddedTemplateDocs.set(node, '``');
		return null;
	}
	return async (textToDoc, print, embedPath, options) => {
		const formatOptions = /** @type {TsrxFormatOptions & Options} */ (options);
		const doc = await embed.print(textToDoc, print, embedPath, formatOptions);
		if (doc) {
			const docLabel = /** @type {{ label?: object }} */ (doc).label;
			embeddedTemplateDocs.set(node, label({ embed: true, ...docLabel }, doc));
		}
		return undefined;
	};
}

/**
 * The label of an embedded template's doc (see {@link getTemplateLiteralEmbed}),
 * which a tagged template's doc takes from its template, like Prettier's.
 * @param {AST.Node} node - A template literal or tagged template
 * @returns {{ embed?: boolean, hug?: boolean } | undefined}
 */
function getTemplateEmbedLabel(node) {
	const template =
		node.type === 'TaggedTemplateExpression'
			? node.quasi
			: node.type === 'TemplateLiteral'
				? node
				: null;
	const doc = template && embeddedTemplateDocs.get(template);
	return doc && typeof doc === 'object' && !Array.isArray(doc) && doc.type === 'label'
		? /** @type {{ embed?: boolean, hug?: boolean }} */ (doc.label)
		: undefined;
}

/**
 * Prettier's `printEmbedCss`: the CSS formatted with the SCSS parser, each
 * `${…}` swapped for a placeholder while it is, on the lines after the
 * backtick, one level in.
 * @type {TemplateEmbedPrint}
 */
async function printEmbedCss(textToDoc, print, path, options) {
	const node = /** @type {AST.TemplateLiteral} */ (path.node);
	const text = node.quasis
		.map(
			(quasi, index) =>
				(index > 0 ? '@prettier-placeholder-' + (index - 1) + '-id' : '') + quasi.value.raw,
		)
		.join('');
	const quasisDoc = await textToDoc(text, { parser: 'scss' });
	const expressionDocs = printTemplateExpressions(path, options, print);
	const newDoc = replaceCssPlaceholders(quasisDoc, expressionDocs);
	if (!newDoc) {
		throw new Error("Couldn't insert all the expressions");
	}
	return ['`', indent([hardline, newDoc]), softline, '`'];
}

/**
 * Put the expressions back in place of their placeholders in the formatted
 * CSS, like Prettier's `replacePlaceholders`. Returns null when one of them
 * went missing.
 * @param {Doc} quasisDoc - The formatted CSS
 * @param {Doc[]} expressionDocs - The printed expressions
 * @returns {Doc | null}
 */
function replaceCssPlaceholders(quasisDoc, expressionDocs) {
	if (expressionDocs.length === 0) {
		return quasisDoc;
	}
	let replaceCounter = 0;
	const newDoc = mapDoc(cleanDoc(quasisDoc), (doc) => {
		if (typeof doc !== 'string' || !doc.includes('@prettier-placeholder')) {
			return doc;
		}
		// Several placeholders can share a string: `${Child}${Child2}:not(:first-child)`
		return doc.split(/@prettier-placeholder-(\d+)-id/).map((component, index) => {
			// The placeholder numbers are at the odd indexes
			if (index % 2 === 0) {
				return replaceEndOfLine(component);
			}
			replaceCounter++;
			return expressionDocs[Number(component)];
		});
	});
	return expressionDocs.length === replaceCounter ? newDoc : null;
}

/**
 * Prettier's `cleanDoc`, which its doc utilities don't export: join adjacent
 * strings, flatten arrays, and drop empty docs and nested groups.
 * @param {Doc} doc
 * @returns {Doc}
 */
function cleanDoc(doc) {
	return mapDoc(doc, (currentDoc) => {
		if (Array.isArray(currentDoc)) {
			/** @type {Doc[]} */
			const parts = [];
			for (const part of currentDoc) {
				if (!part) {
					continue;
				}
				const [currentPart, ...restParts] = Array.isArray(part) ? part : [part];
				const lastPart = parts.at(-1);
				if (typeof currentPart === 'string' && typeof lastPart === 'string') {
					parts[parts.length - 1] = lastPart + currentPart;
				} else {
					parts.push(currentPart);
				}
				parts.push(...restParts);
			}
			return parts.length === 0 ? '' : parts.length === 1 ? parts[0] : parts;
		}
		if (typeof currentDoc !== 'object' || currentDoc === null) {
			return currentDoc;
		}
		const cleaned = /** @type {Record<string, any>} */ (currentDoc);
		switch (cleaned.type) {
			case 'fill':
				if (cleaned.parts.every((/** @type {Doc} */ part) => part === '')) {
					return '';
				}
				if (cleaned.parts.length === 1) {
					return cleaned.parts[0];
				}
				break;
			case 'group':
				if (!cleaned.contents && !cleaned.id && !cleaned.break && !cleaned.expandedStates) {
					return '';
				}
				// Remove a group whose only content is a group like it
				if (
					cleaned.contents.type === 'group' &&
					cleaned.contents.id === cleaned.id &&
					cleaned.contents.break === cleaned.break &&
					cleaned.contents.expandedStates === cleaned.expandedStates
				) {
					return cleaned.contents;
				}
				break;
			case 'align':
			case 'indent':
			case 'indent-if-break':
			case 'line-suffix':
				if (!cleaned.contents) {
					return '';
				}
				break;
			case 'if-break':
				if (!cleaned.flatContents && !cleaned.breakContents) {
					return '';
				}
				break;
		}
		return currentDoc;
	});
}

/**
 * Prettier's `isEmbedCss`: styled-jsx (`<style jsx>{`…`}</style>`, `css`,
 * `css.global`, `css.resolve`), styled-components (`styled.foo`,
 * `styled(Component)`, their `.attrs(…)`, `Component.extend`, `css`,
 * `createGlobalStyle`, `keyframes`), a `css={`…`}` prop, and Angular
 * component styles.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isEmbedCss(path) {
	return (
		isStyledJsx(path) ||
		isStyledComponents(path) ||
		isCssProp(path) ||
		isAngularComponentStyles(path)
	);
}

/**
 * Prettier's `isStyledJsx`.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isStyledJsx(path) {
	return (
		path.match(
			() => true,
			(node, key) =>
				key === 'quasi' &&
				node.type === 'TaggedTemplateExpression' &&
				isNodeMatches(node.tag, ['css', 'css.global', 'css.resolve']),
		) ||
		path.match(
			() => true,
			(node, key) => key === 'expression' && node.type === 'JSXExpressionContainer',
			(node, key) =>
				key === 'children' &&
				node.type === 'JSXElement' &&
				node.openingElement.name.type === 'JSXIdentifier' &&
				node.openingElement.name.name === 'style' &&
				node.openingElement.attributes.some(
					(/** @type {any} */ attribute) =>
						attribute.type === 'JSXAttribute' &&
						attribute.name.type === 'JSXIdentifier' &&
						attribute.name.name === 'jsx',
				),
		)
	);
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isStyledIdentifier(node) {
	return node.type === 'Identifier' && node.name === 'styled';
}

/**
 * `Component.extend`
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isStyledExtend(node) {
	return (
		node.type === 'MemberExpression' &&
		/^[A-Z]/.test(/** @type {AST.Identifier} */ (node.object).name) &&
		/** @type {AST.Identifier} */ (node.property).name === 'extend'
	);
}

/**
 * Prettier's `isStyledComponents`: the template of `styled.foo`,
 * `styled(Component)`, `styled.foo.attrs(…)`, `styled(Component).attrs(…)`,
 * `Component.extend`, `Component.extend.attrs(…)`, or `css`.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isStyledComponents(path) {
	const parent = /** @type {AST.Node | null} */ (path.parent);
	if (!parent || parent.type !== 'TaggedTemplateExpression') {
		return false;
	}
	/** @type {AST.Node} */
	const tag =
		/** @type {string} */ (parent.tag.type) === 'ParenthesizedExpression'
			? /** @type {{ expression: AST.Node }} */ (/** @type {unknown} */ (parent.tag)).expression
			: parent.tag;
	switch (tag.type) {
		case 'MemberExpression':
			return isStyledIdentifier(tag.object) || isStyledExtend(tag);
		case 'CallExpression': {
			const callee = tag.callee;
			return (
				isStyledIdentifier(callee) ||
				(callee.type === 'MemberExpression' &&
					((callee.object.type === 'MemberExpression' &&
						(isStyledIdentifier(callee.object.object) || isStyledExtend(callee.object))) ||
						(callee.object.type === 'CallExpression' && isStyledIdentifier(callee.object.callee))))
			);
		}
		case 'Identifier':
			return tag.name === 'css';
		default:
			return false;
	}
}

/**
 * Prettier's `isCssProp`: the template in a JSX `css={…}` attribute.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isCssProp(path) {
	const parent = /** @type {AST.Node | null} */ (path.parent);
	const grandparent = /** @type {AST.Node | null} */ (path.grandparent);
	return (
		grandparent?.type === 'JSXAttribute' &&
		parent?.type === 'JSXExpressionContainer' &&
		grandparent.name.type === 'JSXIdentifier' &&
		grandparent.name.name === 'css'
	);
}

/**
 * The predicates of Prettier's Angular checks for the object passed to
 * `@Component(…)`.
 * @type {((node: any, key: string | number | null) => boolean)[]}
 */
const ANGULAR_COMPONENT_OBJECT_PREDICATES = [
	(node, key) => key === 'properties' && node.type === 'ObjectExpression',
	(node, key) =>
		key === 'arguments' &&
		node.type === 'CallExpression' &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'Component',
	(node, key) => key === 'expression' && node.type === 'Decorator',
];

/**
 * Prettier's `isObjectProperty`: an object property that isn't a method.
 * @param {AST.Node} node
 * @returns {node is AST.Property}
 */
function isObjectPropertyNode(node) {
	return (
		node.type === 'Property' &&
		!((node.method && node.kind === 'init') || node.kind === 'get' || node.kind === 'set')
	);
}

/**
 * An object property named `name` whose value is the node below it.
 * @param {string} name
 * @returns {(node: any, key: string | number | null) => boolean}
 */
function isPropertyValueNamed(name) {
	return (node, key) =>
		isObjectPropertyNode(node) &&
		!node.computed &&
		node.key.type === 'Identifier' &&
		node.key.name === name &&
		key === 'value';
}

/**
 * Prettier's `isAngularComponentStyles`: a template in the `styles` of
 * `@Component({ … })`.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isAngularComponentStyles(path) {
	/** @param {any} node */
	const isTemplateLiteral = (node) => node.type === 'TemplateLiteral';
	return (
		path.match(
			isTemplateLiteral,
			(node, key) => node.type === 'ArrayExpression' && key === 'elements',
			isPropertyValueNamed('styles'),
			...ANGULAR_COMPONENT_OBJECT_PREDICATES,
		) ||
		path.match(
			isTemplateLiteral,
			isPropertyValueNamed('styles'),
			...ANGULAR_COMPONENT_OBJECT_PREDICATES,
		)
	);
}

/**
 * Prettier's `isAngularComponentTemplate`: the `template` of
 * `@Component({ … })`.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isAngularComponentTemplate(path) {
	return path.match(
		(node) => node.type === 'TemplateLiteral',
		isPropertyValueNamed('template'),
		...ANGULAR_COMPONENT_OBJECT_PREDICATES,
	);
}

/**
 * Whether a node has a leading block comment that reads exactly
 * ` ${languageName} `, like Prettier's `hasLeadingBlockCommentWithName`.
 * @param {AST.Node & AST.NodeWithMaybeComments} node
 * @param {string} languageName
 * @returns {boolean}
 */
function hasLeadingBlockCommentWithName(node, languageName) {
	return Boolean(
		node.leadingComments?.some(
			(comment) => comment.type === 'Block' && comment.value === ` ${languageName} `,
		),
	);
}

/**
 * Prettier's `hasLanguageComment`: a `/* GraphQL *\/` or `/* HTML *\/`
 * comment before the template, its `as const`, or its statement.
 * @param {AstPath} path - The path to the template literal
 * @param {string} languageName
 * @returns {boolean}
 */
function hasLanguageComment(path, languageName) {
	const node = /** @type {AST.Node} */ (path.node);
	const parent = /** @type {AST.Node} */ (path.parent);
	return (
		hasLeadingBlockCommentWithName(node, languageName) ||
		(isAsConstExpression(parent) && hasLeadingBlockCommentWithName(parent, languageName)) ||
		(parent.type === 'ExpressionStatement' && hasLeadingBlockCommentWithName(parent, languageName))
	);
}

/**
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isAsConstExpression(node) {
	return (
		node.type === 'TSAsExpression' &&
		node.typeAnnotation.type === 'TSTypeReference' &&
		node.typeAnnotation.typeName.type === 'Identifier' &&
		node.typeAnnotation.typeName.name === 'const'
	);
}

/**
 * Prettier's `printEmbedGraphQL`: each text between the expressions formatted
 * as GraphQL, one per line with the expressions, one level in.
 * @type {TemplateEmbedPrint}
 */
async function printEmbedGraphQL(textToDoc, print, path, options) {
	const node = /** @type {AST.TemplateLiteral} */ (path.node);
	const numQuasis = node.quasis.length;
	const expressionDocs = printTemplateExpressions(path, options, print);
	/** @type {Doc[]} */
	const parts = [];

	for (let i = 0; i < numQuasis; i++) {
		const isFirst = i === 0;
		const isLast = i === numQuasis - 1;
		const text = /** @type {string} */ (node.quasis[i].value.cooked);
		const lines = text.split('\n');
		const numLines = lines.length;

		// Bail out if an interpolation occurs within a comment
		if (!isLast && /#[^\n\r]*$/.test(lines[numLines - 1])) {
			return null;
		}

		const startsWithBlankLine = numLines > 2 && lines[0].trim() === '' && lines[1].trim() === '';
		const endsWithBlankLine =
			numLines > 2 && lines[numLines - 1].trim() === '' && lines[numLines - 2].trim() === '';
		const commentsAndWhitespaceOnly = lines.every((textLine) =>
			/^\s*(?:#[^\n\r]*)?$/.test(textLine),
		);

		/** @type {Doc | null} */
		let doc = commentsAndWhitespaceOnly
			? printGraphqlComments(lines)
			: await textToDoc(text, { parser: 'graphql' });

		if (doc) {
			doc = escapeTemplateCharacters(doc, false);
			if (!isFirst && startsWithBlankLine) {
				parts.push('');
			}
			parts.push(doc);
			if (!isLast && endsWithBlankLine) {
				parts.push('');
			}
		} else if (!isFirst && !isLast && startsWithBlankLine) {
			parts.push('');
		}

		if (!isLast) {
			parts.push(expressionDocs[i]);
		}
	}

	return ['`', indent([hardline, join(hardline, parts)]), hardline, '`'];
}

/**
 * Prettier's `printGraphqlComments`: the comment lines of a text between
 * expressions that has only comments, or null when it has none.
 * @param {string[]} lines
 * @returns {Doc | null}
 */
function printGraphqlComments(lines) {
	/** @type {Doc[]} */
	const parts = [];
	let seenComment = false;
	const trimmedLines = lines.map((textLine) => textLine.trim());
	for (const [i, textLine] of trimmedLines.entries()) {
		// Drop the blank lines, but keep one before a comment after the first
		if (textLine === '') {
			continue;
		}
		if (trimmedLines[i - 1] === '' && seenComment) {
			parts.push([hardline, textLine]);
		} else {
			parts.push(textLine);
		}
		seenComment = true;
	}
	return parts.length === 0 ? null : join(hardline, parts);
}

/**
 * Prettier's `isEmbedGraphQL`: a `graphql`, `graphql.experimental`, or `gql`
 * tagged template, one passed to `graphql(…)`, or one marked
 * `/* GraphQL *\/`.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isEmbedGraphQL(path) {
	const parent = /** @type {AST.Node | null} */ (path.parent);
	if (hasLanguageComment(path, 'GraphQL')) {
		return true;
	}
	if (parent?.type === 'TaggedTemplateExpression') {
		const { tag } = parent;
		return (
			(tag.type === 'MemberExpression' &&
				/** @type {AST.Identifier} */ (tag.object).name === 'graphql' &&
				/** @type {AST.Identifier} */ (tag.property).name === 'experimental') ||
			(tag.type === 'Identifier' && (tag.name === 'gql' || tag.name === 'graphql'))
		);
	}
	return (
		parent?.type === 'CallExpression' &&
		parent.callee.type === 'Identifier' &&
		parent.callee.name === 'graphql'
	);
}

/**
 * Prettier's `escapeTemplateCharacters`: escape the backticks (and, for
 * cooked text, the backslashes and `${`) of embedded code printed back into a
 * template.
 * @param {Doc} doc
 * @param {boolean} raw - Whether the doc holds the template's raw text
 * @returns {Doc}
 */
function escapeTemplateCharacters(doc, raw) {
	return mapDoc(doc, (currentDoc) =>
		typeof currentDoc === 'string'
			? raw
				? currentDoc.replace(/(\\*)`/g, '$1$1\\`')
				: uncookTemplateElementValue(currentDoc)
			: currentDoc,
	);
}

/**
 * Prettier's `uncookTemplateElementValue`.
 * @param {string} cookedValue
 * @returns {string}
 */
function uncookTemplateElementValue(cookedValue) {
	return cookedValue.replace(/([\\`]|\$\{)/g, '\\$1');
}

/**
 * Tells apart the placeholders of nested HTML templates, like Prettier's
 * `htmlTemplateLiteralCounter`.
 */
let htmlTemplateLiteralCounter = 0;

/**
 * Prettier's `printEmbedHtmlLike`: the template formatted as HTML (or an
 * Angular template), each `${…}` swapped for a placeholder while it is.
 * @param {'html' | 'angular'} parser
 * @param {TextToDoc} textToDoc
 * @param {PrintFn} print
 * @param {AstPath} path - The path to the template literal
 * @param {TsrxFormatOptions & Options} options - Prettier options
 * @returns {Promise<Doc>}
 */
async function printEmbedHtmlLike(parser, textToDoc, print, path, options) {
	const node = /** @type {AST.TemplateLiteral} */ (path.node);
	const counter = htmlTemplateLiteralCounter;
	htmlTemplateLiteralCounter = (htmlTemplateLiteralCounter + 1) >>> 0;

	/** @param {number | string} index */
	const composePlaceholder = (index) => `PRETTIER_HTML_PLACEHOLDER_${index}_${counter}_IN_JS`;

	const text = node.quasis
		.map((quasi, index, quasis) =>
			index === quasis.length - 1
				? /** @type {string} */ (quasi.value.cooked)
				: /** @type {string} */ (quasi.value.cooked) + composePlaceholder(index),
		)
		.join('');

	const expressionDocs = printTemplateExpressions(path, options, print);

	const placeholderRegex = new RegExp(composePlaceholder(String.raw`(\d+)`), 'g');
	let topLevelCount = 0;
	const doc = await textToDoc(text, {
		parser,
		/** @param {{ children: unknown[] }} root */
		__onHtmlRoot(root) {
			topLevelCount = root.children.length;
		},
	});

	const contentDoc = mapDoc(doc, (currentDoc) => {
		if (typeof currentDoc !== 'string') {
			return currentDoc;
		}
		/** @type {Doc[]} */
		const parts = [];
		const components = currentDoc.split(placeholderRegex);
		for (let i = 0; i < components.length; i++) {
			let component = components[i];
			if (i % 2 === 0) {
				if (component) {
					component = uncookTemplateElementValue(component);
					if (options.__embeddedInHtml) {
						component = component.replace(/<\/(?=script\b)/gi, String.raw`<\/`);
					}
					parts.push(component);
				}
				continue;
			}
			parts.push(expressionDocs[Number(component)]);
		}
		return parts;
	});

	const leadingWhitespace = /^\s/.test(text) ? ' ' : '';
	const trailingWhitespace = /\s$/.test(text) ? ' ' : '';

	const linebreak =
		options.htmlWhitespaceSensitivity === 'ignore'
			? hardline
			: leadingWhitespace && trailingWhitespace
				? line
				: null;

	if (linebreak) {
		return group(['`', indent([linebreak, group(contentDoc)]), linebreak, '`']);
	}

	return label(
		{ hug: false },
		group([
			'`',
			leadingWhitespace,
			topLevelCount > 1 ? indent(group(contentDoc)) : group(contentDoc),
			trailingWhitespace,
			'`',
		]),
	);
}

/**
 * Prettier's `isEmbedHtml`: an `html` tagged template, or one marked
 * `/* HTML *\/`.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isEmbedHtml(path) {
	return (
		hasLanguageComment(path, 'HTML') ||
		path.match(
			(node) => node.type === 'TemplateLiteral',
			(node, key) =>
				node.type === 'TaggedTemplateExpression' &&
				node.tag.type === 'Identifier' &&
				node.tag.name === 'html' &&
				key === 'quasi',
		)
	);
}

/**
 * Prettier's `printEmbedMarkdown`: the template formatted as Markdown, with
 * the indentation of its first line, or from the start of the line.
 * @type {TemplateEmbedPrint}
 */
async function printEmbedMarkdown(textToDoc, print, path) {
	const node = /** @type {AST.TemplateLiteral} */ (path.node);
	let text = node.quasis[0].value.raw.replace(
		/((?:\\\\)*)\\`/g,
		(_, /** @type {string} */ backslashes) => '\\'.repeat(backslashes.length / 2) + '`',
	);
	const indentation = getMarkdownIndentation(text);
	const hasIndent = indentation !== '';
	if (hasIndent) {
		text = text.replace(new RegExp(`^${indentation}`, 'gm'), '');
	}
	const doc = escapeTemplateCharacters(
		await textToDoc(text, { parser: 'markdown', __inJsTemplate: true }),
		true,
	);
	return [
		'`',
		hasIndent ? indent([softline, doc]) : [literalline, dedentToRoot(doc)],
		softline,
		'`',
	];
}

/**
 * The indentation of the first line with text, like Prettier's markdown
 * `getIndentation`.
 * @param {string} text
 * @returns {string}
 */
function getMarkdownIndentation(text) {
	const firstMatchedIndent = text.match(/^([^\S\n]*)\S/m);
	return firstMatchedIndent === null ? '' : firstMatchedIndent[1];
}

/**
 * Prettier's `isEmbedMarkdown`: an `md` or `markdown` tagged template without
 * expressions.
 * @param {AstPath} path - The path to the template literal
 * @returns {boolean}
 */
function isEmbedMarkdown(path) {
	const node = /** @type {AST.TemplateLiteral} */ (path.node);
	const parent = /** @type {AST.Node | null} */ (path.parent);
	return (
		parent?.type === 'TaggedTemplateExpression' &&
		node.quasis.length === 1 &&
		parent.tag.type === 'Identifier' &&
		(parent.tag.name === 'md' || parent.tag.name === 'markdown')
	);
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
	// Like Prettier, a space goes before the template's leading comments, or a
	// line break when they start a line. Prettier's line break is a `softline`,
	// which joins the comment to the tag when it fits (`tag/* c *\/ \`x\``), and
	// its next pass then adds the space: a `line` prints that second form at
	// once.
	const quasiComment = /** @type {AST.NodeWithMaybeComments} */ (node.quasi).leadingComments?.[0];
	if (quasiComment) {
		const end = /** @type {AST.NodeWithLocation} */ (node.typeArguments ?? node.tag).end;
		const start = /** @type {AST.NodeWithLocation} */ (quasiComment).start;
		const text = /** @type {string} */ (options.originalText);
		parts.push(text.slice(end, start).includes('\n') ? line : ' ');
	}
	// Like Prettier, a line comment after the tag prints before the backtick,
	// which an embedded template's doc doesn't print first
	parts.push(lineSuffixBoundary, path.call(print, 'quasi'));
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
	return ['throw', printReturnOrThrowArgument(path, options, print), semi(options)];
}

/**
 * Print the argument of a `return` or `throw` statement, with the space after
 * the keyword, like Prettier's `printReturnOrThrowArgument`. An argument that
 * starts with a comment that ends its line or spans lines prints in
 * parentheses, since a line break after the keyword would end the statement
 * (Prettier's `returnArgumentHasLeadingComment`). A binary or logical
 * argument that breaks prints in parentheses, with its operands on their own
 * lines.
 * @param {AstPath<AST.ReturnStatement | AST.ThrowStatement>} path - The path to the statement
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printReturnOrThrowArgument(path, options, print) {
	if (
		path.call(
			(argumentPath) =>
				getOwnLineCommentAhead(argumentPath, options, {
					endsStatement: true,
					isReturnArgument: true,
				}),
			'argument',
		)
	) {
		// These parens replace any the argument would print for itself
		return [
			' (',
			indent([
				hardline,
				path.call((argumentPath) => print(argumentPath, { suppressOwnParens: true }), 'argument'),
			]),
			hardline,
			')',
		];
	}
	const argumentDoc = path.call(print, 'argument');
	// A JSDoc cast prints its own parentheses around the expression
	const argument = path.node.argument;
	if (
		argument &&
		isBinaryish(argument) &&
		!path.call((argumentPath) => getTypeCastParens(argumentPath, options), 'argument')
	) {
		return [' ', group([ifBreak('('), indent([softline, argumentDoc]), softline, ifBreak(')')])];
	}
	return [' ', argumentDoc];
}

/**
 * The first comment printed ahead of the node at `path`, when the comments
 * printed ahead of it end with a line break. The leftmost operand's comments
 * print ahead of the node too (a comment inside the parentheses of
 * `(a || b)()` belongs to the callee), unless the node prints its own
 * parentheses or its source verbatim.
 * @param {AstPath} path - The path to the node
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {{ skipLookupComments?: boolean, isOperand?: boolean, endsStatement?: boolean, isReturnArgument?: boolean }} [flags]
 *   - `skipLookupComments`: leave out the comments a lookup in the leftmost
 *   operand takes from inside itself (`item\n  // note\n  .run()`), which a
 *   member chain prints before its `.`, like Prettier's
 *   `hasLeadingOwnLineComment`, which looks at the value's own comments only
 *   - `isOperand`: whether the node is a leftmost operand
 *   - `endsStatement`: the node follows a keyword that a line break ends
 *   (`return`, `throw`, `yield`), so a block comment spanning lines counts
 *   too, like in Prettier's `returnArgumentHasLeadingComment`
 *   - `isReturnArgument`: the node is a `return` or `throw` argument, which
 *   also counts the comments a function called right away prints inside its
 *   parentheses, like Prettier's `returnArgumentHasLeadingComment`
 * @returns {AST.Comment | null}
 */
function getOwnLineCommentAhead(path, options, flags = {}) {
	const node = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (path.node);
	const typeCastParens = getTypeCastParens(path, options);
	const nodeStart = /** @type {AST.NodeWithLocation} */ (node).start;
	const comments = (typeCastParens ? typeCastParens.ahead : (node.leadingComments ?? [])).filter(
		(comment) =>
			!flags.skipLookupComments ||
			!flags.isOperand ||
			/** @type {AST.NodeWithLocation} */ (comment).start < nodeStart,
	);
	const firstComment = comments[0] ?? null;
	const isTypeCast = Boolean(typeCastParens);
	// A function called right away prints its comments inside its parentheses.
	// Like Prettier's `returnArgumentHasLeadingComment`, which looks at the
	// leftmost operand's comments that end their line, a `return` still counts
	// those.
	const printsCommentsInParens = !isTypeCast && isIifeCalleeOrTag(path);
	if (printsCommentsInParens && !flags.isReturnArgument) {
		return null;
	}
	if (
		hasLeadingOwnLineComment(node, comments, options, isTypeCast) ||
		// Unlike Prettier, which checks only the argument's own comments, the
		// leftmost operand's count too, since `foo` in `return (/* a⏎ b */
		// foo).bar` would print right after the `return` as well
		(flags.endsStatement &&
			!printsCommentsInParens &&
			hasLeadingMultilineComment(node, comments, isTypeCast))
	) {
		return firstComment;
	}
	const key = getLeftmostChildKey(node);
	if (!key || hasPrettierIgnore(node) || typeCastParens || needsParens(path, options)) {
		return null;
	}
	const comment = path.call(
		(childPath) => getOwnLineCommentAhead(childPath, options, { ...flags, isOperand: true }),
		key,
	);
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
	const comment = path.call(
		(valuePath) => getOwnLineCommentAhead(valuePath, options, { skipLookupComments: true }),
		key,
	);
	if (!comment) {
		return null;
	}
	const commentStart = /** @type {AST.NodeWithLocation} */ (comment).start;
	if (hasNewline(options.originalText ?? '', commentStart, { backwards: true })) {
		return indent([hardline, valueDoc]);
	}
	// A block comment that only ends its line lets the value join it if it fits
	return [' ', group(indent(valueDoc))];
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
	parts.push(printHeadingPart(path, options, print, 'id'));

	if (node.typeParameters) {
		parts.push(printHeadingPart(path, options, print, 'typeParameters'));
	}

	// Handle extends clause. Unlike a class body, an interface body stays on
	// the heading's last line when the heading breaks, like Prettier.
	const groupMode = shouldPrintHeritageInGroupMode(node, path);
	const heritage = printHeritageClauses(node, path, options, print, groupMode);
	return [
		groupMode ? group([...parts, indent(heritage)]) : [...parts, heritage],
		' ',
		path.call(print, 'body'),
	];
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

	// Each member prints its own `;` (see `printTypeMemberSemicolon`)
	return group([
		'{',
		indent([hardline, printTypeMembers(node.body, path, 'body', options, print)]),
		hardline,
		'}',
	]);
}

/**
 * Print the members of an interface or type literal on their own lines, with
 * a blank line where the source has one. Like Prettier's class body printer,
 * a member that needs a `;` without semicolons gets it after its comments.
 * @param {AST.Node[]} members - The members
 * @param {AstPath} path - The path of the interface body or type literal
 * @param {'body' | 'members'} key - The property that holds the members
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {Doc} [separator] - The line between members: `line` lets a type
 *   literal stay on one line
 * @returns {Doc[]}
 */
function printTypeMembers(members, path, key, options, print, separator = hardline) {
	const isInterface = path.node.type === 'TSInterfaceBody';
	/** @type {Doc[]} */
	const parts = [];
	path.each((memberPath, index) => {
		if (index > 0) {
			parts.push(separator);
			if (shouldAddBlankLine(members[index - 1], members[index], options)) {
				parts.push(hardline);
			}
		}
		parts.push(print(memberPath));
		if (
			options.semi === false &&
			isInterface &&
			typeMemberNeedsSemicolon(members[index], members[index + 1], members, options)
		) {
			parts.push(';');
		}
	}, key);
	return parts;
}

/**
 * The `;` that ends an interface or type literal member. Like Prettier's
 * `printClassMemberSemicolon`, it belongs to the member, so the member's
 * trailing comments print after it. A type literal on one line has none after
 * its last member, and without semicolons it keeps the others only on one line.
 * @param {AstPath} path - The member's path
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc}
 */
function printTypeMemberSemicolon(path, options) {
	const parent = path.getParentNode();
	if (parent?.type === 'TSInterfaceBody') {
		return semi(options);
	}
	if (parent?.type !== 'TSTypeLiteral') {
		return '';
	}
	if (path.isLast) {
		return options.semi === false ? '' : ifBreak(';', '');
	}
	if (
		options.semi !== false ||
		typeMemberNeedsSemicolon(path.node, path.next, path.siblings ?? [path.node], options)
	) {
		return ';';
	}
	return ifBreak('', ';');
}

/**
 * Whether an interface or type literal member still needs its `;` without
 * semicolons: a bare `static`, `get` or `set` property would become a modifier
 * of the next member, and a property without a type would turn a call
 * signature after it into a method (`a` then `(): void` reads as `a(): void`).
 * Mirrors Prettier's `shouldPrintSemicolonAfterInterfaceProperty`.
 * @param {AST.Node} node - The member
 * @param {AST.Node | undefined} next - The member after it
 * @param {AST.Node[]} members - The interface's or type literal's members
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {boolean}
 */
function typeMemberNeedsSemicolon(node, next, members, options) {
	if (node.type !== 'TSPropertySignature') {
		return false;
	}
	// A key printed without its quotes counts too
	const name = node.typeAnnotation ? null : getPrintedKeyName(node, members, options);
	if (name === 'static' || name === 'get' || name === 'set') {
		return true;
	}
	return next?.type === 'TSCallSignatureDeclaration' && !node.typeAnnotation;
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
		return group(['{', indent([softline, printComment(comments[0])]), softline, '}']);
	}
	// Like Prettier's `printDanglingComments`, on consecutive lines
	return [
		'{',
		indent([
			hardline,
			join(
				hardline,
				comments.map((comment) => printComment(comment)),
			),
		]),
		hardline,
		'}',
	];
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
	const head = [node.declare ? 'declare type ' : 'type ', path.call(print, 'id')];

	if (node.typeParameters) {
		head.push(path.call(print, 'typeParameters'));
	}

	return [printAssignment(path, options, print, head, ' =', 'typeAnnotation'), semi(options)];
}

/**
 * Print a TypeScript union type like Prettier's `printUnionType`: `A | B | C`
 * on one line, or one member per line after a leading `|`. The broken form
 * moves to its own indented line, unless the context already indents it (an
 * assignment that breaks after `=`) or keeps it in place (type arguments,
 * tuple members, conditional type branches).
 * @param {AST.TSUnionType} node - The union node
 * @param {AstPath<AST.TSUnionType>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {PrintArgs} [args] - Additional context arguments
 * @returns {Doc}
 */
function printTSUnionType(node, path, options, print, args) {
	// `{ … } | null` stays inline
	if (shouldHugUnionType(node)) {
		return join(' | ', path.map(print, 'types'));
	}

	/** @type {Doc} */
	let printed = group(
		path.map((typePath, index) => {
			const bar = index === 0 ? ifBreak('| ') : [line, '| '];
			const type = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (typePath.node);
			// Like Prettier, a member without leading comments prints its trailing
			// ones outside its alignment, so that one on its own line lines up
			// with the `|`s
			if (type.leadingComments?.length || !type.trailingComments?.length) {
				return [bar, align(2, print(typePath))];
			}
			return [
				bar,
				align(2, print(typePath, { suppressTrailingComments: true })),
				printTrailingComments(type, options),
			];
		}, 'types'),
	);

	if (unionPrintsOwnComments(path) && !args?.suppressLeadingComments) {
		printed = [...printLeadingComments(node, node.leadingComments ?? [], options), printed];
	}

	if (needsParens(path, options)) {
		return group([indent([softline, printed]), softline]);
	}

	if (isMultipleTupleTypeElement(path)) {
		return group([indent([ifBreak(['(', softline]), printed]), softline, ifBreak(')')]);
	}

	if (args?.assignmentLayout === 'break-after-operator' || !shouldIndentUnionType(path)) {
		return printed;
	}

	return group(indent([softline, printed]));
}

/**
 * Print a TypeScript intersection type like Prettier's `printIntersectionType`.
 * Two types that aren't object types break after the `&` between them, with
 * the next type on an indented line. An object type stays on the line of the
 * `&` before it and breaks inside its braces, indented once the chain has
 * broken before it.
 * @param {AST.TSIntersectionType} node - The intersection node
 * @param {AstPath<AST.TSIntersectionType>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printTSIntersectionType(node, path, options, print) {
	let wasIndented = false;
	return group(
		path.map((typePath, index) => {
			const doc = print(typePath);
			if (index === 0) {
				return doc;
			}

			const type = node.types[index];
			const currentIsObjectType = isObjectType(type);
			const previousIsObjectType = isObjectType(node.types[index - 1]);

			// Two object types stay together
			if (previousIsObjectType && currentIsObjectType) {
				return [' & ', wasIndented ? indent(doc) : doc];
			}

			// Without an object type, the next type moves to its own line
			if (
				(!previousIsObjectType && !currentIsObjectType) ||
				hasLeadingOwnLineComment(
					type,
					/** @type {AST.NodeWithMaybeComments} */ (type).leadingComments ?? [],
					options,
				)
			) {
				return indent([' &', line, doc]);
			}

			// Between an object type and another type, the object type stays inline
			if (index > 1) {
				wasIndented = true;
			}
			return [' & ', index > 1 ? indent(doc) : doc];
		}, 'types'),
	);
}

/**
 * Prettier's `shouldUnionTypePrintOwnComments`: a union that breaks onto its
 * own lines prints its leading comments inside its indentation, so they move
 * with it. A union member of a tuple leaves them outside its parentheses.
 * @param {AstPath} path - The path to the node
 * @returns {boolean}
 */
function unionPrintsOwnComments(path) {
	const node = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (path.node);
	return (
		node.type === 'TSUnionType' &&
		!!node.leadingComments &&
		!hasPrettierIgnore(node) &&
		!shouldHugUnionType(node) &&
		!isMultipleTupleTypeElement(path)
	);
}

/**
 * Prettier's `isMultipleTupleTypeElement`: a member of a tuple type with more
 * than one member.
 * @param {AstPath} path - The path to the type
 * @returns {boolean}
 */
function isMultipleTupleTypeElement(path) {
	const { key, parent } = path;
	return key === 'elementTypes' && parent?.type === 'TSTupleType' && parent.elementTypes.length > 1;
}

/**
 * Prettier's `shouldIndentUnionType`: whether a broken union moves to its own
 * indented line. In a type assertion, a tuple, a conditional type's branch, or
 * type arguments, it breaks in place.
 * @param {AstPath} path - The path to the union
 * @returns {boolean}
 */
function shouldIndentUnionType(path) {
	const { key, parent } = path;
	return !(
		(key === 'typeAnnotation' && parent?.type === 'TSTypeAssertion') ||
		(key === 'elementTypes' && parent?.type === 'TSTupleType') ||
		((key === 'trueType' || key === 'falseType') && parent?.type === 'TSConditionalType') ||
		(key === 'params' && parent?.type === 'TSTypeParameterInstantiation')
	);
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
	parts.push(path.call(print, 'id'));
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
				if (shouldAddBlankLine(node.members[i], node.members[i + 1], options)) {
					membersWithCommas.push(hardline);
				}
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

	// Print the key (id), with its comments
	parts.push(...printKey(node, path, options, print));

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
	// element, so a trailing comma (`<T,>`) is syntactically meaningful there. Like
	// Prettier's `shouldForceTrailingComma`, it prints whatever the `trailingComma`
	// option: always when it was written, and otherwise when the list breaks. A
	// constraint makes the list unambiguous, so its comma follows the option.
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());
	if (parent?.type === 'ArrowFunctionExpression' && node.params.length === 1) {
		const hasConstraint = !!(/** @type {AST.TSTypeParameter} */ (node.params[0]).constraint);
		const comma = hasConstraint
			? ifBreak(shouldPrintComma(options) ? ',' : '')
			: node.extra?.trailingComma !== undefined
				? ','
				: ifBreak(',');
		return group(['<', indent([softline, paramList[0]]), comma, softline, '>']);
	}

	return group([
		'<',
		indent([softline, join([',', line], paramList), ifBreak(shouldPrintComma(options) ? ',' : '')]),
		softline,
		'>',
	]);
}

/**
 * Print a type parameter's name, which the parser keeps as a string, with
 * the comments that dangle on the type parameter around it (Prettier's
 * parsers keep the name as a node, which takes them). The ones before the
 * name lead it, and the ones after it trail it on its line, even one written
 * on a line of its own (see the parser's `takeTypeParameterNameComments`).
 * @param {AST.TSTypeParameter} node - The type parameter
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc[]}
 */
function printTypeParameterName(node, options) {
	const text = /** @type {string} */ (options.originalText);
	const comments = /** @type {AST.NodeWithMaybeComments} */ (node).innerComments ?? [];
	// The name follows the modifiers, which are keywords
	let nameStart = skipWhitespaceAndComments(
		text,
		options.locStart(/** @type {AST.NodeWithLocation} */ (node)),
	);
	for (const modifier of [node.const, node.in, node.out]) {
		if (modifier) {
			while (/[\w$]/.test(text[nameStart] ?? '')) {
				nameStart++;
			}
			nameStart = skipWhitespaceAndComments(text, nameStart);
		}
	}
	/** @param {AST.Comment} comment */
	const isBeforeName = (comment) => /** @type {AST.NodeWithLocation} */ (comment).end <= nameStart;
	return [
		...printLeadingComments(node, comments.filter(isBeforeName), options),
		node.name,
		...comments
			.filter((comment) => !isBeforeName(comment))
			.map((comment) => {
				const printed = printComment(comment, text);
				return comment.type === 'Line' ? [lineSuffix([' ', printed]), breakParent] : [' ', printed];
			}),
	];
}

/**
 * Print a single TypeScript type parameter, like Prettier's
 * `printTypeParameter`. A constraint or default that doesn't fit after
 * `extends` or `=` moves to the next line, indented, before it breaks inside.
 * @param {AST.TSTypeParameter} node - The type parameter node
 * @param {AstPath<AST.TSTypeParameter>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
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
	parts.push(...printTypeParameterName(node, options));

	if (node.constraint) {
		const groupId = Symbol('constraint');
		parts.push(
			' extends',
			group(indent(line), { id: groupId }),
			lineSuffixBoundary,
			indentIfBreak(path.call(print, 'constraint'), { groupId }),
		);
	}

	if (node.default) {
		const groupId = Symbol('default');
		parts.push(
			' =',
			group(indent(line), { id: groupId }),
			lineSuffixBoundary,
			indentIfBreak(path.call(print, 'default'), { groupId }),
		);
	}

	return group(parts);
}

/**
 * Whether a type can stay against the brackets around it. Mirrors Prettier's
 * `shouldHugType`.
 * @param {AST.Node} node - The type node
 * @returns {boolean}
 */
function shouldHugType(node) {
	if (isSimpleType(node) || isObjectType(node)) {
		return true;
	}
	if (node.type === 'TSUnionType') {
		return shouldHugUnionType(/** @type {AST.TSUnionType} */ (node));
	}
	return false;
}

/**
 * Print TypeScript type arguments (`<string, number>`) like Prettier's
 * `printTypeParameters`. A lone argument that hugs (a keyword type, a type
 * name without type arguments, an object type) stays inline with no group, so
 * the brackets never break around it. Other lists break one argument per line,
 * without a trailing comma.
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
	const text = /** @type {string} */ (options.originalText);

	// The type of an arrow function variable (`const f: Fn<A> = () => {}`)
	// breaks its arguments like any other list, unless it's one object type.
	const grandparent = /** @type {AST.Node | null} */ (path.getParentNode(1));
	const identifier = /** @type {AST.Node | null} */ (path.getParentNode(2));
	const declarator = /** @type {AST.Node | null} */ (path.getParentNode(3));
	const isArrowFunctionVariable =
		!(node.params.length === 1 && isObjectType(node.params[0])) &&
		grandparent?.type === 'TSTypeAnnotation' &&
		identifier?.type === 'Identifier' &&
		identifier.typeAnnotation === grandparent &&
		declarator?.type === 'VariableDeclarator' &&
		declarator.init?.type === 'ArrowFunctionExpression';

	const shouldInline =
		!isArrowFunctionVariable &&
		node.params.length === 1 &&
		shouldHugType(node.params[0]) &&
		!node.params.some((param) => {
			const { leadingComments = [], trailingComments = [] } =
				/** @type {AST.NodeWithMaybeComments} */ (param);
			const comments = [...leadingComments, ...trailingComments];
			return (
				comments.length > 0 &&
				(comments.some((comment) => comment.type === 'Line') ||
					hasNewline(
						text,
						/** @type {AST.CommentWithLocation} */ (comments[comments.length - 1]).end,
					))
			);
		});

	if (shouldInline) {
		return ['<', join(', ', paramList), '>'];
	}

	return group(['<', indent([softline, join([',', line], paramList)]), softline, '>']);
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
	const discriminant = path.call(print, 'discriminant');

	/** @type {Doc[]} */
	const parts = [];

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

	// Like Prettier, the comments of a switch with no cases go inside its braces
	const comments = /** @type {AST.NodeWithMaybeComments} */ (node).innerComments ?? [];
	const bodyDoc =
		cases.length > 0
			? [indent([hardline, join(hardline, cases)]), hardline]
			: comments.length > 0
				? [
						indent([
							hardline,
							join(
								hardline,
								comments.map((comment) => printComment(comment, options.originalText)),
							),
						]),
						hardline,
					]
				: hardline;

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
	const discriminant = path.call(print, 'discriminant');

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

	return [discriminantDoc, ' {', bodyDoc, '}'];
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
	const printedIndexes = getPrintedStatementIndexes(consequents);

	const bodyDoc =
		printedIndexes.length > 0
			? [
					indent([
						hardline,
						printSwitchCaseStatements(consequents, printedIndexes, options, (i) =>
							path.call((casePath) => casePath.call(print, 'consequent', i), 'cases', index),
						),
					]),
					hardline,
				]
			: hardline;

	// The case doesn't go through `print`, so it prints its own comments
	return [
		...printLeadingComments(node, node.leadingComments ?? [], options),
		header,
		' {',
		bodyDoc,
		'}',
		...printSwitchCaseTrailingComments(node, options),
	];
}

/**
 * Print the statements of a switch case on their own lines, with a blank line
 * where the source has one, like a block's statements
 * @param {AST.Node[]} consequents - The case's statements
 * @param {number[]} printedIndexes - The indexes of the ones that print
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {(index: number) => Doc} printAt - Prints the statement at an index
 * @returns {Doc[]}
 */
function printSwitchCaseStatements(consequents, printedIndexes, options, printAt) {
	/** @type {Doc[]} */
	const statements = [];
	printedIndexes.forEach((index, n) => {
		if (n > 0) {
			statements.push(hardline);
			if (shouldAddBlankLine(consequents[printedIndexes[n - 1]], consequents[index], options)) {
				statements.push(hardline);
			}
		}
		statements.push(printAt(index));
	});
	return statements;
}

/**
 * Print a switch case's trailing comments like Prettier's
 * `printTrailingComment`: a comment on the case's last line stays there, and
 * one on a later line keeps its own line.
 * @param {AST.SwitchCase} node - The switch case
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc[]}
 */
function printSwitchCaseTrailingComments(node, options) {
	const text = /** @type {string} */ (options.originalText);
	/** @type {Doc[]} */
	const parts = [];
	/** @type {{ isBlock: boolean, hasLineSuffix: boolean } | null} */
	let previous = null;
	for (const comment of node.trailingComments ?? []) {
		const start = /** @type {AST.NodeWithLocation} */ (comment).start;
		const isBlock = comment.type === 'Block';
		const commentDoc = printComment(comment, text);
		if (
			(previous?.hasLineSuffix && !previous.isBlock) ||
			hasNewline(text, start, { backwards: true })
		) {
			// Keep one blank line when the line before the comment is empty, not a
			// line holding a `;` that isn't printed
			parts.push(
				lineSuffix([hardline, isPreviousLineEmpty(text, start) ? hardline : '', commentDoc]),
			);
			previous = { isBlock, hasLineSuffix: true };
		} else if (!isBlock || previous?.hasLineSuffix) {
			parts.push(lineSuffix([' ', commentDoc]), breakParent);
			previous = { isBlock, hasLineSuffix: true };
		} else {
			parts.push(' ', commentDoc);
			previous = { isBlock, hasLineSuffix: false };
		}
	}
	return parts;
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
	const text = /** @type {string} */ (options.originalText);
	const consequents = node.consequent || [];
	const printedIndexes = getPrintedStatementIndexes(consequents);
	const first = printedIndexes.length > 0 ? consequents[printedIndexes[0]] : null;
	const singleBlock = printedIndexes.length === 1 && first?.type === 'BlockStatement';

	// The comments after `case x:` on its line. The parser gives them to the
	// first statement. Prettier makes them trailing comments of the test, or
	// dangling comments of a `default` case, so they stay on that line, except
	// that a line comment moves into a lone block.
	const headerComments = first ? takeSwitchCaseHeaderComments(first, text) : [];
	/** @type {Doc[]} */
	const headerBlockComments = [];
	/** @type {Doc} */
	let headerLineComment = '';
	for (const comment of headerComments) {
		if (comment.type === 'Block') {
			headerBlockComments.push([' ', printComment(comment, text)]);
		} else if (singleBlock) {
			moveIntoBlock(/** @type {AST.BlockStatement} */ (first), comment);
		} else {
			headerLineComment = [lineSuffix([' ', printComment(comment)]), breakParent];
		}
	}
	const header = node.test
		? ['case ', path.call(print, 'test'), ...headerBlockComments, ':', headerLineComment]
		: ['default:', ...headerBlockComments, headerLineComment];

	/** @type {Doc[]} */
	const parts = [header];
	if (singleBlock) {
		parts.push(' ', path.call(print, 'consequent', printedIndexes[0]));
	} else if (printedIndexes.length > 0) {
		parts.push(
			indent([
				hardline,
				printSwitchCaseStatements(consequents, printedIndexes, options, (index) =>
					path.call(print, 'consequent', index),
				),
			]),
		);
	}

	// The case prints its trailing comments itself, not `finishTsrxNode`
	parts.push(...printSwitchCaseTrailingComments(node, options));
	delete node.trailingComments;

	return parts;
}

/**
 * Take a switch case's header comments off its first statement: the comments
 * that start on the line of `case x:` or `default:`. Like Prettier's
 * `breakTies`, the ones that only spaces separate from the statement stay
 * with it (`case 1: /* c *\/ a();`).
 * @param {AST.Node} first - The case's first printed statement
 * @param {string} text - The original source
 * @returns {AST.Comment[]}
 */
function takeSwitchCaseHeaderComments(first, text) {
	const comments = /** @type {AST.NodeWithMaybeComments} */ (first).leadingComments;
	if (!comments) {
		return [];
	}
	let count = 0;
	while (
		count < comments.length &&
		!hasNewline(text, /** @type {AST.NodeWithLocation} */ (comments[count]).start, {
			backwards: true,
		})
	) {
		count++;
	}
	let gapEnd = /** @type {AST.NodeWithLocation} */ (comments[count] ?? first).start;
	while (
		count > 0 &&
		/^[^\S\n]*$/.test(
			text.slice(/** @type {AST.NodeWithLocation} */ (comments[count - 1]).end, gapEnd),
		)
	) {
		count--;
		gapEnd = /** @type {AST.NodeWithLocation} */ (comments[count]).start;
	}
	if (count === 0) {
		return [];
	}
	const taken = comments.splice(0, count);
	if (comments.length === 0) {
		delete (/** @type {AST.NodeWithMaybeComments} */ (first).leadingComments);
	}
	return taken;
}

/**
 * Make a comment the first comment inside a block, as Prettier's
 * `addBlockStatementFirstComment` does.
 * @param {AST.BlockStatement} block - The block
 * @param {AST.Comment} comment - The comment
 */
function moveIntoBlock(block, comment) {
	const firstStatement = block.body.find((statement) => statement.type !== 'EmptyStatement');
	const holder = /** @type {AST.NodeWithMaybeComments} */ (firstStatement ?? block);
	const key = firstStatement ? 'leadingComments' : 'innerComments';
	holder[key] = [comment, ...(holder[key] ?? [])];
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
			(pastColon ? afterColon : beforeColon).push(printComment(comment, text));
		}
	}

	// A moved `prettier-ignore` is the last comment before the label, so it
	// keeps the whole statement's source.
	if (isPrettierIgnoreComment(moved.at(-1))) {
		return getIgnoredSource(node, path, options).text;
	}

	const body = path.call((bodyPath) => print(bodyPath, { suppressLeadingComments: true }), 'body');
	/** @type {Doc[]} */
	const parts = [...printLeadingComments(node.body, moved, options), path.call(print, 'label')];
	for (const commentDoc of beforeColon) {
		parts.push(' ', commentDoc);
	}
	parts.push(':');
	if (afterColon.length > 0) {
		parts.push(' ', join(' ', afterColon));
	}
	// Like Prettier, an empty body's `;` touches the colon: `label:;`
	parts.push(node.body.type === 'EmptyStatement' && afterColon.length === 0 ? '' : ' ', body);
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
 * Print a conditional expression or a conditional type like Prettier's
 * ternary printer (`printTernaryOld`, without `experimentalTernaries`). A
 * chain of nested conditionals prints in one group, so it stays on one line
 * when it fits and breaks at every `?` and `:` when it doesn't. A nested
 * conditional in the true branch gets parentheses only on one line, and one
 * in the test (a conditional type's check or extends type) breaks inside the
 * parentheses it needs there. A conditional expression chain with an element
 * or another template value in it prints in Prettier's JSX mode instead.
 * @param {AstPath<AST.ConditionalExpression | AST.TSConditionalType>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc}
 */
function printConditionalExpression(path, options, print) {
	const node = path.node;
	// The keys differ between the two node types
	/** @type {AstPath} */
	const nodePath = path;
	const isConditionalExpression = node.type === 'ConditionalExpression';
	const consequentKey = isConditionalExpression ? 'consequent' : 'trueType';
	const alternateKey = isConditionalExpression ? 'alternate' : 'falseType';
	const testKeys = isConditionalExpression ? ['test'] : ['checkType', 'extendsType'];
	/**
	 * @param {AST.Node} ancestor
	 * @param {AST.Node} child
	 * @returns {boolean}
	 */
	const isTestOf = (ancestor, child) =>
		testKeys.some((key) => /** @type {Record<string, unknown>} */ (ancestor)[key] === child);
	const parent = /** @type {AST.Node} */ (path.getParentNode());
	const isParentTest = parent.type === node.type && isTestOf(parent, node);
	let forceNoIndent = parent.type === node.type && !isParentTest;

	// The outermost conditional of the chain groups it
	/** @type {AST.Node} */
	let child = node;
	/** @type {AST.Node | null} */
	let firstNonConditionalParent = parent;
	for (let level = 0; ; level++) {
		const ancestor = /** @type {AST.Node | null} */ (path.getParentNode(level));
		if (!ancestor || ancestor.type !== node.type || isTestOf(ancestor, child)) {
			firstNonConditionalParent = ancestor ?? parent;
			break;
		}
		child = ancestor;
	}

	const consequentNode = /** @type {AST.Node} */ (nodePath.node[consequentKey]);
	const alternateNode = /** @type {AST.Node} */ (nodePath.node[alternateKey]);
	const isParentAlternate = parent.type === node.type && nodePath.parent[alternateKey] === node;
	/** @type {Doc} */
	let parts;
	// JSX mode: a chain with an element or another template value anywhere
	// in it doesn't indent, and each branch breaks inside parentheses of its
	// own, which are analogous to an `if` statement's braces
	const jsxMode =
		isConditionalExpression &&
		(isTemplateExpression(/** @type {AST.ConditionalExpression} */ (node).test) ||
			isTemplateExpression(consequentNode) ||
			isTemplateExpression(alternateNode) ||
			conditionalChainContainsTemplate(/** @type {AST.ConditionalExpression} */ (child)));
	if (jsxMode) {
		forceNoIndent = true;
		/** @param {Doc} doc */
		const wrap = (doc) => [ifBreak('('), indent([softline, doc]), softline, ifBreak(')')];
		// Except for `null`, `undefined`, and a conditional alternate
		parts = [
			' ? ',
			isNilLiteral(consequentNode)
				? nodePath.call(print, consequentKey)
				: wrap(nodePath.call(print, consequentKey)),
			' : ',
			alternateNode.type === node.type || isNilLiteral(alternateNode)
				? nodePath.call(print, alternateKey)
				: wrap(nodePath.call(print, alternateKey)),
		];
	} else {
		/**
		 * Align a branch with the first character after `? ` or `: `
		 * @param {string} key
		 */
		const printBranch = (key) => {
			const printed = nodePath.call(print, key);
			return options.useTabs ? indent(printed) : align(2, printed);
		};
		const consequentIsConditional = consequentNode.type === node.type;
		const branches = [
			line,
			'? ',
			consequentIsConditional ? ifBreak('', '(') : '',
			printBranch(consequentKey),
			consequentIsConditional ? ifBreak('', ')') : '',
			line,
			': ',
			printBranch(alternateKey),
		];
		parts = branches;
		if (parent.type === node.type && !isParentAlternate && !isParentTest) {
			// A conditional consequent indents its branches past its parent's
			parts = options.useTabs
				? dedent(indent(branches))
				: align(Math.max(0, (options.tabWidth ?? 2) - 2), branches);
		}
	}

	// Break before the closing parenthesis to keep the chain right after it:
	//   (a
	//     ? b
	//     : c
	//   ).call()
	const breakClosingParen =
		!jsxMode && isConditionalExpression && parent.type === 'MemberExpression' && !parent.computed;
	const shouldExtraIndent =
		isConditionalExpression &&
		shouldExtraIndentForConditionalExpression(
			/** @type {AstPath<AST.ConditionalExpression>} */ (path),
		);

	/** @type {Doc} */
	const testDoc = isConditionalExpression
		? nodePath.call(print, 'test')
		: [nodePath.call(print, 'checkType'), ' extends ', nodePath.call(print, 'extendsType')];
	/** @type {Doc[]} */
	const contents = [
		// A multiline test in an alternate lines up with the branches
		isParentAlternate ? align(2, testDoc) : testDoc,
		forceNoIndent ? parts : indent(parts),
		breakClosingParen && !shouldExtraIndent ? softline : '',
	];
	const result = parent === firstNonConditionalParent ? group(contents) : contents;

	return isParentTest || shouldExtraIndent ? group([indent([softline, result]), softline]) : result;
}

/**
 * Whether a chain of nested conditionals has an element or another template
 * value as a test or branch at any depth (Prettier's
 * `conditionalExpressionChainContainsJsx`), which prints the whole chain in
 * JSX mode.
 * @param {AST.ConditionalExpression} node - The outermost conditional of the chain
 * @returns {boolean}
 */
function conditionalChainContainsTemplate(node) {
	const conditionals = [node];
	for (let index = 0; index < conditionals.length; index++) {
		const conditional = conditionals[index];
		for (const child of [conditional.test, conditional.consequent, conditional.alternate]) {
			if (isTemplateExpression(child)) {
				return true;
			}
			if (child.type === 'ConditionalExpression') {
				conditionals.push(child);
			}
		}
	}
	return false;
}

/**
 * `null` or `undefined`, the branches a conditional in JSX mode doesn't put
 * in parentheses.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function isNilLiteral(node) {
	return (
		(node.type === 'Literal' && node.value === null) ||
		(node.type === 'Identifier' && node.name === 'undefined')
	);
}

/**
 * Whether a conditional at the head of a member chain gets an extra indent
 * (Prettier's `shouldExtraIndentForConditionalExpression`): the chain is an
 * assigned value, a `return`, `throw`, `yield` or `await` argument, or the
 * operand of a unary operator.
 * @param {AstPath<AST.ConditionalExpression>} path
 * @returns {boolean}
 */
function shouldExtraIndentForConditionalExpression(path) {
	const node = path.node;
	/** @type {AST.Node} */
	let child = node;
	/** @type {AST.Node | null} */
	let parent = null;
	for (let level = 0; !parent; level++) {
		const ancestor = /** @type {AST.Node | null} */ (path.getParentNode(level));
		if (!ancestor) {
			return false;
		}
		if (
			((ancestor.type === 'ChainExpression' || ancestor.type === 'TSNonNullExpression') &&
				ancestor.expression === child) ||
			(ancestor.type === 'CallExpression' && ancestor.callee === child) ||
			(ancestor.type === 'MemberExpression' && ancestor.object === child)
		) {
			child = ancestor;
			continue;
		}
		// Reached the root of the chain
		if (
			(ancestor.type === 'NewExpression' && ancestor.callee === child) ||
			(isCastExpression(ancestor) &&
				/** @type {AST.TSAsExpression} */ (ancestor).expression === child)
		) {
			parent = /** @type {AST.Node | null} */ (path.getParentNode(level + 1));
			child = ancestor;
			if (!parent) {
				return false;
			}
		} else {
			parent = ancestor;
		}
	}

	// A conditional that is the value itself doesn't get one
	if (child === node) {
		return false;
	}

	const key = CONDITIONAL_CHAIN_ANCESTOR_KEYS[parent.type];
	return Boolean(key) && /** @type {Record<string, unknown>} */ (parent)[key] === child;
}

/** @type {Record<string, string>} */
const CONDITIONAL_CHAIN_ANCESTOR_KEYS = {
	AssignmentExpression: 'right',
	VariableDeclarator: 'init',
	ReturnStatement: 'argument',
	ThrowStatement: 'argument',
	UnaryExpression: 'argument',
	YieldExpression: 'argument',
	AwaitExpression: 'argument',
};

/**
 * Whether a node is a `return` or `throw` statement.
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function isReturnOrThrowStatement(node) {
	return node?.type === 'ReturnStatement' || node?.type === 'ThrowStatement';
}

/**
 * Whether a node is a call or `new` expression.
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function isCallOrNewExpression(node) {
	return node?.type === 'CallExpression' || node?.type === 'NewExpression';
}

/**
 * Whether a node is a `for (;;)` statement, or TSRX's `@for (;;)`.
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function isForStatement(node) {
	return (
		node?.type === 'ForStatement' ||
		(node?.type === 'JSXForExpression' &&
			/** @type {{ statementType?: string }} */ (node).statementType === 'ForStatement')
	);
}

/**
 * Statements whose condition prints inside their own parentheses: `if`,
 * `while`, `do … while` and `switch`, and TSRX's `@if` and `@switch`.
 */
const PARENTHESIZED_CONDITION_STATEMENTS = new Set([
	'IfStatement',
	'JSXIfExpression',
	'WhileStatement',
	'DoWhileStatement',
	'SwitchStatement',
	'JSXSwitchExpression',
]);

/**
 * Stands in for the parent of an expression inside a JSDoc cast's
 * parentheses, which Prettier's parsers keep as a `ParenthesizedExpression`.
 * @type {AST.Node}
 */
const PARENTHESIZED_EXPRESSION = /** @type {AST.Node} */ (
	/** @type {unknown} */ ({ type: 'ParenthesizedExpression' })
);

/**
 * Whether a call is `Boolean(x)` (Prettier's `isBooleanTypeCoercion`).
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
function isBooleanTypeCoercion(node) {
	return (
		node?.type === 'CallExpression' &&
		!node.optional &&
		node.arguments.length === 1 &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'Boolean'
	);
}

/**
 * Print a binary or logical expression like Prettier's
 * `printBinaryishExpression`. Operators of one precedence level print in one
 * group (see {@link printBinaryishExpressions}), and the parent decides how
 * the operands after the first are indented: not at all in a statement's
 * parenthesized condition, an arrow body, a `return` or `throw` argument, a
 * `Boolean(…)` argument, or an assigned value, and with a break after the
 * opening parenthesis under a unary operator, as a member object, or as a
 * callee.
 * @param {AstPath<AST.BinaryExpression | AST.LogicalExpression>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc}
 */
function printBinaryishExpression(path, options, print) {
	const node = path.node;
	// Inside a JSDoc cast's parentheses, the parentheses are the parent, as in
	// Prettier, where they are a node of their own
	const parent = getTypeCastParens(path, options)
		? PARENTHESIZED_EXPRESSION
		: /** @type {AST.Node} */ (path.getParentNode());
	const grandparent = /** @type {AST.Node | null} */ (path.getParentNode(1));
	const key = path.key;
	const isInsideParenthesis = key !== 'body' && PARENTHESIZED_CONDITION_STATEMENTS.has(parent.type);

	const parts = printBinaryishExpressions(path, options, print, false, isInsideParenthesis);

	// The statement's parentheses group the condition, so every operator of the
	// condition breaks with them:
	//   if (
	//     aaa &&
	//     bbb
	//   ) {
	if (isInsideParenthesis) {
		return parts;
	}

	// Break inside the parentheses under a unary operator, as a member object,
	// or as a callee:
	//   (
	//     aaa &&
	//     bbb
	//   ).call()
	if (
		(key === 'callee' && isCallOrNewExpression(parent)) ||
		(parent.type === 'UnaryExpression' && !hasComment(node)) ||
		(parent.type === 'MemberExpression' && !parent.computed)
	) {
		return group([indent([softline, ...parts]), softline]);
	}

	// Don't indent the operands after the first where the first one already
	// starts an indented line
	const shouldNotIndent =
		isReturnOrThrowStatement(parent) ||
		(parent.type === 'JSXExpressionContainer' && grandparent?.type === 'JSXAttribute') ||
		(key === 'body' && parent.type === 'ArrowFunctionExpression') ||
		(key !== 'body' && isForStatement(parent)) ||
		(parent.type === 'ConditionalExpression' &&
			!isReturnOrThrowStatement(grandparent) &&
			!isCallOrNewExpression(grandparent)) ||
		parent.type === 'TemplateLiteral' ||
		(key === 'argument' && parent.type === 'UnaryExpression') ||
		(key === 'arguments' && isBooleanTypeCoercion(parent));

	// An assigned value breaks after the `=` or `:` and indents there (see
	// `printAssignment`)
	const shouldIndentIfInlining =
		parent.type === 'AssignmentExpression' ||
		parent.type === 'VariableDeclarator' ||
		parent.type === 'PropertyDefinition' ||
		/** @type {string} */ (parent.type) === 'TSAbstractPropertyDefinition' ||
		(parent.type === 'Property' && !parent.method && parent.kind === 'init');

	const samePrecedenceSubExpression =
		isBinaryish(node.left) && shouldFlatten(node.operator, node.left.operator);

	if (
		shouldNotIndent ||
		(shouldInlineLogicalExpression(node) && !samePrecedenceSubExpression) ||
		(!shouldInlineLogicalExpression(node) && shouldIndentIfInlining)
	) {
		return group(parts);
	}

	if (parts.length === 0) {
		return '';
	}

	// An element on the right prints in its own group, so it can break without
	// breaking the whole chain:
	//   foo && bar && (
	//     <Foo>
	//       <Bar />
	//     </Foo>
	//   )
	const hasJsx = isTemplateExpression(node.right);

	// The leftmost operand, with any comments printed ahead of it, stays out of
	// the indentation
	const firstGroupIndex = parts.findIndex(
		(part) =>
			typeof part !== 'string' &&
			!Array.isArray(part) &&
			/** @type {{ type?: string }} */ (part).type === 'group',
	);
	const headParts = parts.slice(0, firstGroupIndex === -1 ? 1 : firstGroupIndex + 1);
	const rest = parts.slice(headParts.length, hasJsx ? -1 : undefined);
	const groupId = Symbol('logicalChain');
	const chain = group([...headParts, indent(rest)], { id: groupId });

	if (!hasJsx) {
		return chain;
	}

	return group([chain, indentIfBreak(/** @type {Doc} */ (parts.at(-1)), { groupId })]);
}

/**
 * Print the operands and operators of a binary or logical expression as a
 * flat list, like Prettier's `printBinaryishExpressions`. A left operand with
 * an operator of the same precedence (`a && b` in `a && b && c`) is inlined
 * into the same list, so every operator of one precedence level breaks
 * together, instead of the nested operators staying on one line while only
 * the last one breaks.
 * @param {AstPath} path - The path to the expression, or to a flattened operand
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @param {boolean} isNested - Whether the node is a flattened left operand
 * @param {boolean} isInsideParenthesis - Whether the chain is a statement's condition
 * @returns {Doc[]}
 */
function printBinaryishExpressions(path, options, print, isNested, isInsideParenthesis) {
	const node = /** @type {AST.Node} */ (path.node);

	// A unary operand shares its operator with a binary one (`-a + b`)
	if (!isBinaryish(node)) {
		return [group(print(path))];
	}

	/** @type {Doc[]} */
	let parts;
	if (
		shouldFlatten(node.operator, /** @type {{ operator?: string }} */ (node.left).operator ?? '') &&
		path.call((leftPath) => canFlattenOperand(leftPath, options), 'left')
	) {
		parts = path.call(
			(leftPath) => printBinaryishExpressions(leftPath, options, print, true, isInsideParenthesis),
			'left',
		);
	} else {
		parts = [group(path.call(print, 'left'))];
	}

	const shouldInline = shouldInlineLogicalExpression(node);
	const rightNode = node.right.type === 'ChainExpression' ? node.right.expression : node.right;
	const rightDoc = path.call(print, 'right');

	/** @type {Doc} */
	let right;
	if (shouldInline) {
		right = [
			node.operator,
			hasLeadingOwnLineComment(rightNode, rightNode.leadingComments ?? [], options) ||
			hasLeadingOwnLineComment(node.right, node.right.leadingComments ?? [], options)
				? indent([line, rightDoc])
				: [' ', rightDoc],
		];
	} else {
		right = [node.operator, line, rightDoc];
	}

	// A lone operator gets its own group, so a short right operand like `-1`
	// doesn't end up alone on the next line
	const parent =
		!isNested && getTypeCastParens(path, options)
			? PARENTHESIZED_EXPRESSION
			: /** @type {AST.Node} */ (path.getParentNode());
	const shouldBreak = Boolean(
		node.left.trailingComments?.some((comment) => comment.type === 'Line'),
	);
	const shouldGroup =
		shouldBreak ||
		(!(isInsideParenthesis && node.type === 'LogicalExpression') &&
			parent.type !== node.type &&
			node.left.type !== node.type &&
			node.right.type !== node.type);
	if (shouldGroup) {
		right = group(right, { shouldBreak });
	}

	parts.push(' ', right);

	// A flattened operand isn't printed through `print`, so print its comments
	if (isNested && hasComment(node)) {
		const printed = finishTsrxNode(
			node,
			printLeadingComments(node, node.leadingComments ?? [], options),
			parts,
			options,
		);
		return Array.isArray(printed)
			? printed.flatMap((part) => (part === parts ? parts : [part]))
			: [printed];
	}

	return parts;
}

/**
 * Whether a binary or logical operand can print inline in its parent's operand
 * list. One that prints verbatim or inside a JSDoc cast's parentheses keeps
 * its own printer.
 * @param {AstPath} path - The path to the operand
 * @param {TsrxFormatOptions} options
 * @returns {boolean}
 */
function canFlattenOperand(path, options) {
	const node = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (path.node);
	return !isBinaryish(node) || (!hasPrettierIgnore(node) && !getTypeCastParens(path, options));
}

/**
 * Whether the node at `path` is a sequence expression that prints its own
 * parentheses. Like Prettier, sequences keep them everywhere except in a
 * `for` head, unless the parent prints them (`return` with a comment).
 * @param {AstPath} path - The path to the node
 * @param {PrintArgs} [args] - The node's print arguments
 * @returns {boolean}
 */
function sequencePrintsOwnParens(path, args) {
	return (
		path.node.type === 'SequenceExpression' &&
		!isForStatement(/** @type {AST.Node | null} */ (path.getParentNode())) &&
		!args?.suppressOwnParens
	);
}

/**
 * Print a sequence expression like Prettier's `printSequenceExpression`. As a
 * statement or in a `for` head, the expressions after the first indent when
 * they break. As an arrow body or a `return` or `throw` argument, the
 * expressions move inside the parentheses onto their own lines. Elsewhere,
 * they break after each comma.
 * @param {AST.SequenceExpression} node - The sequence expression node
 * @param {AstPath<AST.SequenceExpression>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {PrintArgs} [args] - Additional context arguments
 * @returns {Doc}
 */
function printSequenceExpression(node, path, options, print, args) {
	const parent = /** @type {AST.Node} */ (path.getParentNode());
	const printsOwnParens = sequencePrintsOwnParens(path, args);

	/** @type {Doc} */
	let printed;
	if (parent.type === 'ExpressionStatement' || isForStatement(parent)) {
		/** @type {Doc[]} */
		const parts = [];
		path.each((expressionPath, index) => {
			const expression = print(expressionPath);
			parts.push(index === 0 ? expression : [',', indent([line, expression])]);
		}, 'expressions');
		printed = group(parts);
	} else {
		const parts = join([',', line], path.map(print, 'expressions'));
		const key = path.key;
		const shouldIndent =
			(key === 'argument' && isReturnOrThrowStatement(parent) && printsOwnParens) ||
			(key === 'body' && parent.type === 'ArrowFunctionExpression');
		printed = shouldIndent
			? group(ifBreak([indent([softline, parts]), softline], parts))
			: group(parts);
	}

	return printsOwnParens ? ['(', printed, ')'] : printed;
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
 * Whether an empty block prints as `{}`, as Prettier's `printBlock` decides: a
 * function body, a `for (;;)`, `while` or `do` body, a `catch` block without
 * `finally`, a namespace body, or a static block. Every other empty block
 * prints its braces on two lines, and so does every template directive body.
 * @param {AST.Node} node - The empty block
 * @param {AstPath} path - Its path
 * @returns {boolean}
 */
function printsEmptyBlockOnOneLine(node, path) {
	if (node.type === 'StaticBlock') {
		return true;
	}
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());
	switch (parent?.type) {
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
		case 'FunctionDeclaration':
		case 'ForStatement':
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'TSModuleDeclaration':
			return true;
		case 'CatchClause': {
			// `@catch` belongs to a template `@try`
			const grandparent = /** @type {AST.Node | null} */ (path.getParentNode(1));
			return grandparent?.type === 'TryStatement' && !grandparent.finalizer;
		}
		default:
			return false;
	}
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
 * Print an array literal, array pattern, or tuple type like Prettier's
 * `printArray`. The array breaks only when it doesn't fit, or when every
 * element is an object (or every element an array) with more than one entry.
 * A blank line between elements is kept only in a broken array, and
 * number-only array literals pack as many elements per line as fit.
 * @param {AST.ArrayExpression | AST.ArrayPattern | AST.TSTupleType} node - The node
 * @param {AstPath<AST.ArrayExpression | AST.ArrayPattern | AST.TSTupleType>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printArray(node, path, options, print) {
	/** @type {Doc[]} */
	const parts = [];
	const elementsProperty = node.type === 'TSTupleType' ? 'elementTypes' : 'elements';
	/** @type {Array<AST.Node | null>} */
	const elements =
		/** @type {Record<string, Array<AST.Node | null> | undefined>} */ (
			/** @type {unknown} */ (node)
		)[elementsProperty] ?? [];

	if (elements.length === 0) {
		parts.push(
			group([
				'[',
				printDanglingCommentsInList(
					/** @type {AST.NodeWithMaybeComments} */ (node).innerComments,
					options.originalText,
				),
				']',
			]),
		);
	} else {
		const lastElement = elements[elements.length - 1];
		const canHaveTrailingComma = lastElement?.type !== 'RestElement';

		// A trailing hole (`[1, ,]`) is an array slot, and its comma is what
		// creates it: dropping that comma shortens the array. It prints in
		// every layout and regardless of `trailingComma`.
		const needsForcedTrailingComma = lastElement === null;
		const groupId = Symbol('array');

		const shouldBreak =
			elements.length > 1 &&
			elements.every((element, index) => {
				if (
					!element ||
					(element.type !== 'ArrayExpression' && element.type !== 'ObjectExpression')
				) {
					return false;
				}

				const nextElement = elements[index + 1];
				if (nextElement && nextElement.type !== element.type) {
					return false;
				}

				const items = element.type === 'ArrayExpression' ? element.elements : element.properties;
				return items.length > 1;
			});

		const shouldUseConciseFormatting =
			node.type === 'ArrayExpression' && isConciselyPrintedArray(node, options);

		/** @type {Doc} */
		const trailingComma = !canHaveTrailingComma
			? ''
			: needsForcedTrailingComma
				? ','
				: !shouldPrintComma(options)
					? ''
					: shouldUseConciseFormatting
						? ifBreak(',', '', { groupId })
						: ifBreak(',');

		parts.push(
			group(
				[
					'[',
					indent([
						softline,
						shouldUseConciseFormatting
							? printArrayElementsConcisely(
									/** @type {AstPath<AST.ArrayExpression>} */ (path),
									options,
									print,
									trailingComma,
								)
							: [printArrayElements(path, options, print, elementsProperty), trailingComma],
					]),
					softline,
					']',
				],
				{ shouldBreak, id: groupId },
			),
		);
	}

	if (node.type === 'ArrayPattern') {
		if (/** @type {{ optional?: boolean }} */ (node).optional) {
			parts.push('?');
		}
		parts.push(...printTypeAnnotationProperty(path, print));
	}

	return parts;
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
 * @param {AstPath<AST.ArrayExpression | AST.ArrayPattern | AST.TSTupleType>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @param {'elements' | 'elementTypes'} elementsProperty - The key of the elements
 * @returns {Doc[]}
 */
function printArrayElements(path, options, print, elementsProperty) {
	/** @type {Array<AST.Node | null>} */
	const elements = /** @type {Record<string, Array<AST.Node | null>>} */ (
		/** @type {unknown} */ (path.node)
	)[elementsProperty];
	/** @type {Doc[]} */
	const parts = [];

	path.each((elementPath, index) => {
		const element = elements[index];
		parts.push(element ? group(print(elementPath)) : '');

		if (index < elements.length - 1) {
			parts.push([',', line, element && isLineAfterElementEmpty(element, options) ? softline : '']);
		}
	}, elementsProperty);

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
					: hasLeadingOwnLineComment(elements[index], commentsAhead, options)
						? hardline
						: line,
			);
		}

		parts.push([print(elementPath), index === elements.length - 1 ? trailingComma : ',']);
	}, 'elements');

	return fill(parts);
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

	// Prettier's parentheses node for a JSDoc cast prints its content without
	// the layout
	const rightDoc = path.call(
		(rightPath) =>
			print(rightPath, getTypeCastParens(rightPath, options) ? {} : { assignmentLayout: layout }),
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

	// Prettier keeps the parentheses of a JSDoc cast as a node of their own, so
	// a cast value matches none of the checks on the value's type below
	const isCast = path.call(
		(rightPath) => getTypeCastParens(rightPath, options) !== null,
		rightPropertyName,
	);

	// Short chains (`a = b = c` and `const a = b = c`) are not formatted as chains
	const isTail = isCast || !isAssignment(rightNode);
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
		return !isCast &&
			rightNode.type === 'ArrowFunctionExpression' &&
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
		(!isCast &&
			rightNode.type === 'CallExpression' &&
			rightNode.callee.type === 'Identifier' &&
			rightNode.callee.name === 'require')
	) {
		return 'never-break-after-operator';
	}

	const canBreakLeftDoc = canBreak(leftDoc);
	if (
		isComplexDestructuring(node) ||
		hasComplexTypeAnnotation(node) ||
		(isArrowFunctionVariableDeclarator(node) && !isCast && canBreakLeftDoc)
	) {
		return 'break-lhs';
	}

	// Wrapping an object property with a very short key rarely helps
	const hasShortKey = isObjectPropertyWithShortKey(node, leftDoc, options);
	if (
		!isCast &&
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
			(!isCast &&
				(rightNode.type === 'TemplateLiteral' ||
					rightNode.type === 'TaggedTemplateExpression' ||
					(rightNode.type === 'Literal' && typeof rightNode.value === 'boolean') ||
					isNumericLiteral(rightNode) ||
					rightNode.type === 'ClassExpression')))
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
		const printed = /** @type {{ label?: { memberChain?: boolean } }} */ (
			printCallExpression(path, options, print)
		);
		if (printed.label?.memberChain) {
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
 * ahead of itself ends its line. An element prints its comments inside its
 * parentheses (see {@link printTemplateInParens}), unless they go
 * ahead of a type cast's parentheses, which Prettier's `babel` parser keeps as
 * a `ParenthesizedExpression`.
 * @param {AST.Node} node
 * @param {AST.Comment[]} comments - The comments the node prints ahead of itself
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {boolean} [isTypeCast] - Whether the comments go ahead of the
 *   node's type-cast parentheses
 * @returns {boolean}
 */
function hasLeadingOwnLineComment(node, comments, options, isTypeCast = false) {
	if (isTemplateExpression(node) && !isTypeCast) {
		return hasPrettierIgnore(node);
	}
	const text = /** @type {string} */ (options.originalText);
	return comments.some((comment) =>
		hasNewline(text, /** @type {AST.NodeWithLocation} */ (comment).end),
	);
}

/**
 * Whether a comment the node prints ahead of itself is a block comment over
 * several lines, which ends a `return` like a line break. An element prints
 * its comments inside its parentheses (see {@link hasLeadingOwnLineComment}).
 * @param {AST.Node} node
 * @param {AST.Comment[]} comments - The comments the node prints ahead of itself
 * @param {boolean} isTypeCast - Whether the comments go ahead of the node's
 *   type-cast parentheses
 * @returns {boolean}
 */
function hasLeadingMultilineComment(node, comments, isTypeCast) {
	if (isTemplateExpression(node) && !isTypeCast) {
		return false;
	}
	return comments.some(
		(comment) => comment.type === 'Block' && /[\n\r\u2028\u2029]/.test(comment.value),
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
	return key !== null && util.getStringWidth(key) < (options.tabWidth ?? 2) + 3;
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

	// Getters, setters, and method shorthand (`increment() {}`) print like
	// class methods
	if (
		(node.kind === 'get' || node.kind === 'set' || node.method) &&
		node.value.type === 'FunctionExpression'
	) {
		/** @type {Doc[]} */
		const methodParts = [];
		const funcValue = /** @type {AST.FunctionExpression} */ (node.value);

		if (node.kind === 'get' || node.kind === 'set') {
			methodParts.push(node.kind, ' ');
		} else if (funcValue.async) {
			methodParts.push('async ');
		}

		if (funcValue.generator) {
			methodParts.push('*');
		}

		methodParts.push(...printKey(node, path, options, print));
		methodParts.push(
			...path.call(
				(valuePath) =>
					printMethodValue(
						/** @type {AstPath<AST.FunctionExpression>} */ (valuePath),
						options,
						print,
					),
				'value',
			),
		);
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

	// Each member prints its own `;` (see `printTypeMemberSemicolon`), and
	// `line` separates them, so the literal can stay on one line
	const members = printTypeMembers(node.members, path, 'members', options, print, line);

	// Like Prettier, under `objectWrap: "preserve"` a type literal stays
	// expanded when the source has a line break between `{` and its first
	// member; otherwise it breaks only when it doesn't fit.
	const shouldBreak =
		options.objectWrap === 'preserve' &&
		hasNewLineAfterOpeningBrace(
			options.locStart(/** @type {AST.NodeWithLocation} */ (node)),
			node.members[0],
			options,
		);
	const spacing = options.bracketSpacing === false ? softline : line;
	const content = ['{', indent([spacing, ...members]), spacing, '}'];

	// The type of a hugged only parameter breaks with the parameter list:
	// `({ a, b }: { a: A; b: B })` breaks both braces together.
	if (
		path.match(
			() => true,
			(node, name) => name === 'typeAnnotation',
			(node, name) => name === 'typeAnnotation',
			shouldHugTheOnlyParameter,
		)
	) {
		return content;
	}

	return group(content, { shouldBreak });
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
	parts.push(...printKey(node, path, options, print));

	if (node.optional) {
		parts.push('?');
	}

	parts.push(...printTypeAnnotationProperty(path, print));

	return parts;
}

/**
 * Print a TypeScript method signature in an interface
 * @param {AST.TSMethodSignature} node - The method signature node
 * @param {AstPath<AST.TSMethodSignature>} path - The AST path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
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
	parts.push(...printKey(node, path, options, print));

	// Add optional marker if present
	if (node.optional) {
		parts.push('?');
	}

	// Type parameters, parameters, and return type, like Prettier's
	// `printMethodSignature`
	const parametersDoc = printFunctionParameters(path, options, print, false, true);
	/** @type {Doc} */
	const returnTypeDoc = printTypeAnnotationProperty(path, print);
	parts.push(
		shouldGroupFunctionParameters(node, returnTypeDoc) ? group(parametersDoc) : parametersDoc,
	);
	if (node.typeAnnotation) {
		parts.push(group(returnTypeDoc));
	}

	return group(parts);
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

	parts.push(...printTypeAnnotationProperty(path, print));

	// Interfaces and type literals separate their members, but class members
	// end themselves — without this the class body runs into the next member
	const parent = /** @type {AST.Node | null} */ (path.getParentNode());
	if (parent?.type === 'ClassBody') {
		parts.push(semi(options));
	}

	return parts;
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
	const text = /** @type {string} */ (options.originalText);

	// Like Prettier, under `objectWrap: "preserve"` a mapped type stays
	// expanded when the source has a line break after its `{`
	let shouldBreak = false;
	if (options.objectWrap === 'preserve') {
		const start = options.locStart(/** @type {AST.NodeWithLocation} */ (node)) + 1;
		shouldBreak = text.slice(start, skipWhitespaceAndComments(text, start)).includes('\n');
	}

	/**
	 * @param {boolean | '+' | '-' | undefined} token
	 * @param {string} keyword
	 * @returns {string}
	 */
	const printModifier = (token, keyword) =>
		token === '+' || token === '-' ? token + keyword : keyword;

	const typeParam = node.typeParameter;
	const spacing = options.bracketSpacing === false ? softline : line;

	// A comment after `{` attaches to the type parameter, whose name this
	// printer prints directly, so print it here, like Prettier prints the
	// mapped type's dangling comments. One after the `[` stays before the
	// name, as Prettier prints the leading comments of its key.
	/** @type {Doc[]} */
	const commentsDoc = [];
	const leadingComments =
		/** @type {AST.NodeWithMaybeComments} */ (typeParam).leadingComments ?? [];
	/** @param {AST.Comment} comment */
	const isAfterBracket = (comment) =>
		skipWhitespaceAndComments(text, /** @type {AST.NodeWithLocation} */ (comment).end) ===
		/** @type {AST.NodeWithLocation} */ (typeParam).start;
	const keyComments = leadingComments.filter(isAfterBracket);
	const comments = leadingComments.filter((comment) => !isAfterBracket(comment));
	if (comments.length > 0) {
		const printed = comments.map((comment) => printComment(comment, text));
		const lastComment = /** @type {AST.CommentWithLocation} */ (comments[comments.length - 1]);
		commentsDoc.push(
			...printed.slice(0, -1).map((comment) => [comment, hardline]),
			group([
				printed[printed.length - 1],
				lastComment.type === 'Line' || hasNewline(text, lastComment.end) ? hardline : line,
			]),
		);
	}

	return group(
		[
			'{',
			indent([
				spacing,
				...commentsDoc,
				node.readonly ? [printModifier(node.readonly, 'readonly'), ' '] : '',
				group([
					'[',
					indent([
						softline,
						...printLeadingComments(typeParam, keyComments, options),
						...printTypeParameterName(typeParam, options),
						' in ',
						typeParam.constraint
							? path.call(print, 'typeParameter', 'constraint')
							: path.call(print, 'typeParameter'),
						// The comments after the constraint trail the type parameter,
						// which holds it: like Prettier, they stay after it
						...printTrailingComments(typeParam, options),
						node.nameType ? [' as ', path.call(print, 'nameType')] : '',
					]),
					softline,
					']',
				]),
				node.optional ? printModifier(node.optional, '?') : '',
				node.typeAnnotation ? [': ', path.call(print, 'typeAnnotation')] : '',
				options.semi !== false ? ifBreak(';') : '',
			]),
			spacing,
			'}',
		],
		{ shouldBreak },
	);
}

/**
 * Print a qualified name (`A.B.C`). Type references print it on one line, like
 * Prettier. In an interface's `extends` or a class's `implements`, Prettier's
 * AST has a member expression instead, which `printMemberExpression` can
 * break before a `.`: there, like it, `.right` goes in
 * `group(indent([softline, …]))` unless the name is a lone `a.b`.
 * @param {AST.TSQualifiedName} node
 * @param {AstPath<AST.TSQualifiedName>} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @returns {Doc}
 */
function printTSQualifiedName(node, path, options, print) {
	const left = path.call(print, 'left');
	const right = ['.', path.call(print, 'right')];
	if (!isHeritageClauseName(path)) {
		return [left, right];
	}
	const shouldInline =
		node.left.type === 'Identifier' &&
		/** @type {AST.Node} */ (path.parent).type !== 'TSQualifiedName';
	return [left, lineSuffixBoundary, shouldInline ? right : group(indent([softline, right]))];
}

/**
 * Whether a qualified name is the name, or the left side of the name, of a
 * type in an interface's `extends` or a class's `implements`.
 * @param {AstPath<AST.TSQualifiedName>} path
 * @returns {boolean}
 */
function isHeritageClauseName(path) {
	/** @type {AST.Node} */
	let child = path.node;
	for (let level = 0; ; level++) {
		const ancestor = /** @type {AST.Node | null} */ (path.getParentNode(level));
		if (ancestor?.type === 'TSQualifiedName' && ancestor.left === child) {
			child = ancestor;
			continue;
		}
		const clauseOwner = /** @type {AST.Node | null} */ (path.getParentNode(level + 1));
		return (
			ancestor?.type === 'TSExpressionWithTypeArguments' &&
			/** @type {AST.Node} */ (ancestor.expression) === child &&
			(clauseOwner?.type === 'TSInterfaceDeclaration' ||
				clauseOwner?.type === 'ClassDeclaration' ||
				clauseOwner?.type === 'ClassExpression')
		);
	}
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
	const parts = node.options
		? // Like Prettier, the module specifier and the import attributes lay out
			// like call arguments
			[group(['import', printCallArguments(path, options, print, false)])]
		: ['import(', path.call(print, 'argument'), ')'];

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
 * Remove JSX whitespace from both ends of text. Unlike `String#trim`, it keeps
 * a non-breaking space and the other Unicode spaces, which are text in JSX.
 * @param {string} text
 * @returns {string}
 */
function trimJSXWhitespace(text) {
	return text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/gu, '');
}

/**
 * Print direct TSRX text so it can wrap like JSX text when an element body
 * breaks. Every whitespace run, line breaks and blank lines included, renders
 * as one space, so like Prettier's `printJsxChildren` the words fill the lines.
 * @param {string} raw
 * @returns {Doc}
 */
function printRawText(raw) {
	const text = trimJSXWhitespace(raw);
	if (!text) {
		return '';
	}
	/** @type {Doc[]} */
	const parts = [];
	for (const word of text.split(/[ \t\r\n]+/u)) {
		if (parts.length === 0) {
			parts.push(word);
		} else if (startsWithLineComment(word)) {
			parts.push([/** @type {Doc} */ (parts.pop()), ' ', word]);
		} else {
			parts.push(line, word);
		}
	}
	return fill(parts);
}

/**
 * Whether a word of text starts with `//`, which TSRX reads as a line comment
 * at the start of a line. Such a word never starts a line: it stays on the
 * line of the word before it, after a space that doesn't break.
 * @param {string} word
 * @returns {boolean}
 */
function startsWithLineComment(word) {
	return word.startsWith('//');
}

/**
 * Whether JSX text renders anything, like Prettier's `isMeaningfulJsxText`: it
 * has a character other than JSX whitespace, or whitespace without a line
 * break, which renders as a space.
 * @param {string} text
 * @returns {boolean}
 */
function isMeaningfulJSXText(text) {
	return text !== '' && (/[^ \t\r\n]/u.test(text) || !/\n/u.test(text));
}

/**
 * A `{" "}` child. Like Prettier's `printJsxElementInternal`, the element and
 * fragment printers treat it as a plain significant space, which prints as
 * ` ` when its neighbors share a line and as `{" "}` where a line breaks.
 * @param {AST.Node} child
 * @returns {boolean}
 */
function isJSXWhitespaceExpression(child) {
	if (child.type !== 'JSXExpressionContainer') {
		return false;
	}
	const expression = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (child.expression);
	return (
		!hasComment(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (child)) &&
		!hasComment(expression) &&
		expression.type === 'Literal' &&
		expression.value === ' '
	);
}

/**
 * A self-closing element, which Prettier's JSX separators keep off the line of
 * a longer word next to it.
 * @param {any} node
 * @returns {boolean}
 */
function isSelfClosingJSXElement(node) {
	return node?.type === 'JSXElement' && !node.closingElement;
}

/**
 * Prettier's `separatorNoWhitespace`: the break between a child and text that
 * touches it, which renders as nothing either way.
 * @param {Doc} word - The word next to the child
 * @param {any} childNode
 * @param {any} nextNode
 * @returns {Doc}
 */
function separatorNoWhitespace(word, childNode, nextNode) {
	if (isSelfClosingJSXElement(childNode) || isSelfClosingJSXElement(nextNode)) {
		return typeof word === 'string' && word.length === 1 ? softline : hardline;
	}
	return softline;
}

/**
 * Prettier's `separatorWithWhitespace`: the break for whitespace with a line
 * break at the edge of text, which renders as nothing.
 * @param {Doc} word - The word next to the whitespace
 * @param {any} childNode
 * @param {any} nextNode
 * @returns {Doc}
 */
function separatorWithWhitespace(word, childNode, nextNode) {
	if (typeof word === 'string' && word.length === 1) {
		return isSelfClosingJSXElement(childNode) || isSelfClosingJSXElement(nextNode)
			? hardline
			: softline;
	}
	return hardline;
}

/**
 * A child of an element or fragment body: text, which is printed word by
 * word, or any other child, printed whole.
 * @typedef {{ text: string, node: any } | { doc: Doc, node: any }} JSXChildItem
 */

/**
 * Prettier's `printJsxChildren`: the children as `fill` parts, with text
 * split into words and each separator chosen by the whitespace around it. Up
 * to one space between children is significant and prints as `jsxWhitespace`,
 * whitespace with a line break isn't, and one blank line between children
 * that aren't text is kept.
 * @param {JSXChildItem[]} items
 * @param {Doc} jsxWhitespace
 * @returns {Doc[]}
 */
function printJSXChildren(items, jsxWhitespace) {
	/** @type {Doc} */
	let prevPart = '';
	/** @type {Doc[]} */
	const parts = [prevPart];
	/** @param {Doc} doc */
	const push = (doc) => {
		prevPart = doc;
		parts.push([/** @type {Doc} */ (parts.pop()), doc]);
	};
	/** @param {Doc} doc */
	const pushLine = (doc) => {
		if (doc === '') {
			return;
		}
		prevPart = doc;
		parts.push(doc, '');
	};

	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		const next = items[index + 1];
		if ('text' in item) {
			const text = item.text;
			if (isMeaningfulJSXText(text)) {
				const words = text.split(/([ \t\r\n]+)/u);
				if (words[0] === '') {
					words.shift();
					if (/\n/u.test(words[0])) {
						pushLine(separatorWithWhitespace(words[1], item.node, next?.node));
					} else if (startsWithLineComment(words[1])) {
						// TSRX: the word stays on the line of the child before it (see
						// below)
						push(' ');
					} else {
						pushLine(jsxWhitespace);
					}
					words.shift();
				}

				/** @type {string | undefined} */
				let endWhitespace;
				if (words.at(-1) === '') {
					words.pop();
					endWhitespace = words.pop();
				}

				// Whitespace without a line break and nothing else
				if (words.length === 0) {
					continue;
				}

				for (const [wordIndex, word] of words.entries()) {
					if (wordIndex % 2 === 0) {
						push(word);
					} else if (startsWithLineComment(words[wordIndex + 1])) {
						// TSRX: the word would read as a comment at the start of a line
						push(' ');
					} else {
						pushLine(line);
					}
				}

				if (endWhitespace !== undefined) {
					if (/\n/u.test(endWhitespace)) {
						pushLine(separatorWithWhitespace(prevPart, item.node, next?.node));
					} else {
						pushLine(jsxWhitespace);
					}
				} else {
					pushLine(separatorNoWhitespace(prevPart, item.node, next?.node));
				}
			} else if (/\n/u.test(text)) {
				// Keep up to one blank line between tags, expressions, and text
				if ((text.match(/\n/gu) ?? []).length > 1) {
					pushLine(hardline);
				}
			} else {
				pushLine(jsxWhitespace);
			}
		} else {
			push(item.doc);
			if (next && 'text' in next && isMeaningfulJSXText(next.text)) {
				const [firstWord] = trimJSXWhitespace(next.text).split(/[ \t\r\n]+/u);
				// TSRX: a word that starts with `//` would read as a comment at the
				// start of a line, so it stays on the line of the child before it,
				// which ends with a comment for it to be text (`{" "}/* c */ //x`).
				// The sides of a comment in text keep it there (see
				// `pushJSXTextWithComments`).
				if (
					!startsWithLineComment(firstWord) ||
					isCommentNode(item.node) ||
					/^[ \t]*[\r\n]/u.test(next.text)
				) {
					pushLine(separatorNoWhitespace(firstWord, item.node, next.node));
				}
			} else {
				pushLine(hardline);
			}
		}
	}

	return parts;
}

/**
 * Whether a child item of {@link printJSXChildren} is a comment in text.
 * @param {any} node
 * @returns {boolean}
 */
function isCommentNode(node) {
	return node?.type === 'Block' || node?.type === 'Line';
}

/**
 * What prints on one side of a comment in JSX text: nothing (`glue`), a
 * space (`literal`), a space that may break (`line`), a line break
 * (`hardline`), a JSX space (`space`), which prints as `{" "}` where it
 * breaks, at the start or end of the element's body a JSX space when the
 * body breaks and nothing otherwise (`edge`), or what the children's layout
 * gives (`keep`).
 * @typedef {'glue' | 'literal' | 'line' | 'hardline' | 'space' | 'edge' | 'keep'} JSXTextCommentSide
 */

/**
 * Push the items of JSX text with comments in it (`text /* note *\/ more`)
 * for {@link printJSXChildren}: the text between the comments, and each
 * comment as an item of its own. The parser keeps the text whole around a
 * comment, and a comment adds nothing to the text's value, so the whitespace
 * on its sides is one run with the comment: a word break between two words,
 * and at the text's edge a significant space unless the run has a line
 * break. A comment takes the whitespace next to it, and `sides` records what
 * prints on each of its sides so that the run keeps its meaning, which
 * {@link printJSXElementBody} sets once the children are printed:
 *
 * - nothing where the comment touches its neighbor;
 * - in a run with a line break, a line break where the whitespace has one,
 *   and a space that may break otherwise, since the run's spaces don't
 *   count at a line's end;
 * - between two words, a space that may break;
 * - at the text's edge next to a child, a space that doesn't break, so that
 *   the significant space stays in the text;
 * - at the start or end of the element's body, a JSX space on the body's
 *   side, which prints as `{" "}` when the body breaks, and a space that may
 *   break on the side of the words. With no whitespace on the body's side,
 *   the JSX space prints only when the body breaks.
 *
 * A line comment ends its line.
 * @param {JSXChildItem[]} items
 * @param {AST.Node & AST.NodeWithMaybeComments} child - The text
 * @param {(AST.Node & AST.NodeWithMaybeComments) | undefined} previous - The child before it
 * @param {string} gap - The whitespace before the text that the parser dropped
 * @param {string} text - The source text
 * @param {boolean} isLastChild - Whether the text ends the element's body
 * @param {Map<Doc, { before: JSXTextCommentSide, after: JSXTextCommentSide }>} sides
 */
function pushJSXTextWithComments(items, child, previous, gap, text, isLastChild, sides) {
	const isFirstChild = items.length === 0;
	const { start, end } = /** @type {AST.NodeWithLocation} */ (child);
	const comments = /** @type {(AST.Comment & AST.NodeWithLocation)[]} */ ([
		...(child.leadingComments ?? []),
		...(child.innerComments ?? []),
	]).sort((a, b) => a.start - b.start);
	// A comment in the text that a `{" "}` before it on its line keeps
	const othersBefore = /** @type {(AST.Comment & AST.NodeWithLocation)[]} */ (
		previous?.trailingComments ?? []
	).filter((comment) => comment.start >= start && comment.end <= end);
	/**
	 * The source from `from` to `to`, without those comments
	 * @param {number} from
	 * @param {number} to
	 */
	const sliceText = (from, to) => {
		let result = '';
		for (const comment of othersBefore) {
			if (comment.start >= from && comment.end <= to) {
				result += text.slice(from, comment.start);
				from = comment.end;
			}
		}
		return result + text.slice(from, to);
	};
	// The text around the comments: strings at even indexes and comments at
	// odd ones. After the last comment, the rest of the text's value, which
	// leaves out a `prettier-ignore` after its last word and the comments
	// after it, which lead the next child.
	/** @type {(string | (AST.Comment & AST.NodeWithLocation))[]} */
	const tokens = [];
	let cursor = getJSXChildStart(child);
	for (const comment of comments) {
		tokens.push((tokens.length === 0 ? gap : '') + sliceText(cursor, comment.start), comment);
		cursor = comment.end;
	}
	let valueBefore = cursor - start;
	for (const comment of [...comments, ...othersBefore]) {
		if (comment.start >= start && comment.end <= cursor) {
			valueBefore -= comment.end - comment.start;
		}
	}
	tokens.push(
		/** @type {string} */ (/** @type {ESTreeJSX.JSXText} */ (child).value).slice(valueBefore),
	);

	/** @param {number} index */
	const stringAt = (index) => /** @type {string} */ (tokens[index]);
	/** @param {string} string */
	const leadingWhitespace = (string) => /** @type {string} */ (/^[ \t\r\n]*/u.exec(string)?.[0]);
	/** @param {string} string */
	const trailingWhitespace = (string) => /** @type {string} */ (/[ \t\r\n]*$/u.exec(string)?.[0]);
	/** @param {string} string */
	const isWhitespace = (string) => !/[^ \t\r\n]/u.test(string);

	// The comments of the run around the comment at `index`, from `first` to
	// `last`, and the whitespace in it
	/** @param {number} index */
	const getRun = (index) => {
		let first = index;
		while (first > 1 && isWhitespace(stringAt(first - 1))) {
			first -= 2;
		}
		let last = index;
		while (last < tokens.length - 2 && isWhitespace(stringAt(last + 1))) {
			last += 2;
		}
		const before = stringAt(first - 1);
		const after = stringAt(last + 1);
		const whitespace = [trailingWhitespace(before), leadingWhitespace(after)];
		let hasLineComment = false;
		for (let i = first; i <= last; i += 2) {
			hasLineComment ||= /** @type {AST.Comment} */ (tokens[i]).type === 'Line';
			if (i < last) {
				whitespace.push(stringAt(i + 1));
			}
		}
		return {
			first,
			last,
			hasLineBreak: hasLineComment || whitespace.some((part) => part.includes('\n')),
			hasWhitespace: whitespace.some((part) => part !== ''),
			wordBefore: !isWhitespace(before),
			wordAfter: !isWhitespace(after),
		};
	};

	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (typeof token === 'string') {
			const isFirst = index === 0;
			const isLast = index === tokens.length - 1;
			if (!isWhitespace(token)) {
				const start = isFirst ? 0 : leadingWhitespace(token).length;
				const end = isLast ? token.length : token.length - trailingWhitespace(token).length;
				items.push({ text: token.slice(start, end), node: child });
			} else if (
				// Whitespace alone keeps a blank line, the way whitespace between
				// children does, and at the start or end of the body a significant
				// space
				(token.match(/\n/gu) ?? []).length > 1 ||
				(token !== '' &&
					((isFirst && isFirstChild) || (isLast && isLastChild)) &&
					!getRun(isFirst ? 1 : index - 1).hasLineBreak)
			) {
				items.push({ text: token, node: child });
			}
			continue;
		}

		const run = getRun(index);
		// Whether the run is at the start or end of the element's body, where
		// its significant space always prints as `{" "}` when the body breaks
		const isAtBodyEdge = (!run.wordBefore && isFirstChild) || (!run.wordAfter && isLastChild);
		/**
		 * @param {string} whitespace - The whitespace on this side
		 * @param {boolean} isOuter - Whether this side is the run's
		 * @param {boolean} hasWord - Whether a word is on this side of the run
		 * @returns {JSXTextCommentSide}
		 */
		const getSide = (whitespace, isOuter, hasWord) => {
			if (run.hasLineBreak) {
				return whitespace === '' ? 'glue' : whitespace.includes('\n') ? 'hardline' : 'line';
			}
			if (run.wordBefore && run.wordAfter) {
				return whitespace === '' ? 'glue' : 'line';
			}
			// Next to a child, the run doesn't break, so its space stays in the
			// text
			if (!isAtBodyEdge) {
				return whitespace === '' ? 'glue' : 'literal';
			}
			if (isOuter && !hasWord) {
				return whitespace !== '' ? 'space' : run.hasWhitespace ? 'edge' : 'glue';
			}
			return whitespace === '' ? 'glue' : 'line';
		};
		const textAfter = stringAt(index + 1);
		const whitespaceAfter = leadingWhitespace(textAfter);
		/** @type {JSXTextCommentSide} */
		let after =
			token.type === 'Line'
				? 'hardline'
				: getSide(whitespaceAfter, index === run.last, run.wordAfter);
		// A word after the comment that starts with `//` would read as a comment
		// at the start of a line
		if (after === 'line' && startsWithLineComment(textAfter.slice(whitespaceAfter.length))) {
			after = 'literal';
		}
		/** @type {Doc} */
		const doc = [printComment(token, text), token.type === 'Line' ? breakParent : ''];
		sides.set(doc, {
			before: getSide(trailingWhitespace(stringAt(index - 1)), index === run.first, run.wordBefore),
			after,
		});
		items.push({ doc, node: token });
	}
}

/**
 * @param {Doc} doc
 * @returns {boolean}
 */
function isEmptyStringOrAnyLine(doc) {
	return doc === '' || doc === line || doc === hardline || doc === softline;
}

/**
 * Prettier's `isEmptyDoc` for the docs `printJSXChildren` builds: only empty
 * strings.
 * @param {Doc} doc
 * @returns {boolean}
 */
function isEmptyJSXChildDoc(doc) {
	return doc === '' || (Array.isArray(doc) && doc.every(isEmptyJSXChildDoc));
}

/**
 * Where a child's printed source starts, with its leading comments.
 * @param {AST.Node & AST.NodeWithMaybeComments} node
 * @returns {number}
 */
function getJSXChildStart(node) {
	const first = node.leadingComments?.[0];
	const start = /** @type {AST.NodeWithLocation} */ (node).start;
	return first ? Math.min(start, /** @type {AST.NodeWithLocation} */ (first).start) : start;
}

/**
 * Where a child's printed source ends, with its trailing comments.
 * @param {AST.Node & AST.NodeWithMaybeComments} node
 * @returns {number}
 */
function getJSXChildEnd(node) {
	const last = node.trailingComments?.at(-1);
	const end = /** @type {AST.NodeWithLocation} */ (node).end;
	return last ? Math.max(end, /** @type {AST.NodeWithLocation} */ (last).end) : end;
}

/**
 * Print a `{…}` child like Prettier's `printJsxExpressionContainer`, with the
 * comments TSRX attaches to the container itself around it.
 * @param {AstPath} path - The path to the element or fragment
 * @param {number} index - The child's index
 * @param {PrintFn} print
 * @param {string} text - The source text
 * @returns {Doc}
 */
function printJSXChildExpressionContainer(path, index, print, text) {
	const child = path.node.children[index];
	const expressionDoc = path.call(print, 'children', index, 'expression');
	return [
		...printTemplateChildLeadingComments(child),
		printJSXExpressionContainer(child.expression, expressionDoc, true),
		...printTemplateChildTrailingComments(child, text),
	];
}

/**
 * Prettier's `printJsxExpressionContainer`: a value that can break after its
 * first token hugs the braces, and any other value breaks onto its own lines
 * inside them.
 * @param {AST.Node} expression
 * @param {Doc} expressionDoc
 * @param {boolean} isChild - Whether the container is an element's child
 * @returns {Doc}
 */
function printJSXExpressionContainer(expression, expressionDoc, isChild) {
	if (shouldHugJSXExpression(expression, isChild)) {
		return group(['{', expressionDoc, lineSuffixBoundary, '}']);
	}
	return group(['{', indent([softline, expressionDoc]), softline, lineSuffixBoundary, '}']);
}

/**
 * Print a spread attribute or child, `{...expr}`, like Prettier's
 * `printJsxSpreadAttributeOrChild`: the comments of the argument print inside
 * the braces, the leading ones ahead of the `...`, and the braces break open
 * around a line comment so it stays inside them. The comments of a type cast
 * stay on its parentheses. A spread child prints as a group of its own, and
 * the braces of an attribute break with the opening tag.
 * @param {AstPath<ESTreeJSX.JSXSpreadAttribute | ESTreeJSX.JSXSpreadChild>} path - The spread's path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printJSXSpread(path, options, print) {
	const key = path.node.type === 'JSXSpreadAttribute' ? 'argument' : 'expression';
	const argument = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (
		path.node.type === 'JSXSpreadAttribute' ? path.node.argument : path.node.expression
	);
	const isTypeCast = path.call(
		(argumentPath) => getTypeCastParens(argumentPath, options) !== null,
		key,
	);
	const leadingComments = isTypeCast ? [] : (argument.leadingComments ?? []);
	if (leadingComments.length === 0 && !argument.trailingComments?.length) {
		return ['{...', path.call(print, key), '}'];
	}
	/** @type {Doc[]} */
	const printed = [
		'{',
		indent([
			softline,
			...printLeadingComments(argument, leadingComments, options),
			'...',
			path.call(
				(argumentPath) =>
					print(argumentPath, { suppressLeadingComments: leadingComments.length > 0 }),
				key,
			),
		]),
		softline,
		lineSuffixBoundary,
		'}',
	];
	return path.node.type === 'JSXSpreadChild' ? group(printed) : printed;
}

/**
 * Print the body and closing tag of an element or fragment, a port of
 * Prettier's `printJsxElementInternal`. The children fill their lines when
 * there is text and take a line each otherwise. The element stays on one line
 * when it fits, unless it has more than one attribute, a child element, more
 * than one `{…}` child, an opening tag that breaks, or a child that breaks.
 * @param {AST.TSRXJSXElement | AST.TSRXJSXFragment | AST.JSXStyleElement} node
 * @param {AstPath} path
 * @param {TsrxFormatOptions} options
 * @param {PrintFn} print
 * @param {Doc} openingLines - The printed opening tag
 * @param {Doc} closingLines - The printed closing tag
 * @param {Doc[]} closingCommentDocs - Comments before the closing tag
 * @param {number} attributeCount
 * @returns {Doc}
 */
function printJSXElementBody(
	node,
	path,
	options,
	print,
	openingLines,
	closingLines,
	closingCommentDocs,
	attributeCount,
) {
	const children = /** @type {AST.Node[]} */ (node.children);
	const text = /** @type {string} */ (options.originalText);

	if (
		children.length === 1 &&
		children[0].type === 'JSXExpressionContainer' &&
		(children[0].expression.type === 'TemplateLiteral' ||
			children[0].expression.type === 'TaggedTemplateExpression') &&
		closingCommentDocs.length === 0
	) {
		return [openingLines, printJSXChildExpressionContainer(path, 0, print, text), closingLines];
	}

	/** @type {JSXChildItem[]} */
	const items = [];
	// What prints on the sides of the comments in text and of the children
	// that end with a line comment
	/** @type {Map<Doc, { before: JSXTextCommentSide, after: JSXTextCommentSide }>} */
	const commentSides = new Map();
	for (let index = 0; index < children.length; index++) {
		const child = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (children[index]);
		const previous = /** @type {(AST.Node & AST.NodeWithMaybeComments) | undefined} */ (
			children[index - 1]
		);
		// The parser drops the whitespace with a line break after a closing tag,
		// alone or at the start of the text that follows. Prettier's separators
		// depend on it, and it can hold a blank line, which Prettier keeps, so
		// read it back from the source.
		let gap = '';
		if (previous && previous.type !== 'JSXText') {
			const whitespace = text.slice(getJSXChildEnd(previous), getJSXChildStart(child));
			if (!/[^ \t\r\n]/u.test(whitespace)) {
				gap = whitespace;
			}
		}
		if (child.type === 'JSXText' && !hasComment(child)) {
			items.push({ text: gap + child.value, node: child });
			continue;
		}
		if (child.type === 'JSXText' && child.innerComments && !child.trailingComments) {
			const isLastChild = index === children.length - 1;
			pushJSXTextWithComments(items, child, previous, gap, text, isLastChild, commentSides);
			continue;
		}
		if (gap !== '') {
			items.push({ text: gap, node: { type: 'JSXText' } });
		}
		if (child.type === 'JSXText') {
			items.push({ doc: path.call(print, 'children', index), node: child });
		} else if (isJSXWhitespaceExpression(child)) {
			// `{" "}` is a significant space, like Prettier reads it
			items.push({ text: ' ', node: { type: 'JSXText' } });
		} else if (child.type === 'JSXExpressionContainer') {
			items.push({ doc: printJSXChildExpressionContainer(path, index, print, text), node: child });
		} else {
			items.push({ doc: path.call(print, 'children', index), node: child });
		}
		// A child that starts with a comment on a line of its own starts its
		// line, so that a JSX space before it prints as `{" "}`, and one that
		// ends with a line comment ends its line, even before a one-letter word,
		// which would otherwise join its line ahead of the comment
		const item = /** @type {JSXChildItem} */ (items.at(-1));
		if ('doc' in item && item.node === child) {
			const leadingComments = child.leadingComments ?? [];
			const startsLine =
				leadingComments.length > 0 &&
				(child.type === 'JSXExpressionContainer' ||
					leadingComments.some(
						(comment) =>
							comment.type === 'Line' ||
							hasNewline(text, /** @type {AST.NodeWithLocation} */ (comment).end),
					));
			const endsLine = child.trailingComments?.some((comment) => comment.type === 'Line');
			if (startsLine || endsLine) {
				commentSides.set(item.doc, {
					before: startsLine ? 'hardline' : 'keep',
					after: endsLine ? 'hardline' : 'keep',
				});
			}
		}
	}

	const containsTag = children.some(
		(child) =>
			child.type === 'JSXElement' ||
			child.type === 'JSXFragment' ||
			child.type === 'JSXStyleElement',
	);
	const containsMultipleExpressions =
		children.filter(
			(child) => child.type === 'JSXExpressionContainer' && !isJSXWhitespaceExpression(child),
		).length > 1;
	// A comment after the last child prints after a space, which would be
	// text before the closing tag on the same line
	const lastChild = /** @type {(AST.Node & AST.NodeWithMaybeComments) | undefined} */ (
		children.findLast((child) => child.type !== 'JSXText' || isMeaningfulJSXText(child.value))
	);
	// Record any breaks. Should never go from true to false, only false to true.
	let forcedBreak =
		willBreak(openingLines) ||
		containsTag ||
		attributeCount > 1 ||
		containsMultipleExpressions ||
		closingCommentDocs.length > 0 ||
		(lastChild?.type !== 'JSXText' && Boolean(lastChild?.trailingComments?.length));

	const rawJsxWhitespace = options.singleQuote ? "{' '}" : '{" "}';
	const jsxWhitespace = ifBreak([rawJsxWhitespace, softline], ' ');
	const parts = printJSXChildren(items, jsxWhitespace);
	const containsText = items.some((item) => 'text' in item && isMeaningfulJSXText(item.text));

	// We can end up with multiple whitespace elements with empty string content
	// between them. Remove empty whitespace and softlines before JSX whitespace
	// to get the correct output.
	for (let i = parts.length - 2; i >= 0; i--) {
		const isPairOfEmptyStrings = parts[i] === '' && parts[i + 1] === '';
		const isPairOfHardlines =
			parts[i] === hardline && parts[i + 1] === '' && parts[i + 2] === hardline;
		const isLineFollowedByJsxWhitespace =
			(parts[i] === softline || parts[i] === hardline) &&
			parts[i + 1] === '' &&
			parts[i + 2] === jsxWhitespace;
		const isJsxWhitespaceFollowedByLine =
			parts[i] === jsxWhitespace &&
			parts[i + 1] === '' &&
			(parts[i + 2] === softline || parts[i + 2] === hardline);
		const isDoubleJsxWhitespace =
			parts[i] === jsxWhitespace && parts[i + 1] === '' && parts[i + 2] === jsxWhitespace;
		const isPairOfHardOrSoftLines =
			(parts[i] === softline && parts[i + 1] === '' && parts[i + 2] === hardline) ||
			(parts[i] === hardline && parts[i + 1] === '' && parts[i + 2] === softline);

		if (
			(isPairOfHardlines && containsText) ||
			isPairOfEmptyStrings ||
			isLineFollowedByJsxWhitespace ||
			isDoubleJsxWhitespace ||
			isPairOfHardOrSoftLines
		) {
			parts.splice(i, 2);
		} else if (isJsxWhitespaceFollowedByLine) {
			parts.splice(i + 1, 2);
		}
	}

	// Trim trailing lines (or empty strings)
	while (parts.length > 0 && isEmptyStringOrAnyLine(/** @type {Doc} */ (parts.at(-1)))) {
		parts.pop();
	}
	// Trim leading lines (or empty strings)
	while (parts.length > 1 && isEmptyStringOrAnyLine(parts[0]) && isEmptyStringOrAnyLine(parts[1])) {
		parts.shift();
		parts.shift();
	}

	// What prints on the sides of a comment in text (see
	// `pushJSXTextWithComments`), each a part of its own, and after a child
	// that ends with a line comment. A JSX space already there comes from
	// whitespace next to the comment, like a `{" "}` child, and stays, before
	// or after a line break the comment needs.
	let spaceAtStart = false;
	let spaceAtEnd = false;
	if (commentSides.size > 0) {
		/** @type {Record<Exclude<JSXTextCommentSide, 'keep'>, Doc>} */
		const sideDocs = { glue: '', literal: ' ', line, hardline, space: jsxWhitespace, edge: '' };
		/**
		 * @param {Doc} separator - The separator the children's layout gives
		 * @param {Exclude<JSXTextCommentSide, 'keep'>} side
		 * @param {boolean} isBefore - Whether it's before the comment
		 * @returns {Doc}
		 */
		const getSeparator = (separator, side, isBefore) => {
			if (separator !== jsxWhitespace) {
				return sideDocs[side];
			}
			if (side !== 'hardline') {
				return jsxWhitespace;
			}
			return isBefore ? [rawJsxWhitespace, hardline] : [hardline, rawJsxWhitespace];
		};
		for (let i = 0; i < parts.length; i += 2) {
			// A child that a word starting with `//` joins (see `printJSXChildren`)
			// is the first doc of its part
			let part = parts[i];
			while (Array.isArray(part) && part.length === 2 && Array.isArray(part[0])) {
				part = part[0];
			}
			const sides =
				Array.isArray(part) && part.length === 2 && part[0] === ''
					? commentSides.get(part[1])
					: undefined;
			if (!sides) {
				continue;
			}
			// A line break the comment keeps, even where the body starts or ends
			if (sides.before === 'hardline' || sides.after === 'hardline') {
				forcedBreak = true;
			}
			if (i === 0 && sides.before === 'edge') {
				spaceAtStart = true;
			} else if (i > 0 && sides.before !== 'keep') {
				parts[i - 1] = getSeparator(parts[i - 1], sides.before, true);
			}
			if (i === parts.length - 1 && sides.after === 'edge') {
				spaceAtEnd = true;
			} else if (i + 1 < parts.length && sides.after !== 'keep') {
				parts[i + 1] = getSeparator(parts[i + 1], sides.after, false);
			}
		}
	}

	// Over several lines, whitespace at the start or end of the children, or
	// after a line break, prints as `{" "}`. Line-like docs stay at odd indexes,
	// as `fill` needs.
	/** @type {Doc[]} */
	const multilineChildren = [''];
	if (spaceAtStart) {
		multilineChildren.push([rawJsxWhitespace, hardline], '');
	}
	for (const [i, child] of parts.entries()) {
		if (child === jsxWhitespace) {
			if (i === 1 && isEmptyJSXChildDoc(parts[i - 1])) {
				if (parts.length === 2) {
					// Solitary whitespace
					multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), rawJsxWhitespace]);
					continue;
				}
				// Leading whitespace
				multilineChildren.push([rawJsxWhitespace, hardline], '');
				continue;
			}
			if (i === parts.length - 1) {
				// Trailing whitespace
				multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), rawJsxWhitespace]);
				continue;
			}
			if (parts[i - 1] === '' && parts[i - 2] === hardline) {
				// Whitespace after line break
				multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), rawJsxWhitespace]);
				continue;
			}
		}

		if (i % 2 === 0) {
			multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), child]);
		} else {
			multilineChildren.push(child, '');
		}

		if (willBreak(child)) {
			forcedBreak = true;
		}
	}
	if (spaceAtEnd) {
		multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), rawJsxWhitespace]);
	}

	// With text, `fill` puts as much on each line as fits. Without it, each
	// child takes a line.
	const content = containsText
		? fill(multilineChildren)
		: group(multilineChildren, { shouldBreak: true });

	const multiLineElem = group([
		openingLines,
		indent([hardline, content, ...closingCommentDocs]),
		hardline,
		closingLines,
	]);

	if (forcedBreak) {
		return multiLineElem;
	}

	return conditionalGroup([group([openingLines, ...parts, closingLines]), multiLineElem]);
}

/**
 * Parents that print a JSX element as it is, from Prettier's `isNoWrapParent`.
 * A template statement position (`isStatementSlot`) doesn't wrap either.
 */
const JSX_NO_WRAP_PARENTS = new Set([
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
 * A `path.match` predicate that accepts any node.
 * @returns {boolean}
 */
function anyJSXPathNode() {
	return true;
}

/**
 * Prettier's `maybeWrapJsxElementInParens` for an element, fragment, or
 * template value printed with its comments: in any position but the no-wrap
 * parents and statement positions, like after `return`, `=`, `=>`, or `&&`,
 * it prints between parentheses on lines of their own when it breaks. When
 * `needsParens` adds parentheses, they are always there and the comments go
 * inside them.
 * @param {AstPath} path
 * @param {TsrxFormatOptions} options
 * @param {Doc} printed - The node with its comments
 * @returns {Doc}
 */
function printTemplateInParens(path, options, printed) {
	const parent = /** @type {AST.Node | null} */ (path.parent);
	const hasParens = needsParens(path, options);
	if (
		!parent ||
		JSX_NO_WRAP_PARENTS.has(parent.type) ||
		isStatementSlot(/** @type {string} */ (path.key), parent)
	) {
		return hasParens ? ['(', printed, ')'] : printed;
	}
	// An arrow body that is a call argument inside a `{…}` child, as in
	// `{items.map((item) => <li />)}`
	const shouldBreak =
		path.match(
			anyJSXPathNode,
			(/** @type {any} */ node, /** @type {any} */ key) =>
				key === 'body' && node.type === 'ArrowFunctionExpression',
			(/** @type {any} */ node, /** @type {any} */ key) =>
				key === 'arguments' && node.type === 'CallExpression',
		) &&
		(path.match(
			anyJSXPathNode,
			anyJSXPathNode,
			anyJSXPathNode,
			(/** @type {any} */ node, /** @type {any} */ key) =>
				key === 'expression' && node.type === 'JSXExpressionContainer',
		) ||
			path.match(
				anyJSXPathNode,
				anyJSXPathNode,
				anyJSXPathNode,
				(/** @type {any} */ node, /** @type {any} */ key) =>
					key === 'expression' && node.type === 'ChainExpression',
				(/** @type {any} */ node, /** @type {any} */ key) =>
					key === 'expression' && node.type === 'JSXExpressionContainer',
			));
	const contents = [indent([softline, printed]), softline];
	return hasParens
		? ['(', group(contents, { shouldBreak }), ')']
		: group([ifBreak('('), ...contents, ifBreak(')')], { shouldBreak });
}

/**
 * The value of an attribute string (`title="Hello"`), or `null`. A string
 * in braces (`title={'Hello'}`) is an expression container, as in Prettier.
 * @param {AST.Node} attr
 * @returns {string | null}
 */
function getJSXAttributeStringValue(attr) {
	if (attr.type !== 'JSXAttribute' || !attr.value) {
		return null;
	}
	const value = /** @type {AST.Node} */ (attr.value);
	if (value.type === 'Literal' && typeof value.value === 'string') {
		return value.value;
	}
	return null;
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
	const openingElement = node.openingElement;

	// Dynamic tags (`<{expr}>`) print the opening expression for both tags so
	// they stay textually identical; static names print as plain strings.
	const tagName =
		openingElement.name.type === 'JSXExpressionContainer'
			? ['{', path.call(print, 'openingElement', 'name', 'expression'), '}']
			: printJSXElementName(openingElement.name);

	const isSelfClosing = openingElement.selfClosing;
	const attributes = /** @type {AST.Node[]} */ (openingElement.attributes ?? []);
	const hasChildren = node.children && node.children.length > 0;

	/** @type {Doc} */
	let typeArgsDoc = '';
	if (openingElement.typeArguments) {
		typeArgsDoc = path.call(print, 'openingElement', 'typeArguments');
	}
	// A comment before the tag name, as in `</* note */ div>`, prints before
	// it, and one after it, as in `<div // note`, prints after it
	const nameNode = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (openingElement.name);
	const nameLeadingComments = nameNode.leadingComments ?? [];
	const printedName = finishTsrxNode(
		nameNode,
		printLeadingComments(nameNode, nameLeadingComments, options),
		tagName,
		options,
	);
	// When the first of those comments is a line comment, or a block comment on
	// a line of its own, it starts on the line after the `<`, like the comments
	// of Prettier's closing tags and fragments. Right after the `<`, a line
	// comment would read as a closing tag (`<// note`), and a block comment
	// would join the `<`'s line on the next format.
	const sourceText = /** @type {string} */ (options.originalText);
	const firstNameComment = /** @type {(AST.Comment & AST.NodeWithLocation) | undefined} */ (
		nameLeadingComments[0]
	);
	const nameCommentStartsLine =
		firstNameComment !== undefined &&
		(firstNameComment.type === 'Line' ||
			(hasNewline(sourceText, firstNameComment.start, { backwards: true }) &&
				hasNewline(sourceText, firstNameComment.end)));
	const openingTagName = nameCommentStartsLine ? indent([hardline, printedName]) : printedName;
	const nameHasComments =
		hasComment(nameNode) ||
		Boolean(
			openingElement.typeArguments &&
			hasComment(
				/** @type {AST.Node & AST.NodeWithMaybeComments} */ (
					/** @type {unknown} */ (openingElement.typeArguments)
				),
			),
		);

	// Prettier's `printJsxOpeningElement`
	/** @type {Doc} */
	let openingTag;
	if (isSelfClosing && attributes.length === 0 && !nameHasComments) {
		openingTag = ['<', openingTagName, typeArgsDoc, ' />'];
	} else {
		// Each attribute prints with its comments
		const attributeDocs = attributes.map((_, i) =>
			path.call(print, 'openingElement', 'attributes', i),
		);
		const singleStringValue =
			attributes.length === 1 ? getJSXAttributeStringValue(attributes[0]) : null;
		if (
			singleStringValue !== null &&
			!singleStringValue.includes('\n') &&
			!nameHasComments &&
			!hasComment(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (attributes[0])) &&
			!hasLineCommentInAttribute(attributes[0])
		) {
			// Don't break up an opening element with a single long text attribute
			openingTag = group([
				'<',
				openingTagName,
				typeArgsDoc,
				' ',
				attributeDocs[0],
				isSelfClosing ? ' />' : '>',
			]);
		} else {
			// An attribute string with a line break breaks the opening element, and
			// so does a value that breaks, as the break would propagate to it
			const shouldBreak =
				attributes.some((attr) => getJSXAttributeStringValue(attr)?.includes('\n')) ||
				attributeDocs.some((attributeDoc) => willBreak(attributeDoc));
			const attributeLine =
				options.singleAttributePerLine && attributes.length > 1 ? hardline : line;
			const text = /** @type {string} */ (options.originalText);
			const lastAttribute = /** @type {(AST.Node & AST.NodeWithMaybeComments) | undefined} */ (
				attributes.at(-1)
			);
			const bracketSameLine =
				(attributes.length === 0 && !nameHasComments) ||
				(Boolean(
					options.bracketSameLine ||
					/** @type {{ jsxBracketSameLine?: boolean }} */ (options).jsxBracketSameLine,
				) &&
					(!nameHasComments || attributes.length > 0) &&
					!lastAttribute?.trailingComments?.length &&
					!hasLineCommentInAttribute(lastAttribute));
			openingTag = group(
				[
					'<',
					openingTagName,
					typeArgsDoc,
					indent(
						attributeDocs.map((attributeDoc, i) => [
							i === 0
								? attributeLine
								: isNextLineEmptyAfterIndex(
											text,
											/** @type {AST.NodeWithLocation} */ (attributes[i - 1]).end,
									  )
									? [hardline, hardline]
									: attributeLine,
							attributeDoc,
						]),
					),
					...(isSelfClosing ? [line, '/>'] : bracketSameLine ? ['>'] : [softline, '>']),
				],
				{ shouldBreak },
			);
		}
	}

	if (isSelfClosing) {
		return openingTag;
	}

	const closingTag = printJSXClosingTag(node.closingElement, tagName, options);

	// Raw-text `<script>` element: the body lives on `node.content`, mirrored as a
	// single JSXText child (see the parser's `#parseScriptElement`). Print that
	// child — embed() formats it as TypeScript — in a block layout, bypassing the
	// generic children path so the body is never whitespace-merged as markup text.
	if (isRawScriptElement(node)) {
		if (!hasChildren) {
			return [openingTag, closingTag];
		}
		return group([
			openingTag,
			indent([hardline, path.call(print, 'children', 0)]),
			hardline,
			closingTag,
		]);
	}

	// Comments before `</tag>` and the comments of a comment-only element.
	const { closingCommentDocs, innerCommentDocs } = collectElementBodyCommentDocs(
		/** @type {AST.TSRXJSXElement} */ (node),
		openingElement,
		node.closingElement,
	);

	if (
		!hasChildren ||
		(node.children.length === 1 &&
			node.children[0].type === 'JSXText' &&
			!hasComment(node.children[0]) &&
			!isMeaningfulJSXText(node.children[0].value))
	) {
		const bodyComments = [...innerCommentDocs, ...closingCommentDocs];
		if (bodyComments.length > 0) {
			return group([openingTag, indent(bodyComments), hardline, closingTag]);
		}
		return [openingTag, closingTag];
	}

	// A `<style>` body is a stylesheet, printed as a block below the tag.
	if (node.type === 'JSXStyleElement') {
		const stylesheet = path.call(print, 'children', 0);
		if (isEmptyJSXChildDoc(stylesheet) && closingCommentDocs.length === 0) {
			return [openingTag, closingTag];
		}
		return group([
			openingTag,
			indent([hardline, stylesheet, ...closingCommentDocs]),
			hardline,
			closingTag,
		]);
	}

	// A `@{ … }` code block is the whole body and hugs the tags: `<div>@{ … }</div>`.
	if (node.children.length === 1 && node.children[0].type === 'JSXCodeBlock') {
		return group([openingTag, path.call(print, 'children', 0), closingTag]);
	}

	return printJSXElementBody(
		node,
		path,
		options,
		print,
		openingTag,
		closingTag,
		closingCommentDocs,
		attributes.length,
	);
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
	const openingTag = printJSXFragmentTag(node.openingFragment, options);
	const closingTag = printJSXFragmentTag(node.closingFragment, options);

	// Comments before `</>` and the comments of a comment-only fragment.
	const { closingCommentDocs, innerCommentDocs } = collectElementBodyCommentDocs(
		node,
		node.openingFragment,
		node.closingFragment,
	);

	if (!hasChildren) {
		const bodyComments = [...innerCommentDocs, ...closingCommentDocs];
		if (bodyComments.length > 0) {
			return group([openingTag, indent(bodyComments), hardline, closingTag]);
		}
		return [openingTag, closingTag];
	}

	// A `@{ … }` code block is the whole body and hugs the tags: `<>@{ … }</>`.
	if (node.children.length === 1 && node.children[0].type === 'JSXCodeBlock') {
		return group([openingTag, path.call(print, 'children', 0), closingTag]);
	}

	return printJSXElementBody(
		node,
		path,
		options,
		print,
		openingTag,
		closingTag,
		closingCommentDocs,
		0,
	);
}

/**
 * Print a fragment's `<>` or `</>` with the comments between its `<` or `</`
 * and its `>`, which dangle on it, like Prettier's
 * `printJsxOpeningClosingFragment`: `</* note *\/>` and `</ /* note *\/>`, or a
 * line comment on a line of its own.
 * @param {AST.TSRXJSXFragment['openingFragment'] | AST.TSRXJSXFragment['closingFragment']} tag
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc}
 */
function printJSXFragmentTag(tag, options) {
	const isOpening = tag?.type !== 'JSXClosingFragment';
	const comments = /** @type {AST.NodeWithMaybeComments} */ (tag)?.innerComments ?? [];
	if (comments.length === 0) {
		return isOpening ? '<>' : '</>';
	}
	const hasLineComment = comments.some((comment) => comment.type === 'Line');
	return [
		isOpening ? '<' : '</',
		indent([
			hasLineComment ? hardline : isOpening ? '' : ' ',
			join(
				hardline,
				comments.map((comment) => printComment(comment, options.originalText)),
			),
		]),
		hasLineComment ? hardline : '',
		'>',
	];
}

/**
 * Print an element's closing tag, like Prettier's `printJsxClosingElement`:
 * the comments of its name print around the name (`</div /* note *\/>`), a
 * block comment before it after a space (`</ /* note *\/ div>`), and a line
 * comment before it on a line of its own.
 * @param {AST.TSRXJSXElement['closingElement'] | AST.JSXStyleElement['closingElement']} closingElement
 * @param {Doc} tagName - The printed name
 * @param {TsrxFormatOptions} options - Prettier options
 * @returns {Doc}
 */
function printJSXClosingTag(closingElement, tagName, options) {
	const nameNode = /** @type {(AST.Node & AST.NodeWithMaybeComments) | undefined} */ (
		closingElement?.name
	);
	if (!nameNode || !hasComment(nameNode)) {
		return ['</', tagName, '>'];
	}
	const leadingComments = nameNode.leadingComments ?? [];
	const printed = finishTsrxNode(
		nameNode,
		printLeadingComments(nameNode, leadingComments, options),
		tagName,
		options,
	);
	if (leadingComments.some((comment) => comment.type === 'Line')) {
		return ['</', indent([hardline, printed]), hardline, '>'];
	}
	return ['</', leadingComments.length > 0 ? ' ' : '', printed, '>'];
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
		parts.push(printComment(comment));
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
 *
 * A `{" "}` keeps the block comments on its line even in the text after it
 * (see `isCommentInText` in the parser), where the whitespace around them is
 * one run of the text's whitespace. A space printed before one of them is in
 * that run, so it prints only where the source has one and the run has no
 * line break, which would make its spaces insignificant.
 * @param {AST.Node & AST.NodeWithMaybeComments} child
 * @param {string} text - The source text
 * @returns {Doc[]}
 */
function printTemplateChildTrailingComments(child, text) {
	const comments = child.trailingComments;
	if (!comments || comments.length === 0) {
		return [];
	}
	const expression = /** @type {ESTreeJSX.JSXExpressionContainer} */ (child).expression;
	const isJSXSpace = expression?.type === 'Literal' && expression.value === ' ';
	/** @type {Set<AST.Comment>} */
	const glued = new Set();
	if (isJSXSpace) {
		let end = /** @type {AST.NodeWithLocation} */ (child).end;
		let whitespace = '';
		for (const comment of comments) {
			if (comment.type !== 'Block') {
				break;
			}
			const { start } = /** @type {AST.NodeWithLocation} */ (comment);
			if (start === end) {
				glued.add(comment);
			}
			whitespace += text.slice(end, start);
			end = /** @type {AST.NodeWithLocation} */ (comment).end;
		}
		whitespace += /** @type {string} */ (/^[ \t\r\n]*/u.exec(text.slice(end))?.[0]);
		if (whitespace.includes('\n')) {
			for (const comment of comments) {
				glued.add(comment);
			}
		}
	}
	/** @type {Doc[]} */
	const parts = [];
	for (const comment of comments) {
		if (comment.type === 'Line') {
			parts.push(lineSuffix([' ', printComment(comment)]));
			parts.push(breakParent);
		} else if (comment.type === 'Block') {
			parts.push(glued.has(comment) ? '' : ' ', printComment(comment));
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
		parts.push(printComment(comments[i], text));
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
	if (parts.length > 0) {
		// Trailing comments after the last statement/render inside the block
		parts.push(
			...printElementBodyComments(
				node.innerComments,
				node.render ?? node.body[node.body.length - 1],
				/** @type {string} */ (options.originalText),
			),
		);
	} else if (node.innerComments?.length) {
		// Like the comments of an empty function body, on consecutive lines
		parts.push(
			join(
				hardline,
				node.innerComments.map((comment) => printComment(comment, options.originalText)),
			),
		);
	} else {
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
		return printJSXShorthandAttribute(attr, name, path, options, print);
	}

	// Like Prettier's `print("name")`, the name prints with its comments
	const nameNode = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (
		/** @type {unknown} */ (attr.name)
	);
	const printedName = hasComment(nameNode)
		? finishTsrxNode(
				nameNode,
				printLeadingComments(nameNode, nameNode.leadingComments ?? [], options),
				name,
				options,
			)
		: name;

	if (!attr.value) {
		return printedName;
	}

	// The comments between the `=` and the value lead the value
	const value = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (attr.value);
	const valueComments = value.leadingComments ?? [];
	const hasLineComment = valueComments.some((comment) => comment.type === 'Line');

	if (value.type === 'JSXExpressionContainer') {
		const expression = /** @type {ESTreeJSX.JSXExpressionContainer} */ (value).expression;
		const exprDoc = path.call(print, 'value', 'expression');
		/** @type {Doc} */
		let container;
		if (hasLineComment) {
			// Where Prettier's output settles: inside the braces, where the comments
			// lead the expression
			container = group([
				'{',
				indent([softline, ...printLeadingComments(value, valueComments, options), exprDoc]),
				softline,
				lineSuffixBoundary,
				'}',
			]);
		} else {
			container = [
				...printValueBlockComments(valueComments),
				printJSXExpressionContainer(expression, exprDoc, false),
			];
		}
		return [printedName, '=', container, ...printTrailingComments(value, options)];
	}

	// A string, or an element or fragment written without braces
	// (`prop=<Bar />`), whose comments stay where the print callback puts them
	// when a type cast or a `prettier-ignore` needs them before it
	/** @type {Doc} */
	let printed;
	if (value.type === 'Literal') {
		printed = finishTsrxNode(
			value,
			[],
			printJSXAttributeString(/** @type {AST.SimpleLiteral} */ (value), options),
			options,
		);
	} else if (
		path.call(
			(valuePath) => getTypeCastParens(valuePath, options) === null && !isIgnored(valuePath),
			'value',
		)
	) {
		printed = path.call(
			(valuePath) => print(valuePath, { suppressLeadingComments: true }),
			'value',
		);
	} else {
		return [printedName, '=', path.call(print, 'value')];
	}
	const firstLineComment = valueComments.findIndex((comment) => comment.type === 'Line');
	if (firstLineComment === -1) {
		return [printedName, '=', ...printValueBlockComments(valueComments), printed];
	}
	return [
		printedName,
		'=',
		...printValueBlockComments(valueComments.slice(0, firstLineComment)),
		printed,
		...printValueCommentsAfter(valueComments.slice(firstLineComment)),
	];
}

/**
 * Print the block comments between an attribute's `=` and its value, each
 * followed by a space, like Prettier's `attr=/* note *\/ "value"`. They stay
 * on the value's line, where Prettier moves one that ends its line before the
 * `=` on the next format.
 * @param {AST.Comment[]} comments
 * @returns {Doc[]}
 */
function printValueBlockComments(comments) {
	return comments.flatMap((comment) => [printComment(comment), ' ']);
}

/**
 * Print the comments between an attribute's `=` and a value without braces
 * from the first line comment on, which can't stay before the value. They
 * print after it like trailing comments of the attribute, the line comment on
 * the attribute's line, where Prettier's output settles (Prettier moves a line
 * comment on the `=`'s line after the element, where it trails the attribute
 * on the next format): `attr="value" // note`. The ones after it go on lines
 * of their own.
 * @param {AST.Comment[]} comments - The comments, starting with a line comment
 * @returns {Doc[]}
 */
function printValueCommentsAfter(comments) {
	return comments.map((comment, index) =>
		index === 0
			? [lineSuffix([' ', printComment(comment)]), breakParent]
			: lineSuffix([hardline, printComment(comment)]),
	);
}

/**
 * Whether an attribute has a line comment on its name, or before a value
 * without braces, which then prints after the value (see
 * {@link printValueCommentsAfter}). Like a trailing line comment of the
 * attribute, it keeps the opening tag broken, so that the `>` and what follows
 * it don't join the comment's line.
 * @param {AST.Node | undefined} attribute
 * @returns {boolean}
 */
function hasLineCommentInAttribute(attribute) {
	if (attribute?.type !== 'JSXAttribute' || attribute.shorthand) {
		return false;
	}
	const name = /** @type {AST.NodeWithMaybeComments} */ (/** @type {unknown} */ (attribute.name));
	const value = /** @type {(AST.Node & AST.NodeWithMaybeComments) | null} */ (attribute.value);
	return [
		...(name.leadingComments ?? []),
		...(name.trailingComments ?? []),
		...(value && value.type !== 'JSXExpressionContainer' ? (value.leadingComments ?? []) : []),
	].some((comment) => comment.type === 'Line');
}

/**
 * Print a shorthand attribute, `{name}`, TSRX's form of `name={name}`. With
 * comments, whether on the braces, the name, or the value, it prints its
 * value like the container of `name={/* note *\/ name}` in Prettier, with the
 * comments inside the braces.
 * @param {ESTreeJSX.JSXAttribute} attr - The attribute
 * @param {string} name - The printed name
 * @param {AstPath<ESTreeJSX.JSXAttribute>} path - The attribute's path
 * @param {TsrxFormatOptions} options - Prettier options
 * @param {PrintFn} print - Print callback
 * @returns {Doc}
 */
function printJSXShorthandAttribute(attr, name, path, options, print) {
	const container = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (
		/** @type {unknown} */ (attr.value)
	);
	const nameNode = /** @type {AST.Node & AST.NodeWithMaybeComments} */ (
		/** @type {unknown} */ (attr.name)
	);
	const expression = /** @type {(AST.Node & AST.NodeWithMaybeComments) | undefined} */ (
		container?.type === 'JSXExpressionContainer' ? container.expression : undefined
	);
	if (!expression || !(hasComment(container) || hasComment(nameNode) || hasComment(expression))) {
		return ['{', name, '}'];
	}
	/** @type {Doc[]} */
	const leading = [];
	/** @type {Doc[]} */
	const trailing = [];
	for (const node of [container, nameNode]) {
		leading.push(...printLeadingComments(node, node.leadingComments ?? [], options));
		trailing.unshift(...printTrailingComments(node, options));
	}
	const value = [...leading, path.call(print, 'value', 'expression'), ...trailing];
	return group(['{', indent([softline, value]), softline, lineSuffixBoundary, '}']);
}

/**
 * Prettier's `shouldInline` for a JSX expression container: an empty
 * expression, or a value without comments that can break after its first
 * token, like an array, object, function, call, or template (also after
 * `await`), stays against the braces, and so does a conditional or binary
 * child of an element.
 * @param {AST.Node} node
 * @param {boolean} [isChild] - Whether the container is an element's child
 * @returns {boolean}
 */
function shouldHugJSXExpression(node, isChild = false) {
	if (node.type === 'JSXEmptyExpression') {
		return true;
	}
	if (hasComment(/** @type {AST.Node & AST.NodeWithMaybeComments} */ (node))) {
		return false;
	}
	switch (node.type) {
		case 'ArrayExpression':
		case 'ObjectExpression':
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
		case 'TemplateLiteral':
		case 'TaggedTemplateExpression':
		// TSRX: a code block or template control flow breaks after its first token
		case 'JSXCodeBlock':
		case 'JSXIfExpression':
		case 'JSXForExpression':
		case 'JSXSwitchExpression':
		case 'JSXTryExpression':
			return true;
		case 'AwaitExpression':
			return shouldHugJSXExpression(node.argument) || node.argument.type === 'JSXElement';
		case 'ConditionalExpression':
			return isChild;
		default:
			return (
				stripChainElementWrappers(node).type === 'CallExpression' || (isChild && isBinaryish(node))
			);
	}
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
