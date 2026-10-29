/*!
 * `tsrx/jsx-curly-brace-presence` is copied from eslint-plugin-react 7.37.5,
 * `lib/rules/jsx-curly-brace-presence.js`:
 *
 * @fileoverview Enforce curly braces or disallow unnecessary curly brace in JSX
 * @author Jacky Ho
 * @author Simon Lydell
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Yannick Croissant
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * `react/jsx-curly-brace-presence` for TSRX text, with the same options and
 * messages. Apart from types and calling ESLint's API directly, the only
 * changes, marked `TSRX:`, keep the braces around a child that TSRX would read
 * differently once unwrapped: text that starts a directive (`@if (`) or a
 * comment (`//`), joins a comment or a directive's clause beside it, or turns a
 * `<style>` into a scoped style block. Keep the rest in step with
 * eslint-plugin-react when upgrading.
 */
import type { Rule } from 'eslint';

type AnyNode = Record<string, any>;

const OPTION_ALWAYS = 'always';
const OPTION_NEVER = 'never';
const OPTION_IGNORE = 'ignore';

const OPTION_VALUES = [OPTION_ALWAYS, OPTION_NEVER, OPTION_IGNORE];
const DEFAULT_CONFIG = {
	props: OPTION_NEVER,
	children: OPTION_NEVER,
	propElementValues: OPTION_IGNORE,
};

