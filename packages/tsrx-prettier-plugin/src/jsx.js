/**
 * Prettier's layout of a JSX element's children, for the elements whose
 * children include TSRX comments (`// …` and `/* … *\/` between children,
 * which TSX reads as text). Every other element is printed by Prettier itself.
 *
 * `printJsxElementInternal` and `printJsxChildren` are copied from Prettier
 * 3.9.6 (`src/language-js/print/jsx.js`, MIT license, Copyright © James Long and
 * contributors). The only change is in `printJsxChildren`: a comment child
 * chooses the line breaks around it (see `printCommentChild`). Keep the rest in
 * step with Prettier when upgrading.
 *
 * @import { AstPath, Doc, ParserOptions } from 'prettier'
 * @import { Node } from './parse.js'
 */

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

/** @param {Node} node */
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

/** @param {Doc} doc */
const isEmptyStringOrAnyLine = (doc) =>
	doc === '' || doc === line || doc === hardline || doc === softline;

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
			// TSRX: a comment prints the `{" "}` beside it (`printCommentChild`).
			return {
				type: 'JSXText',
				value: ' ',
				raw: ' ',
				tsrxCommentSpace: child.tsrxCommentSpace,
				tsrxInCommentRun: child.tsrxInCommentRun,
			};
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

	// TSRX: a comment whose run renders a space prints it as JSX whitespace,
	// which needs `fill`, like text.
	const containsText = node.children.some(
		(/** @type {Node} */ child) =>
			isMeaningfulJsxText(child) ||
			(child.type === 'TSRXJSXComment' && child.run.space && !child.run.lineBreak),
	);

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
				multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), rawJsxWhitespace]);
				continue;
			}

			if (children[i - 1] === '' && children[i - 2] === hardline) {
				// Whitespace after line break
				multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), rawJsxWhitespace]);
				continue;
			}
		}

		if (i % 2 === 0) {
			// non-line-like
			multilineChildren.push([/** @type {Doc} */ (multilineChildren.pop()), child]);
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
	// TSRX: `{" "}`, written out.
	const rawWhitespace = options.singleQuote ? "{' '}" : '{" "}';
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
	// TSRX: set after a comment child, which already printed the line break or
	// space after itself.
	let afterComment = false;

	path.each((childPath) => {
		const { node, next } = /** @type {AstPath<Node>} */ (childPath);
		if (node.type === 'TSRXJSXComment') {
			printCommentChild(node);
			return;
		}
		// TSRX: the comment beside a `{" "}` prints it, and whitespace in a
		// comment's run keeps what the comment printed after itself.
		if (
			node.tsrxCommentSpace ||
			(node.tsrxInCommentRun && node.type === 'JSXText' && !/\n/u.test(getRaw(node)))
		) {
			return;
		}
		const followsComment = afterComment;
		if (!node.tsrxInCommentRun) afterComment = false;

		if (node.type === 'JSXText') {
			const text = getRaw(node);

			// Contains a non-whitespace character
			if (isMeaningfulJsxText(node)) {
				const words = jsxWhitespace.split(text, /* captureWhitespace */ true);

				// Starts with whitespace
				if (words[0] === '') {
					words.shift();
					if (followsComment) {
						// TSRX: the comment printed the separator.
					} else if (/\n/u.test(words[0])) {
						pushLine(separatorWithWhitespace(isFacebookTranslationTag, words[1], node, next));
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
						pushLine(separatorWithWhitespace(isFacebookTranslationTag, prevPart, node, next));
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
			} else if (!followsComment) {
				pushLine(whitespace);
			}
		} else {
			const printedChild = print();
			push(printedChild);

			const directlyFollowedByMeaningfulText = next && isMeaningfulJsxText(next);
			if (directlyFollowedByMeaningfulText) {
				const trimmed = jsxWhitespace.trim(getRaw(next));
				const [firstWord] = jsxWhitespace.split(trimmed);
				pushLine(separatorNoWhitespace(isFacebookTranslationTag, firstWord, node, next));
			} else {
				pushLine(hardline);
			}
		}
	}, 'children');

	return parts;

	/**
	 * TSRX: a comment keeps its place among the children. One on its own line
	 * stays on its own line; one after other content on the same line stays
	 * there, with the space the source has before it. A line comment always
	 * ends its line; a block comment keeps what followed it on its line.
	 *
	 * The whitespace around a group of comments renders as one run
	 * (`describeCommentRuns` in `parse.js`), so its outer sides are printed to
	 * render the same: a run that renders a space keeps it where a line may
	 * break (as `{" "}` there, like Prettier's JSX whitespace, or a line
	 * between two words), and a run with a line break keeps one, which the
	 * start or end of the children only has when the element breaks.
	 * @param {Node} comment
	 */
	function printCommentChild(comment) {
		const { run } = comment;
		const lineAfter = comment.commentType === 'Line' || comment.newlineAfter;
		/** @type {Doc} */
		let before = comment.newlineBefore ? hardline : comment.spaceBefore ? ' ' : '';
		/** @type {Doc} */
		let after = lineAfter ? hardline : comment.spaceAfter ? ' ' : '';
		const outerBefore = run.first;
		const outerAfter = run.last;
		if (!outerBefore) {
			// A line comment after another comment starts its own line: on the same
			// line, the parser reads it as text.
			before =
				run.gapBefore === 'line' || comment.commentType === 'Line'
					? hardline
					: run.gapBefore === 'space'
						? ' '
						: '';
		}
		if (
			run.space &&
			!run.lineBreak &&
			run.lineComment &&
			!(run.before === 'text' && run.after === 'text')
		) {
			// A line comment puts a line break in the run, so the space it renders
			// is written out, before the comments.
			if (outerBefore) before = rawWhitespace;
			if (outerAfter && !lineAfter) after = comment.spaceAfter ? ' ' : '';
		} else if (run.space && !run.lineBreak) {
			if (run.before === 'text' && run.after === 'text') {
				// Between two words, a line break renders the space too.
				if (outerBefore && comment.spaceBefore) before = line;
				if (outerAfter && comment.spaceAfter) after = line;
			} else if (run.after === 'boundary' || run.before === 'boundary') {
				// The start or end of the children has a line break when the element
				// breaks, so the space goes there, where it prints as `{" "}`.
				if (run.after === 'boundary') {
					if (outerAfter) after = whitespace;
					// That `{" "}` is the run's one space. A literal space before
					// the comment would stay on its line and render again once
					// the comment is gone.
					if (outerBefore && (run.before === 'boundary' || before === ' ')) before = '';
				} else if (outerBefore) {
					before = whitespace;
				}
			} else {
				// The space stays on its side; a line break there prints `{" "}`.
				const side = outerAfter && comment.spaceAfter ? 'after' : 'before';
				if (side === 'after') after = whitespace;
				else if (outerBefore && comment.spaceBefore) before = whitespace;
			}
		} else if (run.lineBreak) {
			// A space beside the start or end of the children renders nothing here.
			if (outerBefore && run.before === 'boundary' && !comment.newlineBefore) before = '';
			if (outerAfter && run.after === 'boundary' && !lineAfter) after = '';
		}
		// The line break at the start or end of the children is only there when
		// the element breaks. Without it, a space left in the run would render.
		const breaksAtEdge =
			run.lineBreak &&
			((outerBefore &&
				run.before === 'boundary' &&
				comment.newlineBefore &&
				(after === ' ' || !outerAfter)) ||
				(outerAfter && run.after === 'boundary' && lineAfter && (before === ' ' || !outerBefore)));

		if (parts.length > 1 && parts.at(-1) === '') {
			// Replace the separator printed after the previous child.
			parts[parts.length - 2] = before;
		} else {
			pushLine(before);
		}
		push(breaksAtEdge ? [print(), breakParent] : print());
		prevPart = after;
		parts.push(after, '');
		afterComment = true;
	}
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
