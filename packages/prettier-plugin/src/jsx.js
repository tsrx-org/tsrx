/**
 * Prettier's layout of a JSX element's children, for the elements whose
 * children include TSRX comments (`// …` and `/* … *\/` between children,
 * which TSX reads as text, and which `parse.js` gives Prettier as the `{…}`
 * children `{/* … *\/}` would be), for an element whose children render one
 * text that the compiler prints as one literal (`onlyTextEdges`), and for an
 * element that keeps its parentheses at the start of a statement
 * (`keepStatementParens`). Every other element is printed by Prettier itself.
 *
 * `printJsxElementInternal` and `printJsxChildren` are copied from Prettier
 * 3.9.9 (`src/language-js/print/jsx.js`, MIT license, Copyright © James Long and
 * contributors). The only changes are marked `TSRX:`. An element's only text
 * keeps the spaces at its edges (`printOnlyText`). In `printJsxChildren`, a
 * bare `//` differs from `{// … }`: a `//` is a comment only after
 * whitespace (or at the start of a line, or right after a tag), and it runs to
 * the end of its line. So a line comment ends its line, keeps whitespace
 * between it and text or a comment before it, and text that starts with `//`
 * (right after a block comment) stays on that line. And a `{" "}` never
 * follows an `@`, where TSRX would read `@{` as the start of a code block
 * (`endsWithAt`); an element whose text has an `@` before whitespace is printed
 * here for that (`hasAtBeforeWhitespace`). Keep the rest in step with Prettier
 * when upgrading.
 *
 * @import { AstPath, Doc, ParserOptions } from 'prettier'
 * @import { Node } from './parse.js'
 */

import { isLayoutWhitespace, renderChildren, wrapEdgeWhitespace } from '@tsrx/core';
import { builders, utils } from 'prettier/doc';

const {
	breakParent,
	conditionalGroup,
	cursor,
	fill,
	group,
	hardline,
	ifBreak,
	indent,
	join,
	line,
	softline,
} = builders;
const { findInDoc, willBreak } = utils;

/**
 * @typedef {(selector?: string | number | Array<string | number> | AstPath) => Doc} Print
 */

// Prettier's `jsxWhitespace`: only these characters are whitespace in JSX.
const jsxWhitespace = {
	/**
	 * @param {string} text
	 * @param {boolean} [captureWhitespace]
	 */
	split: (text, captureWhitespace = false) =>
		text.split(captureWhitespace ? /([ \n\r\t]+)/u : /[ \n\r\t]+/u),
	/** @param {string} text */
	trim: (text) => text.replace(/^[ \n\r\t]+|[ \n\r\t]+$/gu, ''),
	/** @param {string} text */
	hasNonWhitespaceCharacter: (text) => /[^ \n\r\t]/u.test(text),
};

/** @param {Node} node */
const getRaw = (node) => node.extra?.raw ?? node.raw;

/** @param {Node} node */
const isJsxElement = (node) => node.type === 'JSXElement' || node.type === 'JSXFragment';

/**
 * Meaningful if it contains non-whitespace characters, or it contains
 * whitespace without a new line.
 * @param {Node} node
 */
function isMeaningfulJsxText(node) {
	return (
		node.type === 'JSXText' &&
		(jsxWhitespace.hasNonWhitespaceCharacter(getRaw(node)) || !/\n/u.test(getRaw(node)))
	);
}

/**
 * An element without children, or with only whitespace that has a line break.
 * @param {Node} node
 */
function isEmptyJsxElement(node) {
	if (node.children.length === 0) return true;
	if (node.children.length > 1) return false;
	const child = node.children[0];
	return child.type === 'JSXText' && !isMeaningfulJsxText(child);
}

/**
 * Detect an expression node representing `{" "}`.
 * @param {Node} node
 */
function isJsxWhitespaceExpression(node) {
	return (
		node.type === 'JSXExpressionContainer' &&
		node.expression.type === 'Literal' &&
		node.expression.value === ' ' &&
		!node.expression.comments?.length
	);
}

/**
 * Prettier's `isEmptyDoc`: no text, and no line or other printed part.
 * `findInDoc` stops at the first result that isn't `undefined`, so an empty
 * string must not return one.
 * @param {Doc} doc
 */