const HTML_ENTITY_REGEX = () => /&[A-Za-z\d#]+;/g;

function containsLineTerminators(rawStringValue: string) {
	return /[\n\r\u2028\u2029]/.test(rawStringValue);
}

function containsBackslash(rawStringValue: string) {
	return rawStringValue.includes('\\');
}

function containsHTMLEntity(rawStringValue: string) {
	return HTML_ENTITY_REGEX().test(rawStringValue);
}

function containsOnlyHtmlEntities(rawStringValue: string) {
	return rawStringValue.replace(HTML_ENTITY_REGEX(), '').trim() === '';
}

function containsDisallowedJSXTextChars(rawStringValue: string) {
	return /[{<>}]/.test(rawStringValue);
}

function containsQuoteCharacters(value: string) {
	return /['"]/.test(value);
}

function containsMultilineComment(value: string) {
	return /\/\*/.test(value);
}

function escapeDoubleQuotes(rawStringValue: string) {
	return rawStringValue.replace(/\\"/g, '"').replace(/"/g, '\\"');
}

function escapeBackslashes(rawStringValue: string) {
	return rawStringValue.replace(/\\/g, '\\\\');
}

function needToEscapeCharacterForJSX(raw: string, node: AnyNode) {
	return (
		containsBackslash(raw) ||
		containsHTMLEntity(raw) ||
		(node.parent.type !== 'JSXAttribute' && containsDisallowedJSXTextChars(raw))
	);
}

function isJSX(node: AnyNode | null | undefined) {
	return !!node && (node.type === 'JSXElement' || node.type === 'JSXFragment');
}

function isWhiteSpaces(value: unknown) {
	return typeof value === 'string' ? /^\s*$/.test(value) : false;
}

function containsWhitespaceExpression(child: AnyNode) {
	if (child.type === 'JSXExpressionContainer') {
		const value = child.expression.value;
		return value ? isWhiteSpaces(value) : false;
	}
	return false;
}

function isLineBreak(text: string) {
	return containsLineTerminators(text) && text.trim() === '';
}

function wrapNonHTMLEntities(text: string) {
	const HTML_ENTITY = '<HTML_ENTITY>';
	const withCurlyBraces = text
		.split(HTML_ENTITY_REGEX())
		.map((word) => (word === '' ? '' : `{${JSON.stringify(word)}}`))
		.join(HTML_ENTITY);

	const htmlEntities = text.match(HTML_ENTITY_REGEX())!;
	return htmlEntities.reduce(
		(acc, htmlEntity) => acc.replace(HTML_ENTITY, htmlEntity),
		withCurlyBraces,
	);
}

function wrapWithCurlyBraces(rawText: string) {
	if (!containsLineTerminators(rawText)) {
		return `{${JSON.stringify(rawText)}}`;
	}

	return rawText
		.split('\n')
		.map((line) => {
			if (line.trim() === '') {
				return line;
			}
			const firstCharIndex = line.search(/[^\s]/);
			const leftWhitespace = line.slice(0, firstCharIndex);
			const text = line.slice(firstCharIndex);

			if (containsHTMLEntity(line)) {
				return `${leftWhitespace}${wrapNonHTMLEntities(text)}`;
			}
			return `${leftWhitespace}{${JSON.stringify(text)}}`;
		})
		.join('\n');
}

function isWhiteSpaceLiteral(node: AnyNode) {
	return node.type && node.type === 'Literal' && node.value && isWhiteSpaces(node.value);
}

function isStringWithTrailingWhiteSpaces(value: string) {
	return /^\s|\s$/.test(value);
}

function isLiteralWithTrailingWhiteSpaces(node: AnyNode) {
	return (
		node.type &&
		node.type === 'Literal' &&
		node.value &&
		isStringWithTrailingWhiteSpaces(node.value)
	);
}

/** TSRX: the directives, whose clauses (`@else`, `catch (e)`) text could continue. */
const DIRECTIVE_TYPES = new Set([
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
]);

/**
 * TSRX: whether `<style>` or `<script>` holds `node`. The first child of a
 * `<style>` decides what it is: text makes it a scoped style block, while
 * `{css}` keeps it an ordinary element. A `<script>` body is raw text.
 */
function is_in_raw_text_element(node: AnyNode) {
	const name = node.parent?.openingElement?.name;
	return name?.type === 'JSXIdentifier' && (name.name === 'style' || name.name === 'script');
}

/**
 * TSRX: whether an expression container or an attribute holds `element`, at any
 * depth. A cut parsed on its own doesn't reproduce that context.
 */
function is_in_expression(element: AnyNode) {
	for (let node = element.parent; node; node = node.parent) {
		if (node.type === 'JSXExpressionContainer' || node.type === 'JSXAttribute') return true;
	}
	return false;
}

/** TSRX: the nearest child before (`step` -1) or after (1) `index` that isn't text. */
function non_text_sibling(children: AnyNode[], index: number, step: number) {
	let at = index + step;
	while (children[at]?.type === 'JSXText') at += step;
	return at;
}

/**
 * TSRX: whether unwrapping the child `node` into `replacement` could read as
 * TSRX syntax:
 *
 * - its text, joined with the text beside it, has `@`, `/`, `*` or `&`;
 * - a comment follows the braces directly;
 * - the nearest sibling before it that isn't text is a directive, whose clause
 *   the text could continue;
 * - a `<style>` or `<script>` holds it;
 * - inside an expression container, the element holds a directive.
 *
 * Anything else reads as the same text in TSRX as in JSX.
 */
function may_read_as_tsrx_syntax(node: AnyNode, replacement: string, sourceCode: AnyNode) {
	if (is_in_raw_text_element(node)) return true;
	const children: AnyNode[] = node.parent.children;
	const index = children.indexOf(node);
	const text_of = (child: AnyNode | undefined) =>
		child?.type === 'JSXText' ? sourceCode.getText(child) : '';
	const run = text_of(children[index - 1]) + replacement + text_of(children[index + 1]);
	return (
		/[@/*&]/.test(run) ||
		sourceCode.text[node.range[1]] === '/' ||
		DIRECTIVE_TYPES.has(children[non_text_sibling(children, index, -1)]?.type) ||
		(is_in_expression(node.parent) && children.some((child) => DIRECTIVE_TYPES.has(child.type)))
	);
}

/**
 * TSRX: a parse function from the file's parser, or `null`. A parser with only
 * `parse` gives no diagnostics.
 */
function parser_of(context: Rule.RuleContext) {
	const parser = (context.languageOptions as AnyNode)?.parser;
	const options = { ...context.languageOptions.parserOptions, filePath: context.filename };
	if (typeof parser?.parseForESLint === 'function') {
		return (code: string) => parser.parseForESLint(code, options);
	}
	if (typeof parser?.parse === 'function') {
		return (code: string) => ({ ast: parser.parse(code, options) });
	}
	return null;
}

/** TSRX: each child's type, with adjacent text joined. */
function children_shape(children: AnyNode[]) {
	const out: Array<{ type: string; value?: string }> = [];
	for (const child of children) {
		const previous = out.at(-1);
		if (child.type === 'JSXText' && previous?.type === 'JSXText') {
			previous.value += child.value;
		} else {
			out.push({ type: child.type, value: child.type === 'JSXText' ? child.value : undefined });
		}
	}
	return JSON.stringify(out);
}

/** TSRX: the comments inside `range`. */
function count_comments(comments: AnyNode[] | undefined, range: [number, number]) {
	return (comments ?? []).filter(
		(comment) => comment.range[0] >= range[0] && comment.range[1] <= range[1],
	).length;
}

/**
 * TSRX: whether unwrapping the child `node` into `replacement`, which parses as
 * a `type` child, keeps the element around it as it was: its comments, its
 * diagnostics and its children, with the new text joined to the text beside
 * it. The parser of the file reads the element before and after the edit:
 *
 * - usually only a cut of it, from the nearest child before `node` that isn't
 *   text to the nearest one after, in a bare tag of its own;
 * - the top-level statement around the element when it sits in an expression
 *   container or an attribute, a context the cut can't reproduce. Parsed on
 *   its own, a top-level statement reads as it does in the file. A file gets
 *   `STATEMENT_PARSE_LIMIT` of these, and past them the braces stay.
 *
 * Without a parser, and for the first child of a `<style>`, the braces stay.
 */
function unwraps_to_the_same_children(
	context: Rule.RuleContext,
	state: CheckState,
	node: AnyNode,
	replacement: string,
	type: string,
) {
	const parse = parser_of(context);
	if (!parse) return false;
	const text = context.sourceCode.text;
	const element = node.parent;
	const children: AnyNode[] = element.children;
	const index = children.indexOf(node);
	// The first child of a `<style>` decides what it is. Any other child leaves
	// it an ordinary element, whose children read like any element's.
	if (
		is_in_raw_text_element(node) &&
		children.slice(0, index).every((child) => child.type === 'JSXText' && !child.value.trim())
	) {
		return false;
	}
	const expected = (nodes: AnyNode[], at: number) =>
		children_shape(
			nodes.map((child) =>
				child.range[0] === at
					? { type, value: type === 'JSXText' ? replacement : undefined }
					: child,
			),
		);
	const read = (code: string) => {
		try {
			const result = parse(code);
			return { ast: result.ast, diagnostics: result.services?.tsrxDiagnostics?.length ?? 0 };
		} catch {
			return null;
		}
	};

	if (is_in_expression(element)) {
		if (state.statement_parses >= STATEMENT_PARSE_LIMIT) return false;
		state.statement_parses++;
		let statement = element;
		while (statement.parent && statement.parent.type !== 'Program') statement = statement.parent;
		const [statement_start, statement_end] = statement.range;
		let before = state.statements.get(statement);
		if (before === undefined) {
			before = read(text.slice(statement_start, statement_end));
			state.statements.set(statement, before);
		}
		const after = read(
			text.slice(statement_start, node.range[0]) +
				replacement +
				text.slice(node.range[1], statement_end),
		);
		const element_start = element.range[0] - statement_start;
		const before_element = before && find_element(before.ast.body, element_start);
		const after_element = after && find_element(after.ast.body, element_start);
		if (!before_element || !after_element) return false;
		return (
			after_element.type === before_element.type &&
			count_comments(after!.ast.comments, after_element.range) ===
				count_comments(before!.ast.comments, before_element.range) &&
			after!.diagnostics === before!.diagnostics &&
			children_shape(after_element.children) ===
				expected(before_element.children, node.range[0] - statement_start)
		);
	}

	const [start, end] = neighborhood(node);
	// The element's name, without its attributes. TSRX can read text after a
	// directive's block differently before another closing tag.
	const name =
		element.type === 'JSXFragment' ? '' : text.slice(...element.openingElement.name.range);
	// The children of a `<style>` read like any element's once `{…}` leads them.
	const open = `<${name}>` + (is_in_raw_text_element(node) ? '{0}' : '');
	const close = `</${name}>`;
	// Statement level, not in parentheses: TSRX reads some text after a
	// directive's block more strictly there, so the check errs toward the braces.
	const prefix = 'export const tsrx = ' + open;
	const suffix = close + ';\n';
	const root = (result: { ast: AnyNode } | null) =>
		result?.ast.body[0]?.declaration?.declarations?.[0]?.init;
	const before = read(prefix + text.slice(start, end) + suffix);
	const after = read(
		prefix +
			text.slice(start, node.range[0]) +
			replacement +
			text.slice(node.range[1], end) +
			suffix,
	);
	const before_root = root(before);
	const after_root = root(after);
	if (!before_root?.children || !after_root?.children) return false;
	return (
		after_root.type === before_root.type &&
		after!.ast.comments?.length === before!.ast.comments?.length &&
		after!.diagnostics === before!.diagnostics &&
		children_shape(after_root.children) ===
			expected(before_root.children, node.range[0] - start + prefix.length)
	);
}

/**
 * TSRX: the source range from the nearest child before `node` that isn't text
 * to the nearest one after, or to the start or end of the element's children.
 */
function neighborhood(node: AnyNode): [number, number] {
	const element = node.parent;
	const children: AnyNode[] = element.children;
	const index = children.indexOf(node);
	const first = non_text_sibling(children, index, -1);
	const last = non_text_sibling(children, index, 1);
	return [
		first >= 0
			? children[first].range[0]
			: (element.openingElement ?? element.openingFragment).range[1],
		last < children.length
			? children[last].range[1]
			: (element.closingElement ?? element.closingFragment).range[0],
	];
}

/**
 * TSRX: how many children in expression containers one file may check by
 * parsing their top-level statement, at about one parse each. No file in the
 * repo checks any.
 */
export const STATEMENT_PARSE_LIMIT = 50;

/** TSRX: what the checks of one file share. */
interface CheckState {
	statement_parses: number;
	/** Each top-level statement's parse before any edit. */
	statements: Map<AnyNode, { ast: AnyNode; diagnostics: number } | null>;
}

/**
 * TSRX: the source range from the end of the nearest child before `node` that
 * isn't text to the start of the nearest one after, or to the start or end of
 * the element's children.
 */
function between_neighbors(node: AnyNode): [number, number] {
	const element = node.parent;
	const children: AnyNode[] = element.children;
	const index = children.indexOf(node);
	const first = non_text_sibling(children, index, -1);
	const last = non_text_sibling(children, index, 1);
	return [
		first >= 0
			? children[first].range[1]
			: (element.openingElement ?? element.openingFragment).range[1],
		last < children.length
			? children[last].range[0]
			: (element.closingElement ?? element.closingFragment).range[0],
	];
}

const ELEMENT_TYPES = new Set(['JSXElement', 'JSXFragment', 'JSXStyleElement']);

/** TSRX: the first element or fragment in `node` that starts at `start`. */
function find_element(node: AnyNode, start: number): AnyNode | null {
	if (!node || typeof node !== 'object') return null;
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = find_element(child, start);
			if (found) return found;
		}
		return null;
	}
	if (node.range && (node.range[1] < start || node.range[0] > start)) return null;
	if (ELEMENT_TYPES.has(node.type) && node.range?.[0] === start) return node;
	for (const key of Object.keys(node)) {
		if (key === 'parent' || key === 'loc' || key === 'range' || key === 'metadata') continue;
		const found = find_element(node[key], start);
		if (found) return found;
	}
	return null;
}

const messages = {
	unnecessaryCurly: 'Curly braces are unnecessary here.',
	missingCurly: 'Need to wrap this literal in a JSX expression.',
};

const rule: Rule.RuleModule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow unnecessary JSX expressions when literals alone are sufficient or enforce JSX expressions on literals in JSX children or attributes, without unwrapping text that TSRX reads as syntax',
		},
		fixable: 'code',

		messages,

		schema: [
			{
				anyOf: [
					{
						type: 'object',
						properties: {
							props: { enum: OPTION_VALUES },
							children: { enum: OPTION_VALUES },
							propElementValues: { enum: OPTION_VALUES },
						},
						additionalProperties: false,
					},
					{
						enum: OPTION_VALUES,
					},
				],
			},
		],
	},

	create(context) {
		const sourceCode = context.sourceCode;
		const getText = (node: AnyNode) => sourceCode.getText(node as Rule.Node);
		// TSRX: what the checks of this file share.
		const state: CheckState = { statement_parses: 0, statements: new Map() };
		const ruleOptions = context.options[0];
		const userConfig =
			typeof ruleOptions === 'string'
				? { props: ruleOptions, children: ruleOptions, propElementValues: OPTION_IGNORE }
				: Object.assign({}, DEFAULT_CONFIG, ruleOptions);

		/**
		 * Report and fix an unnecessary curly brace violation on a node
		 */
		function reportUnnecessaryCurly(JSXExpressionNode: AnyNode) {
			context.report({
				node: JSXExpressionNode as Rule.Node,
				messageId: 'unnecessaryCurly',
				fix(fixer) {
					const expression = JSXExpressionNode.expression;

					let textToReplace;
					if (isJSX(expression)) {
						textToReplace = getText(expression);
					} else {
						const expressionType = expression && expression.type;
						const parentType = JSXExpressionNode.parent.type;

						if (parentType === 'JSXAttribute') {
							if (expressionType !== 'TemplateLiteral' && /["]/.test(expression.raw.slice(1, -1))) {
								textToReplace = expression.raw;
							} else {
								textToReplace = `"${
									expressionType === 'TemplateLiteral'
										? expression.quasis[0].value.raw
										: expression.raw.slice(1, -1)
								}"`;
							}
						} else if (isJSX(expression)) {
							textToReplace = getText(expression);
						} else {
							textToReplace =
								expressionType === 'TemplateLiteral'
									? expression.quasis[0].value.cooked
									: expression.value;
						}
					}

					// TSRX: a child's fix also spans the text beside it, up to the nearest
					// child on each side that isn't text. Fixes that would touch the same
					// text then go in separate passes, each checked against the code it
					// edits.
					if (JSXExpressionNode.parent.type !== 'JSXAttribute') {
						const [start, end] = between_neighbors(JSXExpressionNode);
						const [node_start, node_end] = JSXExpressionNode.range;
						return fixer.replaceTextRange(
							[start, end],
							sourceCode.text.slice(start, node_start) +
								textToReplace +
								sourceCode.text.slice(node_end, end),
						);
					}
					return fixer.replaceText(JSXExpressionNode as Rule.Node, textToReplace);
				},
			});
		}

		function reportMissingCurly(literalNode: AnyNode) {
			context.report({
				node: literalNode as Rule.Node,
				messageId: 'missingCurly',
				fix(fixer) {
					if (isJSX(literalNode)) {
						return fixer.replaceText(literalNode as Rule.Node, `{${getText(literalNode)}}`);
					}

					// If a HTML entity name is found, bail out because it can be fixed
					// by either using the real character or the unicode equivalent.
					// If it contains any line terminator character, bail out as well.
					if (
						containsOnlyHtmlEntities(literalNode.raw) ||
						(literalNode.parent.type === 'JSXAttribute' &&
							containsLineTerminators(literalNode.raw)) ||
						isLineBreak(literalNode.raw)
					) {
						return null;
					}

					const expression =
						literalNode.parent.type === 'JSXAttribute'
							? `{"${escapeDoubleQuotes(escapeBackslashes(literalNode.raw.slice(1, -1)))}"}`
							: wrapWithCurlyBraces(literalNode.raw);

					return fixer.replaceText(literalNode as Rule.Node, expression);
				},
			});
		}

		// Bail out if there is any character that needs to be escaped in JSX
		// because escaping decreases readability and the original code may be more
		// readable anyway or intentional for other specific reasons
		function lintUnnecessaryCurly(JSXExpressionNode: AnyNode) {
			const expression = JSXExpressionNode.expression;
			const expressionType = expression.type;

			// Curly braces containing comments are necessary
			if (sourceCode.getCommentsInside(JSXExpressionNode as Rule.Node).length > 0) {
				return;
			}

			// TSRX: braces that keep a child from reading as TSRX syntax are necessary.
			const keepsTsrxBraces = (replacement: string, type: string) =>
				JSXExpressionNode.parent.type !== 'JSXAttribute' &&
				may_read_as_tsrx_syntax(JSXExpressionNode, replacement, sourceCode) &&
				!unwraps_to_the_same_children(context, state, JSXExpressionNode, replacement, type);

			if (
				(expressionType === 'Literal' || expressionType === 'JSXText') &&
				typeof expression.value === 'string' &&
				((JSXExpressionNode.parent.type === 'JSXAttribute' && !isWhiteSpaceLiteral(expression)) ||
					!isLiteralWithTrailingWhiteSpaces(expression)) &&
				!containsMultilineComment(expression.value) &&
				!needToEscapeCharacterForJSX(expression.raw, JSXExpressionNode) &&
				(isJSX(JSXExpressionNode.parent) ||
					!containsQuoteCharacters(expression.value) ||
					typeof expression.value === 'string')
			) {
				if (keepsTsrxBraces(expression.value, 'JSXText')) return;
				reportUnnecessaryCurly(JSXExpressionNode);
			} else if (
				expressionType === 'TemplateLiteral' &&
				expression.expressions.length === 0 &&
				expression.quasis[0].value.raw.indexOf('\n') === -1 &&
				!isStringWithTrailingWhiteSpaces(expression.quasis[0].value.raw) &&
				!needToEscapeCharacterForJSX(expression.quasis[0].value.raw, JSXExpressionNode) &&
				!containsQuoteCharacters(expression.quasis[0].value.cooked)
			) {
				if (keepsTsrxBraces(expression.quasis[0].value.cooked, 'JSXText')) return;
				reportUnnecessaryCurly(JSXExpressionNode);
			} else if (isJSX(expression)) {
				if (keepsTsrxBraces(getText(expression), expression.type)) return;
				reportUnnecessaryCurly(JSXExpressionNode);
			}
		}

		function areRuleConditionsSatisfied(parent: AnyNode, config: AnyNode, ruleCondition: string) {
			return (
				(parent.type === 'JSXAttribute' &&
					typeof config.props === 'string' &&
					config.props === ruleCondition) ||
				(isJSX(parent) && typeof config.children === 'string' && config.children === ruleCondition)
			);
		}

		function getAdjacentSiblings(node: AnyNode, children: AnyNode[]) {
			for (let i = 1; i < children.length - 1; i++) {
				const child = children[i];
				if (node === child) {
					return [children[i - 1], children[i + 1]];
				}
			}
			if (node === children[0] && children[1]) {
				return [children[1]];
			}
			if (node === children[children.length - 1] && children[children.length - 2]) {
				return [children[children.length - 2]];
			}
			return [];
		}

		function hasAdjacentJsxExpressionContainers(node: AnyNode, children: AnyNode[] | undefined) {
			if (!children) {
				return false;
			}
			const childrenExcludingWhitespaceLiteral = children.filter(
				(child) => !isWhiteSpaceLiteral(child),
			);
			const adjSiblings = getAdjacentSiblings(node, childrenExcludingWhitespaceLiteral);

			return adjSiblings.some((x) => x.type && x.type === 'JSXExpressionContainer');
		}

		function hasAdjacentJsx(node: AnyNode, children: AnyNode[] | undefined) {
			if (!children) {
				return false;
			}
			const childrenExcludingWhitespaceLiteral = children.filter(
				(child) => !isWhiteSpaceLiteral(child),
			);
			const adjSiblings = getAdjacentSiblings(node, childrenExcludingWhitespaceLiteral);

			return adjSiblings.some(
				(x) => x.type && (x.type === 'JSXExpressionContainer' || x.type === 'JSXElement'),
			);
		}

		function shouldCheckForUnnecessaryCurly(node: AnyNode, config: AnyNode) {
			const parent = node.parent;
			// Bail out if the parent is a JSXAttribute & its contents aren't
			// StringLiteral or TemplateLiteral since e.g
			// <App prop1={<CustomEl />} prop2={<CustomEl>...</CustomEl>} />

			if (
				parent.type &&
				parent.type === 'JSXAttribute' &&
				node.expression &&
				node.expression.type &&
				node.expression.type !== 'Literal' &&
				node.expression.type !== 'StringLiteral' &&
				node.expression.type !== 'TemplateLiteral'
			) {
				return false;
			}

			// If there are adjacent `JsxExpressionContainer` then there is no need,
			// to check for unnecessary curly braces.
			if (isJSX(parent) && hasAdjacentJsxExpressionContainers(node, parent.children)) {
				return false;
			}
			if (containsWhitespaceExpression(node) && hasAdjacentJsx(node, parent.children)) {
				return false;
			}
			if (parent.children && parent.children.length === 1 && containsWhitespaceExpression(node)) {
				return false;
			}

			return areRuleConditionsSatisfied(parent, config, OPTION_NEVER);
		}

		function shouldCheckForMissingCurly(node: AnyNode, config: AnyNode) {
			if (isJSX(node)) {
				return config.propElementValues !== OPTION_IGNORE;
			}
			if (isLineBreak(node.raw) || containsOnlyHtmlEntities(node.raw)) {
				return false;
			}
			const parent = node.parent;
			if (
				parent.children &&
				parent.children.length === 1 &&
				containsWhitespaceExpression(parent.children[0])
			) {
				return false;
			}
			// TSRX: the text of a `<style>` or `<script>` is raw.
			if (is_in_raw_text_element(node)) {
				return false;
			}

			return areRuleConditionsSatisfied(parent, config, OPTION_ALWAYS);
		}

		return {
			'JSXAttribute > JSXExpressionContainer > JSXElement'(node: AnyNode) {
				if (userConfig.propElementValues === OPTION_NEVER) {
					reportUnnecessaryCurly(node.parent);
				}
			},

			JSXExpressionContainer(node: AnyNode) {
				if (shouldCheckForUnnecessaryCurly(node, userConfig)) {
					lintUnnecessaryCurly(node);
				}
			},

			'JSXAttribute > JSXElement, Literal, JSXText'(node: AnyNode) {
				if (shouldCheckForMissingCurly(node, userConfig)) {
					reportMissingCurly(node);
				}
			},
		} as Rule.RuleListener;
	},
};

export default rule;
