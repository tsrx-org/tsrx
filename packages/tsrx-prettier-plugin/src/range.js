/**
 * @import { Parser, ParserOptions } from 'prettier'
 * @import { Node } from './parse.js'
 */

/**
 * Formatting part of a file (`rangeStart`, `rangeEnd`). Prettier formats a
 * range in two parses (`formatRange` in `src/main/core.js`): it parses the
 * file and chooses the statements the range starts and ends at, then formats
 * their text on its own and puts it back. It chooses those statements only for
 * its own parsers, by the parser's name (`isSourceElement` in
 * `src/main/range.js`), so for `tsrx` it formats nothing (#831).
 *
 * So the first parse names the parser `typescript` for this format, with a
 * plugin that resolves that name to this parser: Prettier then chooses the
 * statements as it does for TypeScript, and parses the range with this parser.
 * Other files keep Prettier's own `typescript` parser. This relies on Prettier
 * passing the options object that `parse` receives on to the range's format.
 *
 * A template's output, a directive, a template body or a directive's branch
 * can't be formatted on its own: outside the template, a JSX element is an
 * expression statement and gets a `;`. So when the range is template content,
 * or its text doesn't parse on its own (`yield` outside its generator), the
 * second parse returns the file's tree, and `printer.js` prints only the
 * range's statements, where they are in it (`tsrxRange`).
 *
 * Prettier 3.9 can also grow a range to nodes that aren't statements: a
 * selection that starts in one child of an element and ends in another becomes
 * those children (prettier/prettier#19880 changes this after 3.9). One child,
 * an element or a directive, prints where it is. Several children print only
 * with the element's layout between them, and the range can't grow further,
 * so their text stays as it is, as does a range that doesn't start and end at
 * the same list's items (which #19880 can choose).
 */

/** A range format's state, from its first parse to its second. */
const RANGE = Symbol('tsrx range format');

/**
 * Where a range's statements are in the file's tree: the keys from the root
 * to a statement, or to a list of statements and the first and last of them.
 * @typedef {{ keys: Array<string | number>, first?: number, last?: number }} RangeStatements
 * @typedef {{
 *   text: string,
 *   start: number,
 *   ast: Node,
 *   piece?: Node,
 *   standalone?: { text: string, ast: Node },
 * }} RangeFormat
 * @typedef {{ locStart: (node: Node) => number, locEnd: (node: Node) => number }} Loc
 * @typedef {ParserOptions<Node> & {
 *   [RANGE]?: RangeFormat,
 *   cursorOffset: number,
 *   printer: { features?: { experimental_locForRangeFormat?: Loc } },
 * }} RangeOptions
 */

/**
 * @param {Parser<Node>} parser
 * @returns {Parser<Node>}
 */
export function withRangeFormatting(parser) {
	/** @type {Parser<Node>} */
	const rangeParser = {
		...parser,

		preprocess(text, parserOptions) {
			const options = /** @type {RangeOptions} */ (parserOptions);
			const range = options[RANGE];
			if (!range || options.parser !== 'typescript' || text === range.text) return text;
			// The second parse: `text` is the range, cut out of the file.
			const start = range.text.lastIndexOf(text, range.start);
			if (start === -1 || start + text.length < range.start) return text;
			const end = start + text.length;
			// Prettier locates the range with these (`calculateRange`).
			const loc = options.printer.features?.experimental_locForRangeFormat ?? parser;
			const found = findRange(range.ast, start, end, loc);
			if (!found?.printable) {
				const rangeText = { type: 'TSRXRangeText', start, end };
				range.piece = { type: 'Program', body: [rangeText], comments: [], start, end };
				return range.text;
			}
			const parts = directiveParts(range.ast);
			const inTemplate = (/** @type {Node} */ node) =>
				node.tsrxOutput ||
				node.tsrxCodeBlock ||
				parts.has(node) ||
				!/(?:Statement|Declaration)$/u.test(node.type);
			if (!found.nodes.some(inTemplate)) {
				try {
					range.standalone = { text, ast: /** @type {Node} */ (parser.parse(text, options)) };
					return text;
				} catch {
					// Print it where it is instead.
				}
			}
			range.ast.comments = /** @type {Node[]} */ (range.ast.comments).filter(
				(comment) => comment.start >= start && comment.end <= end,
			);
			range.ast.tsrxRange = found.where;
			range.piece = range.ast;
			// Prettier's cursor is in the range; the text is now the file.
			if (options.cursorOffset >= 0) options.cursorOffset += start;
			return range.text;
		},

		parse(text, options) {
			const rangeOptions = /** @type {RangeOptions} */ (options);
			const range = rangeOptions[RANGE];
			if (range?.piece && text === range.text) return range.piece;
			// Only for the range's text: an embed (a `<script>` body) parses its own.
			if (range?.standalone?.text === text) return range.standalone.ast;
			const ast = /** @type {Node} */ (parser.parse(text, options));
			if (
				!range &&
				options.parser === 'tsrx' &&
				(options.rangeStart > 0 || options.rangeEnd < text.length)
			) {
				rangeOptions[RANGE] = { text, start: contractedStart(text, options), ast };
				options.parser = 'typescript';
				options.plugins = [...options.plugins, { parsers: { typescript: rangeParser } }];
			}
			return ast;
		},
	};
	return rangeParser;
}