function isEmptyDoc(doc) {
	return !findInDoc(
		doc,
		(part) =>
			(typeof part === 'string'
				? part !== ''
				: ['trim', 'line-suffix-boundary', 'line', 'break-parent'].includes(
						/** @type {{ type: string }} */ (part).type,
					)) || undefined,
		false,
	);
}

/**
 * TSRX: the line break around a line comment. Inside `{…}` it would be part of
 * the child; bare, it's a separator that Prettier's clean-up of the children,
 * which removes a line break before JSX whitespace, must leave in place.
 */
const lineCommentBreak = [hardline];

/** @param {Doc} doc */
const isEmptyStringOrAnyLine = (doc) =>
	doc === '' || doc === line || doc === hardline || doc === softline || doc === lineCommentBreak;

/**
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @returns {Doc}
 */
export function printJsxElementInternal(path, options, print) {
	const { node } = path;

	if (node.type === 'JSXElement' && isEmptyJsxElement(node)) {
		return [print('openingElement'), print('closingElement')];
	}

	// TSRX: an element's only rendered text keeps the spaces at its edges.
	const edges = onlyTextEdges(node);
	if (edges) return printOnlyText(path, options, print, edges);

	const openingLines =
		node.type === 'JSXElement' ? print('openingElement') : print('openingFragment');
	const closingLines =
		node.type === 'JSXElement' ? print('closingElement') : print('closingFragment');

	if (
		node.children.length === 1 &&
		node.children[0].type === 'JSXExpressionContainer' &&
		(node.children[0].expression.type === 'TemplateLiteral' ||
			node.children[0].expression.type === 'TaggedTemplateExpression')
	) {
		return [openingLines, ...path.map(print, 'children'), closingLines];
	}

	// Convert `{" "}` to text nodes containing a space.
	// This makes it easy to turn them into `jsxWhitespace` which
	// can then print as either a space or `{" "}` when breaking.
	node.children = node.children.map((/** @type {Node} */ child) => {
		if (isJsxWhitespaceExpression(child)) {
			return { type: 'JSXText', value: ' ', raw: ' ' };
		}
		return child;
	});

	const containsTag = node.children.some(isJsxElement);
	const containsMultipleExpressions =
		node.children.filter((/** @type {Node} */ child) => child.type === 'JSXExpressionContainer')
			.length > 1;
	const containsMultipleAttributes =
		node.type === 'JSXElement' && node.openingElement.attributes.length > 1;

	// Record any breaks. Should never go from true to false, only false to true.
	let forcedBreak =
		willBreak(openingLines) ||
		containsTag ||
		containsMultipleAttributes ||
		containsMultipleExpressions;

	const rawJsxWhitespace = options.singleQuote ? "{' '}" : '{" "}';
	const whitespace = ifBreak([rawJsxWhitespace, softline], ' ');

	const isFacebookTranslationTag = node.openingElement?.name?.name === 'fbt';

	const children = printJsxChildren(path, options, print, whitespace, isFacebookTranslationTag);

	const containsText = node.children.some(isMeaningfulJsxText);

	// We can end up we multiple whitespace elements with empty string
	// content between them.
	// We need to remove empty whitespace and softlines before JSX whitespace
	// to get the correct output.
	for (let i = children.length - 2; i >= 0; i--) {
		const isPairOfEmptyStrings = children[i] === '' && children[i + 1] === '';
		const isPairOfHardlines =
			children[i] === hardline && children[i + 1] === '' && children[i + 2] === hardline;
		const isLineFollowedByJsxWhitespace =
			(children[i] === softline || children[i] === hardline) &&
			children[i + 1] === '' &&
			children[i + 2] === whitespace;
		const isJsxWhitespaceFollowedByLine =
			children[i] === whitespace &&
			children[i + 1] === '' &&
			(children[i + 2] === softline || children[i + 2] === hardline);
		const isDoubleJsxWhitespace =
			children[i] === whitespace && children[i + 1] === '' && children[i + 2] === whitespace;
		const isPairOfHardOrSoftLines =
			(children[i] === softline && children[i + 1] === '' && children[i + 2] === hardline) ||
			(children[i] === hardline && children[i + 1] === '' && children[i + 2] === softline);

		// TSRX: a line break after a line comment's, as after `{// …}`.
		const isLineCommentBreakFollowedByHardline =
			children[i] === lineCommentBreak && children[i + 1] === '' && children[i + 2] === hardline;
		if (isLineCommentBreakFollowedByHardline && containsText) {
			children.splice(i + 1, 2);
			continue;
		}

		if (
			(isPairOfHardlines && containsText) ||
			isPairOfEmptyStrings ||
			isLineFollowedByJsxWhitespace ||
			isDoubleJsxWhitespace ||
			isPairOfHardOrSoftLines
		) {
			children.splice(i, 2);
		} else if (isJsxWhitespaceFollowedByLine) {
			children.splice(i + 1, 2);
		}
	}

	// Trim trailing lines (or empty strings)
	while (children.length > 0 && isEmptyStringOrAnyLine(/** @type {Doc} */ (children.at(-1)))) {
		children.pop();
	}

	// Trim leading lines (or empty strings)
	while (
		children.length > 1 &&
		isEmptyStringOrAnyLine(children[0]) &&
		isEmptyStringOrAnyLine(children[1])
	) {
		children.shift();
		children.shift();
	}

	// Tweak how we format children if outputting this element over multiple
	// lines. Also detect whether we will force this element to output over
	// multiple lines. Line-like docs stay at odd indexes (the rule of `fill()`).
	/** @type {Doc[]} */
	const multilineChildren = [''];
	for (const [i, child] of children.entries()) {
		// There are a number of situations where we need to ensure we display
		// whitespace as `{" "}` when outputting this element over multiple lines.
		if (child === whitespace) {
			if (i === 1 && isEmptyDoc(children[i - 1])) {
				if (children.length === 2) {
					// Solitary whitespace
					multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), rawJsxWhitespace]);
					continue;
				}
				// Leading whitespace
				multilineChildren.push([rawJsxWhitespace, hardline], '');
				continue;
			}

			if (i === children.length - 1) {
				// Trailing whitespace
				const previous = /** @type {Doc} */ (multilineChildren.pop());
				// TSRX: not right after an `@`, where `@{` would start a code block.
				multilineChildren.push([previous, endsWithAt(previous) ? hardline : '', rawJsxWhitespace]);
				continue;
			}

			if (
				children[i - 1] === '' &&
				(children[i - 2] === hardline || children[i - 2] === lineCommentBreak)
			) {
				// Whitespace after line break
				multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), rawJsxWhitespace]);
				continue;
			}
		}

		if (i % 2 === 0) {
			// non-line-like
			multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), child]);
		} else if (child === whitespace && endsWithAt(/** @type {Doc} */ (multilineChildren.at(-1)))) {
			// TSRX: a `{" "}` right after an `@` would start an `@{ … }` code block, so
			// where the line breaks, it starts the next line.
			multilineChildren.push(ifBreak([softline, rawJsxWhitespace], ' '), '');
		} else {
			// line-like
			multilineChildren.push(child, '');
		}

		if (willBreak(child)) {
			forcedBreak = true;
		}
	}

	// If there is text we use `fill` to fit as much onto each line as possible.
	// When there is no text (just tags and expressions) we use `group`
	// to output each on a separate line.
	/** @type {Doc} */
	let content = containsText
		? fill(multilineChildren)
		: group(multilineChildren, { shouldBreak: true });

	// `printJsxChildren` doesn't call `print` on `JSXText`, so print the cursor
	// around the children when it is inside one.
	const cursorOptions = /** @type {Record<string, any>} */ (options);
	if (
		cursorOptions.cursorNode?.type === 'JSXText' &&
		node.children.includes(cursorOptions.cursorNode)
	) {
		content = [cursor, content, cursor];
	} else if (
		cursorOptions.nodeBeforeCursor?.type === 'JSXText' &&
		node.children.includes(cursorOptions.nodeBeforeCursor)
	) {
		content = [cursor, content];
	} else if (
		cursorOptions.nodeAfterCursor?.type === 'JSXText' &&
		node.children.includes(cursorOptions.nodeAfterCursor)
	) {
		content = [content, cursor];
	}

	const multiLineElem = group([openingLines, indent([hardline, content]), hardline, closingLines]);

	if (forcedBreak) {
		return multiLineElem;
	}

	return conditionalGroup([group([openingLines, ...children, closingLines]), multiLineElem]);
}

