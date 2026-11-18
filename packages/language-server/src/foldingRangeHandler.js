/** @import * as AST from 'estree' */
// Types only: Volar's server and the LSP types it re-exports from vscode-languageserver.
/** @import { Connection, FoldingRange, LanguageServer } from '@volar/language-server' */

import { URI } from 'vscode-uri';
import { parseModule as parse_module } from '@tsrx/core';
import { is_tsrx_document } from './utils.js';

/**
 * A fold that ends on one of these keeps the line holding it visible: the closing `}`,
 * `</div>`, `)` or `` ` ``, as VS Code's TypeScript folds TSX.
 */
const CLOSING_CHARACTERS = new Set(['}', ']', ')', '`', '>']);

/** TypeScript's region markers: `// #region name` and `// #endregion`. */
const REGION_MARKER = /^#(end)?region/;

/** Keys that hold no child nodes, or nodes whose offsets are not source offsets. */
const SKIPPED_KEYS = new Set([
	'loc',
	'metadata',
	// The stylesheet of a `<style>` element counts offsets from the start of its CSS.
	'css',
	'leadingComments',
	'trailingComments',
	'innerComments',
]);

/** Statements whose body block folds from the end of the line that opens it. */
const ATTACHED_BLOCK_PARENTS = new Set([
	'IfStatement',
	'ForStatement',
	'ForInStatement',
	'ForOfStatement',
	'WhileStatement',
	'DoWhileStatement',
	'WithStatement',
	'TryStatement',
	'CatchClause',
	'SwitchCase',
	'JSXIfExpression',
	'JSXForExpression',
	'JSXTryExpression',
]);

const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);

/**
 * Answer `textDocument/foldingRange` for `.tsrx` files with folds computed from the TSRX
 * source, merged with the folds Volar's service plugins map back from embedded code (the CSS
 * of `<style>` blocks). Volar's own handler would only return the mapped ones: TypeScript's
 * folds on the generated code do not map back, and neither VS Code's TypeScript (whose
 * tsserver plugin answers no outlining spans for `.tsrx` files) nor TypeScript 7 folds
 * `.tsrx` files. No Volar service plugin offers folding ranges (`stripFoldingRanges` in
 * `servicePlugins.js`), so Volar registers no handler that would replace this one.
 * @param {Connection} connection
 * @param {LanguageServer} server
 */
export function register_folding_ranges(connection, server) {
	connection.onFoldingRanges(async (params, token) => {
		const uri = URI.parse(params.textDocument.uri);
		const language_service = await server.project.getLanguageService(uri);
		const embedded = (await language_service.getFoldingRanges(uri, token)) ?? [];
		if (token.isCancellationRequested) return null;
		const document = server.documents.get(uri);
		if (!document || !is_tsrx_document(params.textDocument.uri)) return embedded;
		return merge_folding_ranges([
			...collect_folding_ranges(document.getText(), uri.fsPath),
			...embedded,
		]);
	});
}

/**
 * The folds of a `.tsrx` source, following the folds TypeScript gives TSX: functions and
 * other blocks, `@{ ... }` bodies, each directive body and clause (`@else`, `@empty`,
 * `@case`, `@catch`, `@pending`), multi-line elements and `<style>` blocks, objects, arrays,
 * multi-line calls, template strings, groups of imports, comments and `// #region` markers.
 * While the source does not parse, folds follow indentation and region markers.
 * @param {string} text
 * @param {string} file_name
 * @returns {FoldingRange[]}
 */