/**
 * Where Prettier's range starts once it skips the whitespace at its start
 * (`calculateRange`): the statements it chooses contain this offset.
 * @param {string} text
 * @param {ParserOptions<Node>} options
 * @returns {number}
 */
function contractedStart(text, { rangeStart, rangeEnd }) {
	const first = text.slice(rangeStart, rangeEnd).search(/\S/u);
	return first === -1 ? rangeStart : rangeStart + first;
}

/** Node types whose `body` (or, for a case, `consequent`) lists statements. */
const STATEMENT_LISTS = new Set([
	'Program',
	'BlockStatement',
	'StaticBlock',
	'TSModuleBlock',
	'SwitchCase',
]);

/** The nodes that print where they are on their own: a statement, an element, a directive. */
const PRINTABLE_ALONE = /(?:Statement|Declaration)$|^(?:DoExpression|JSXElement|JSXFragment)$/u;

/**
 * The nodes from `start` to `end`, as Prettier chooses them: consecutive items
 * of one list, or one node. `printable` tells whether they print where they
 * are: statements, or one element or directive.
 * @param {Node} ast
 * @param {number} start
 * @param {number} end
 * @param {Loc} loc
 * @returns {{ nodes: Node[], where: RangeStatements, printable: boolean } | undefined}
 */
function findRange(ast, start, end, { locStart, locEnd }) {
	/** @type {Array<{ node: Node, keys: Array<string | number> }>} */
	const queue = [{ node: ast, keys: [] }];
	for (let entry; (entry = queue.shift());) {
		const { node, keys } = entry;
		if (node !== ast && locStart(node) === start && locEnd(node) === end) {
			return { nodes: [node], where: { keys }, printable: PRINTABLE_ALONE.test(node.type) };
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'comments' || !value || typeof value !== 'object') continue;
			if (!Array.isArray(value)) {
				if (typeof value.type === 'string') queue.push({ node: value, keys: [...keys, key] });
				continue;
			}
			const first = value.findIndex((child) => child && locStart(child) === start);
			const last = value.findLastIndex((child) => child && locEnd(child) === end);
			if (first !== -1 && last >= first) {
				const statements =
					STATEMENT_LISTS.has(node.type) && (key === 'body' || key === 'consequent');
				if (first === last && !statements) {
					const child = value[first];
					const printable = PRINTABLE_ALONE.test(child.type);
					return { nodes: [child], where: { keys: [...keys, key, first] }, printable };
				}
				return {
					nodes: value.slice(first, last + 1),
					where: { keys: [...keys, key], first, last },
					printable: statements,
				};
			}
			value.forEach((child, index) => {
				if (typeof child?.type === 'string')
					queue.push({ node: child, keys: [...keys, key, index] });
			});
		}
	}
}

/** The parts of a directive that hold its bodies. */
const DIRECTIVE_PARTS = new Set(['BlockStatement', 'IfStatement', 'SwitchCase', 'CatchClause']);

/**
 * The parts of every directive (a `DoExpression` in the tree) down to their
 * bodies: the bodies, an `@else if`, an `@case`, a `@catch`.
 * @param {Node} ast
 * @returns {Set<Node>}
 */
function directiveParts(ast) {
	/** @type {Set<Node>} */
	const parts = new Set();
	/**
	 * @param {Node} node
	 * @param {boolean} inDirective
	 */
	const visit = (node, inDirective) => {
		const isPart = inDirective && DIRECTIVE_PARTS.has(node.type);
		if (isPart) parts.add(node);
		for (const [key, value] of Object.entries(node)) {
			if (key === 'comments' || !value || typeof value !== 'object') continue;
			// A body's statements are outputs or setup, not parts.
			const bodyStatements = node.type === 'BlockStatement' && Array.isArray(value);
			for (const child of Array.isArray(value) ? value : [value]) {
				if (typeof child?.type !== 'string') continue;
				visit(
					child,
					child.type === 'DoExpression' ||
						((isPart || node.type === 'DoExpression') && !bodyStatements),
				);
			}
		}
	};
	visit(ast, false);
	return parts;
}