/**
 * TSRX: where the children an element renders are one text that the compiler
 * prints as one literal (`{' a '}`, `wrapEdgeWhitespace` in `@tsrx/core`),
 * that text's index and which of its edges have a space or tab (no line break
 * in the whitespace there). The compiler does that for an element's only text
 * with a space or tab at an edge, so a `<textarea>`, a `<title>` or a
 * component that takes `children: string` gets one string (#1368). A comment
 * container before or after the text (`{/* c *\/}`, or a TSRX `/* c *\/`)
 * renders nothing, and the compiler leaves it out (`renderChildren`), unless it
 * holds a tooling comment such as `@ts-expect-error`. Prettier would print such
 * an edge as a `{" "}` child once the element breaks, which gives the element
 * two or three children. `null` for any other element, and so for a fragment,
 * whose only text the compiler splits, and for a text the compiler splits
 * anyway, which Prettier prints as before. The compiler is asked with the
 * reading of React, Preact and Hono; Solid and Vue keep the split for more
 * texts. Besides the text, only comments printed on its line are laid out: no
 * other text, and no TSRX `//` comment, which ends its line.
 * @param {Node} node
 * @returns {{ index: number, start: boolean, end: boolean } | null}
 */
export function onlyTextEdges(node) {
	if (node.type !== 'JSXElement') return null;
	const children = /** @type {Node[]} */ (node.children);
	const index = children.findIndex(
		(/** @type {Node} */ child) => child.type === 'JSXText' && !isLayoutWhitespace(child),
	);
	if (index === -1) return null;
	const text = children[index];
	let comments = false;
	for (const [i, child] of children.entries()) {
		if (i === index || isLayoutWhitespace(child)) continue;
		if (!isInlineCommentContainer(child)) return null;
		comments = true;
	}
	// Beside a comment, a text whose words can't go on separate lines is left to
	// Prettier: whether the compiler splits it depends on its line breaks, and
	// Prettier's layout keeps the spaces beside a comment, so the next format
	// would lay it out here.
	if (comments && !wordsCanBreak(text)) return null;
	const raw = getRaw(text);
	// Counted from each end: a regular expression ending in `$` tries every start
	// in a long run of whitespace.
	let start = 0;
	while (start < raw.length && isJsxWhitespaceCharacter(raw[start])) start++;
	let end = raw.length;
	while (end > start && isJsxWhitespaceCharacter(raw[end - 1])) end--;
	const edges = {
		index,
		start: start > 0 && !raw.slice(0, start).includes('\n'),
		end: end < raw.length && !raw.slice(end).includes('\n'),
	};
	if (start === end || !(edges.start || edges.end)) return null;
	const compilerText = { type: 'JSXText', raw, value: text.value, metadata: { path: [] } };
	const rendered = renderChildren(
		/** @type {any} */ ({
			type: 'JSXElement',
			children: children.map((/** @type {Node} */ child) =>
				child === text
					? compilerText
					: child.type === 'JSXText'
						? child
						: {
								type: 'JSXExpressionContainer',
								expression: {
									type: 'JSXEmptyExpression',
									innerComments: child.tsrxComment
										? [child.tsrxComment]
										: (child.expression.comments ?? []),
								},
							},
			),
		}),
	);
	if (rendered.length !== 1 || rendered[0] !== compilerText) return null;
	const compiled = wrapEdgeWhitespace(/** @type {any[]} */ ([compilerText]), true);
	return compiled.length === 1 && compiled[0].type === 'JSXExpressionContainer' ? edges : null;
}