export function collect_folding_ranges(text, file_name) {
	const line_starts = [0];
	for (const match of text.matchAll(/\r\n|\r|\n/g)) {
		line_starts.push(/** @type {number} */ (match.index) + match[0].length);
	}
	/** @param {number} offset */
	const line_of = (offset) => {
		let low = 0;
		let high = line_starts.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if (line_starts[middle] <= offset) low = middle;
			else high = middle - 1;
		}
		return low;
	};
	/**
	 * The start of each comment, by the offset where it ends, and its end by its start.
	 * @type {Map<number, number>}
	 */
	const comment_starts = new Map();
	/** @type {Map<number, number>} */
	const comment_ends = new Map();
	/**
	 * The offset of the first `character` from `offset` on, outside comments, or -1.
	 * @param {string} character
	 * @param {number} offset
	 */
	const find_after = (character, offset) => {
		let index = offset;
		while (index < text.length) {
			const comment_end = comment_ends.get(index);
			if (comment_end !== undefined) {
				index = comment_end;
			} else if (text[index] === character) {
				return index;
			} else {
				index++;
			}
		}
		return -1;
	};
	/**
	 * The line of the token before `offset`, past blanks and comments, where a block opened on
	 * a line of its own still folds from the line that opens it.
	 * @param {number} offset
	 */
	const previous_token_line = (offset) => {
		let index = offset - 1;
		while (index > 0) {
			const comment_start = comment_starts.get(index + 1);
			if (comment_start !== undefined) {
				index = comment_start - 1;
			} else if (/\s/.test(text[index])) {
				index--;
			} else {
				break;
			}
		}
		return line_of(Math.max(index, 0));
	};

	/** @type {FoldingRange[]} */
	const ranges = [];
	/**
	 * @param {number} start_line
	 * @param {number} end Offset after the last folded character.
	 * @param {FoldingRange['kind']} [kind] Comment and region folds end where their text ends.
	 */
	const fold = (start_line, end, kind) => {
		let end_line = line_of(end - 1);
		if (!kind && CLOSING_CHARACTERS.has(text[end - 1])) end_line--;
		if (end_line > start_line) {
			ranges.push(
				kind
					? { startLine: start_line, endLine: end_line, kind }
					: { startLine: start_line, endLine: end_line },
			);
		}
	};

	/** @type {AST.CommentWithLocation[]} */
	const comments = [];
	/** @type {AST.Program} */
	let ast;
	try {
		ast = parse_module(text, file_name, { loose: true, preserveParens: true, comments });
	} catch {
		return merge_folding_ranges(fallback_folding_ranges(text));
	}
	for (const comment of comments) {
		comment_starts.set(comment.end, comment.start);
		comment_ends.set(comment.start, comment.end);
	}

	/**
	 * @param {any} node
	 * @param {any} parent
	 */
	const visit = (node, parent) => {
		switch (node.type) {
			case 'Program':
				fold_import_groups(node.body);
				break;
			case 'BlockStatement':
			case 'JSXCodeBlock':
				if (FUNCTION_TYPES.has(parent?.type) && parent.body === node) {
					fold(function_start_line(parent), node.end);
				} else if (ATTACHED_BLOCK_PARENTS.has(parent?.type)) {
					fold(previous_token_line(node.start), node.end);
				} else {
					fold(line_of(node.start), node.end);
				}
				break;
			case 'ClassBody':
			case 'TSInterfaceBody':
			case 'TSEnumBody':
			case 'TSModuleBlock':
				fold(previous_token_line(node.start), node.end);
				break;
			case 'SwitchStatement':
			case 'JSXSwitchExpression':
				// From the line of the `)` before the case block's `{`.
				fold(previous_token_line(find_after('{', node.discriminant.end)), node.end);
				break;
			case 'StaticBlock':
				fold(line_of(find_after('{', node.start)), node.end);
				break;
			case 'SwitchCase':
				// A `case x:` folds its statements; an `@case x: { ... }` body is a block.
				if (Array.isArray(node.consequent) && node.consequent.length > 0) {
					fold(line_of(node.test?.end ?? node.start), node.consequent.at(-1).end);
				}
				break;
			case 'ObjectExpression':
			case 'ArrayExpression':
			case 'ObjectPattern':
			case 'ArrayPattern':
			case 'TSTypeLiteral':
			case 'TSTupleType':
				fold(
					parent?.type === 'ArrayExpression' || parent?.type === 'CallExpression'
						? line_of(node.start)
						: previous_token_line(node.start),
					node.end,
				);
				break;
			case 'CallExpression':
				// From the end of the token before the `(`, as TypeScript folds calls; it folds no
				// `new` arguments.
				if (node.arguments.length > 0) {
					fold(
						previous_token_line(find_after('(', node.typeArguments?.end ?? node.callee.end)),
						node.end,
					);
				}
				break;
			case 'ArrowFunctionExpression':
				if (
					node.body.type !== 'BlockStatement' &&
					node.body.type !== 'JSXCodeBlock' &&
					node.body.type !== 'ParenthesizedExpression'
				) {
					fold(previous_token_line(node.body.start), node.body.end);
				}
				break;
			case 'ImportDeclaration':
			case 'ExportNamedDeclaration':
			case 'ExportAllDeclaration':
				fold_braces(
					(node.specifiers ?? []).filter(
						(/** @type {any} */ specifier) =>
							specifier.type === 'ImportSpecifier' || specifier.type === 'ExportSpecifier',
					),
				);
				fold_braces(node.attributes ?? []);
				break;
			case 'JSXOpeningElement':
				// A multi-line attribute list folds on its own, from its first attribute.
				if (node.attributes.length > 0) {
					fold(line_of(node.attributes[0].start), node.attributes.at(-1).end);
				}
				break;
			case 'JSXElement':
			case 'JSXStyleElement':
				// A self-closing element folds only its attributes.
				if (node.closingElement) fold(line_of(node.start), node.end);
				break;
			case 'TemplateLiteral':
			case 'ParenthesizedExpression':
			case 'JSXFragment':
				fold(line_of(node.start), node.end);
				break;
		}
		for (const key in node) {
			if (SKIPPED_KEYS.has(key)) continue;
			const value = node[key];
			if (Array.isArray(value)) {
				for (const child of value) {
					if (is_node(child)) visit(child, node);
				}
			} else if (is_node(value)) {
				visit(value, node);
			}
		}
	};

	/**
	 * A function folds from its `(` when its parameters span lines, else from its body's `{`.
	 * @param {any} node
	 */
	const function_start_line = (node) => {
		if (node.params.length > 0) {
			const open = previous_token_line(node.params[0].start);
			if (open !== line_of(node.params.at(-1).end)) return open;
		}
		return previous_token_line(node.body.start);
	};

	/**
	 * Two or more imports in a row fold together.
	 * @param {AST.Node[]} statements
	 */
	const fold_import_groups = (statements) => {
		let first = 0;
		while (first < statements.length) {
			let last = first;
			while (last < statements.length && is_import(statements[last])) last++;
			if (last - first > 1) {
				fold(
					line_of(/** @type {any} */ (statements[first]).start),
					/** @type {any} */ (statements[last - 1]).end,
					'imports',
				);
			}
			first = last + 1;
		}
	};

	/**
	 * The braces around `elements`: the names of `import { a, b } from` and `export { a, b }`,
	 * and import attributes (`with { type: 'json' }`).
	 * @param {any[]} elements
	 */
	const fold_braces = (elements) => {
		if (elements.length === 0) return;
		const close = find_after('}', elements.at(-1).end);
		if (close !== -1) fold(previous_token_line(elements[0].start), close + 1);
	};

	visit(ast, null);
	fold_comments(
		comments,
		text,
		line_of,
		(offset) => /^[ \t]*$/.test(text.slice(line_starts[line_of(offset)], offset)),
		fold,
	);
	return merge_folding_ranges(ranges);
}