/**
 * TSRX: a child that holds only a comment printed on one line with what comes
 * after it: `{/* c *\/}`, `{// c}` (whose `}` ends the line comment's line) or a
 * TSRX `/* c *\/`. A TSRX `// c` ends its line, so the text can't follow it.
 * @param {Node} child
 * @returns {boolean}
 */
function isInlineCommentContainer(child) {
	return (
		child.type === 'JSXExpressionContainer' &&
		child.expression.type === 'JSXEmptyExpression' &&
		child.tsrxComment?.type !== 'Line'
	);
}

/** @param {string} character */
const isJsxWhitespaceCharacter = (character) =>
	character === ' ' || character === '\n' || character === '\r' || character === '\t';

/**
 * TSRX: an element's only rendered text, which the compiler prints as one
 * literal (`onlyTextEdges`) and which stays one text. Its words fill lines as
 * Prettier fills text, and a space at an edge stays one, beside its tag: the
 * opening tag, the space and the first word start a line, and the last word,
 * the space and the closing tag end one. A comment before the text prints
 * after the opening tag, and one after it before the closing tag. An edge
 * without a space breaks as Prettier breaks it. A text whose words can't go on
 * separate lines (`wordsCanBreak`) stays on one line with its tags. Where the
 * element fits on one line, it stays there, as Prettier prints it, except that
 * several attributes don't break it.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @param {{ index: number, start: boolean, end: boolean }} edges
 * @returns {Doc}
 */
function printOnlyText(path, options, print, edges) {
	const { node } = path;
	const text = node.children[edges.index];
	const openingLines = print('openingElement');
	const closingLines = print('closingElement');
	/** @type {Doc[]} */
	const before = [];
	/** @type {Doc[]} */
	const after = [];
	// The comments around the text; text that renders nothing (a line break and
	// indentation) is left out, as the compiler leaves it out.
	/** @type {Node | undefined} */
	let firstAfter;
	path.each((childPath, index) => {
		if (index === edges.index || isLayoutWhitespace(childPath.node)) return;
		if (index > edges.index) firstAfter ??= /** @type {Node} */ (childPath.node);
		(index < edges.index ? before : after).push(print());
	}, 'children');
	const words = getRaw(text)
		.split(/[ \n\r\t]+/u)
		.filter((/** @type {string} */ word) => word !== '');
	const breaks = wordsCanBreak(text);
	// `print` isn't called on the text, so print the cursor around it, its
	// edges too, as Prettier's `mainPrint` prints it around a node: around the
	// text that holds it, after the text before it, and before the text after it.
	const cursorOptions = /** @type {Record<string, any>} */ (options);
	const [first, last] =
		cursorOptions.cursorNode === text
			? [cursor, cursor]
			: cursorOptions.nodeBeforeCursor === text
				? ['', cursor]
				: cursorOptions.nodeAfterCursor === text
					? [cursor, '']
					: ['', ''];
	/** @type {Doc[]} */
	const parts = breaks ? join(line, words) : [words.join(' ')];
	parts.push([
		/** @type {Doc} */ (parts.pop()),
		edges.end ? [' ', last, ...after, closingLines] : last,
	]);
	const edgeBreak = breaks ? softline : '';
	return group([
		openingLines,
		indent([
			...before,
			// A text right after a comment stays there: a TSRX `/* c */` before
			// `// …` keeps the `//` text, which at the start of a line would be a
			// comment.
			edges.start ? [first, ' '] : before.length ? first : [edgeBreak, first],
			fill(parts),
			edges.end || after.length === 0
				? ''
				: // A `{…}` comment after a text that ends in `@` stays on its own
					// line: `@{` would start a code block.
					[
						words.at(-1)?.endsWith('@') && !firstAfter?.tsrxComment ? hardline : edgeBreak,
						...after,
					],
		]),
		edges.end ? '' : [edgeBreak, closingLines],
	]);
}

/**
 * TSRX: whether the compiler still prints the text as one literal when it
 * spans lines. There it keeps the split where compilers trim a line's edge
 * differently (`only_text_value` in `@tsrx/core`): for whitespace other than
 * spaces, tabs and line breaks anywhere in the text, and for U+200B or a
 * reference to whitespace (`&#32;`, `&nbsp;`) next to a line break. A text
 * that has any of these stays on one line, where it compiles to one literal.
 * A reference to a space, tab or line break shows as whitespace that the
 * decoded text has and the text as written doesn't.
 * @param {Node} text
 * @returns {boolean}
 */