/**
 * Multi-line block comments, runs of two or more line comments each on a line of its own,
 * and `// #region` ... `// #endregion` pairs.
 * @param {AST.CommentWithLocation[]} comments
 * @param {string} text
 * @param {(offset: number) => number} line_of
 * @param {(offset: number) => boolean} first_on_line Whether only blanks precede `offset` on
 *   its line.
 * @param {(start_line: number, end: number, kind: FoldingRange['kind']) => void} fold
 */
function fold_comments(comments, text, line_of, first_on_line, fold) {
	/** @type {number[]} */
	const regions = [];
	/** @type {AST.CommentWithLocation | null} */
	let first = null;
	/** @type {AST.CommentWithLocation | null} */
	let last = null;
	const end_run = () => {
		if (first && last && first !== last) fold(line_of(first.start), last.end, 'comment');
		first = last = null;
	};
	for (const comment of comments) {
		const own_line = comment.type === 'Line' && first_on_line(comment.start);
		const region = own_line ? REGION_MARKER.exec(comment.value.trim()) : null;
		if (region || !own_line || (last && /\S/.test(text.slice(last.end, comment.start)))) {
			end_run();
		}
		if (region) {
			if (!region[1]) {
				regions.push(line_of(comment.start));
			} else if (regions.length > 0) {
				fold(/** @type {number} */ (regions.pop()), comment.end, 'region');
			}
		} else if (own_line) {
			first ??= comment;
			last = comment;
		} else if (comment.type === 'Block') {
			fold(line_of(comment.start), comment.end, 'comment');
		}
	}
	end_run();
}