function wordsCanBreak(text) {
	if (/[^\S \t\n\r]|\u200b/u.test(text.value)) return false;
	/** @param {string} value */
	const whitespace = (value) => value.replaceAll('\r\n', '\n').replace(/[^ \t\n\r]/gu, '').length;
	return whitespace(text.value) === whitespace(getRaw(text));
}

/**
 * TSRX: whether the text a doc prints ends with `@`. TSRX reads `@{` in
 * markup as the start of a code block, so a `{" "}` can't follow it.
 * @param {Doc} doc
 * @returns {boolean}
 */
function endsWithAt(doc) {
	while (Array.isArray(doc)) {
		const last = doc.findLast((part) => part !== '');
		if (last === undefined) return false;
		doc = last;
	}
	return typeof doc === 'string' && doc.endsWith('@');
}

/**
 * TSRX: whether an element's or fragment's text has an `@` before whitespace,
 * where Prettier could print a `{" "}` (`printJsxElementInternal`).
 * @param {Node} node
 * @returns {boolean}
 */
export function hasAtBeforeWhitespace(node) {
	return node.children.some(
		(/** @type {Node} */ child) => child.type === 'JSXText' && /@[ \n\r\t]/u.test(getRaw(child)),
	);
}

/**
 * JSX children are strange, mostly for two reasons:
 * 1. JSX reads newlines into string values, instead of skipping them like JS
 * 2. up to one whitespace between elements within a line is significant,
 *    but not between lines.
 *
 * Leading, trailing, and lone whitespace all need to turn themselves into the
 * rather ugly `{' '}` when breaking.
 *
 * Returns a Doc array that satisfies the rule of `fill()`.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @param {Doc} whitespace
 * @param {boolean} isFacebookTranslationTag
 * @returns {Doc[]}
 */