/**
 * Folds by indentation, the way VS Code folds a file no provider folds, plus region markers.
 * @param {string} text
 * @returns {FoldingRange[]}
 */
function fallback_folding_ranges(text) {
	const lines = text.split(/\r\n|\r|\n/);
	/** @type {FoldingRange[]} */
	const ranges = [];
	/** @type {Array<{ indent: number, end_above: number }>} */
	const open = [{ indent: -1, end_above: lines.length }];
	for (let line = lines.length - 1; line >= 0; line--) {
		const indent = indent_of(lines[line]);
		if (indent === -1) continue;
		let previous = open[open.length - 1];
		if (previous.indent > indent) {
			do {
				open.pop();
				previous = open[open.length - 1];
			} while (previous.indent > indent);
			if (previous.end_above - 1 > line) {
				ranges.push({ startLine: line, endLine: previous.end_above - 1 });
			}
		}
		if (previous.indent === indent) {
			previous.end_above = line;
		} else {
			open.push({ indent, end_above: line });
		}
	}
	/** @type {number[]} */
	const regions = [];
	for (const [line, content] of lines.entries()) {
		const region = /^\s*\/\/(.*)$/.exec(content);
		const marker = region && REGION_MARKER.exec(region[1].trim());
		if (!marker) continue;
		if (!marker[1]) {
			regions.push(line);
		} else if (regions.length > 0) {
			const start = /** @type {number} */ (regions.pop());
			if (line > start) ranges.push({ startLine: start, endLine: line, kind: 'region' });
		}
	}
	return ranges;
}

/**
 * The width of a line's indentation, tabs counting to the next multiple of 4, or -1 for a
 * blank line.
 * @param {string} line
 */
function indent_of(line) {
	let width = 0;
	for (const character of line) {
		if (character === ' ') width++;
		else if (character === '\t') width += 4 - (width % 4);
		else return width;
	}
	return -1;
}

/**
 * Sorted by line, one fold per first line: the one that reaches furthest, which is the one an
 * editor that keeps a single fold per line keeps for TSX.
 * @param {FoldingRange[]} ranges
 * @returns {FoldingRange[]}
 */
function merge_folding_ranges(ranges) {
	const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
	return sorted.filter(
		(range, index) => index === 0 || sorted[index - 1].startLine !== range.startLine,
	);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function is_node(value) {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof (/** @type {any} */ (value).type) === 'string' &&
		typeof (/** @type {any} */ (value).start) === 'number'
	);
}

/**
 * @param {AST.Node} statement
 * @returns {boolean}
 */
function is_import(statement) {
	return (
		statement.type === 'ImportDeclaration' ||
		/** @type {string} */ (statement.type) === 'TSImportEqualsDeclaration'
	);
}