function printJsxChildren(path, options, print, whitespace, isFacebookTranslationTag) {
	/** @type {Doc} */
	let prevPart = '';
	/** @type {Doc[]} */
	const parts = [prevPart];
	// To ensure rule of `fill()`, we use `push()` and `pushLine()` instead of `parts.push()`.
	/** @param {Doc} doc */
	function push(doc) {
		prevPart = doc;
		parts.push([/** @type {Doc} */ (parts.pop()), doc]);
	}
	/** @param {Doc} doc */
	function pushLine(doc) {
		if (doc === '') {
			return;
		}
		prevPart = doc;
		parts.push(doc, '');
	}

	// TSRX: whether the child before is a line comment, which ends its line.
	let afterLineComment = false;

	path.each((childPath) => {
		const { node, index, siblings, next } = /** @type {AstPath<Node>} */ (childPath);
		const followsLineComment = afterLineComment;
		afterLineComment = node.tsrxComment?.type === 'Line';
		if (node.type === 'JSXText') {
			const text = getRaw(node);

			// Contains a non-whitespace character
			if (isMeaningfulJsxText(node)) {
				const words = jsxWhitespace.split(text, /* captureWhitespace */ true);

				// Starts with whitespace
				if (words[0] === '') {
					words.shift();
					if (/\n/u.test(words[0])) {
						// TSRX: after a line comment, its line break separates them.
						if (!followsLineComment) {
							pushLine(separatorWithWhitespace(isFacebookTranslationTag, words[1], node, next));
						}
					} else {
						pushLine(whitespace);
					}
					words.shift();
				}

				let endWhitespace;
				// Ends with whitespace
				if (words.at(-1) === '') {
					words.pop();
					endWhitespace = words.pop();
				}

				// This was whitespace only without a new line.
				if (words.length === 0) {
					return;
				}

				for (const [i, word] of words.entries()) {
					if (i % 2 === 1) {
						pushLine(line);
					} else {
						push(word);
					}
				}

				if (endWhitespace !== undefined) {
					if (/\n/u.test(endWhitespace)) {
						// TSRX: the line break between an `@` and a `{` stays, where `@{`
						// would start a code block.
						pushLine(
							endsWithAt(prevPart) &&
								((next?.type === 'JSXExpressionContainer' && !next.tsrxComment) ||
									next?.type === 'JSXSpreadChild')
								? hardline
								: separatorWithWhitespace(isFacebookTranslationTag, prevPart, node, next),
						);
					} else {
						pushLine(whitespace);
					}
				} else {
					pushLine(separatorNoWhitespace(isFacebookTranslationTag, prevPart, node, next));
				}
			} else if (/\n/u.test(text)) {
				// Keep (up to one) blank line between tags/expressions/text.
				// Note: We don't keep blank lines between text elements.
				if (/** @type {RegExpMatchArray} */ (text.match(/\n/gu)).length > 1) {
					pushLine(hardline);
				}
			} else {
				pushLine(whitespace);
			}
		} else {
			const printedChild = print();
			const lineComment = node.tsrxComment?.type === 'Line';
			// TSRX: a line comment after text or a comment needs whitespace before
			// it: touching them, it would be text. Where Prettier would leave no
			// space (a line break in the source), it starts its own line.
			if (
				lineComment &&
				followsText(/** @type {Node[]} */ (siblings), /** @type {number} */ (index)) &&
				!(parts.length > 1 && parts.at(-1) === '' && parts.at(-2) === whitespace)
			) {
				if (parts.length > 1 && parts.at(-1) === '') parts[parts.length - 2] = lineCommentBreak;
				else pushLine(lineCommentBreak);
			}
			push(printedChild);

			const directlyFollowedByMeaningfulText = next && isMeaningfulJsxText(next);
			if (lineComment) {
				// TSRX: a line comment ends its line.
				pushLine(lineCommentBreak);
			} else if (directlyFollowedByMeaningfulText) {
				const trimmed = jsxWhitespace.trim(getRaw(next));
				const [firstWord] = jsxWhitespace.split(trimmed);
				// TSRX: text that starts with `//` right after a block comment is
				// text only there; at the start of a line, it would be a comment.
				if (!(node.tsrxComment && getRaw(next).startsWith('//'))) {
					pushLine(separatorNoWhitespace(isFacebookTranslationTag, firstWord, node, next));
				}
			} else {
				pushLine(hardline);
			}
		}
	}, 'children');

	return parts;
}

/**
 * TSRX: whether text or a comment, rather than an element or an expression,
 * comes before the child at `index`, past any whitespace, which Prettier may put
 * on one line. A line comment there would be text.
 * @param {Node[]} siblings
 * @param {number} index
 * @returns {boolean}
 */
function followsText(siblings, index) {
	for (let i = index - 1; i >= 0; i--) {
		const sibling = siblings[i];
		if (sibling.tsrxComment) return true;
		if (sibling.type !== 'JSXText') return false;
		if (jsxWhitespace.hasNonWhitespaceCharacter(getRaw(sibling))) return true;
	}
	return false;
}

/**
 * @param {boolean} isFacebookTranslationTag
 * @param {Doc} child
 * @param {Node} childNode
 * @param {Node | null | undefined} nextNode
 * @returns {Doc}
 */
function separatorNoWhitespace(isFacebookTranslationTag, child, childNode, nextNode) {
	if (isFacebookTranslationTag) {
		return '';
	}

	if (
		(childNode.type === 'JSXElement' && !childNode.closingElement) ||
		(nextNode?.type === 'JSXElement' && !nextNode.closingElement)
	) {
		return /** @type {string} */ (child).length === 1 ? softline : hardline;
	}

	return softline;
}

/**
 * @param {boolean} isFacebookTranslationTag
 * @param {Doc} child
 * @param {Node} childNode
 * @param {Node | null | undefined} nextNode
 * @returns {Doc}
 */
function separatorWithWhitespace(isFacebookTranslationTag, child, childNode, nextNode) {
	if (isFacebookTranslationTag) {
		return hardline;
	}

	if (/** @type {string} */ (child).length === 1) {
		return (childNode.type === 'JSXElement' && !childNode.closingElement) ||
			(nextNode?.type === 'JSXElement' && !nextNode.closingElement)
			? hardline
			: softline;
	}

	return hardline;
}
