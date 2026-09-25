/**
 * @import { AstPath, Doc, ParserOptions, Printer } from 'prettier'
 * @import { Node } from './parse.js'
 */

import { builders } from 'prettier/doc';
import * as estreePlugin from 'prettier/plugins/estree';
import { isRawScriptElement } from './parse.js';

const { group, hardline, ifBreak, indent, join, line, softline } = builders;

/**
 * Prettier's own JS/TS printer. Everything that isn't TSRX syntax is printed by
 * it unchanged.
 * @type {Printer<Node>}
 */
const estree = /** @type {Printer<Node>} */ (estreePlugin.printers.estree);

/**
 * @typedef {(selector?: string | number | Array<string | number> | AstPath) => Doc} Print
 */

/** Child keys of the TSRX nodes, which Prettier's visitor keys don't know. */
const TSRX_VISITOR_KEYS = /** @type {Record<string, string[]>} */ ({
	JSXIfExpression: ['test', 'consequent', 'alternate'],
	JSXForExpression: ['init', 'test', 'update', 'left', 'right', 'index', 'key', 'body', 'empty'],
	JSXSwitchExpression: ['discriminant', 'cases'],
	JSXTryExpression: ['block', 'pending', 'handler', 'finalizer'],
});

/** `@catch (error, reset)` has a second parameter. */
const CATCH_CLAUSE_KEYS = ['param', 'resetParam', 'body'];

/** @type {Printer<Node>} */
export const printer = {
	...estree,

	getVisitorKeys(node, nonTraversableKeys) {
		const keys = TSRX_VISITOR_KEYS[node.tsrxType ?? node.type];
		if (keys) return keys;
		if (node.type === 'CatchClause' && node.resetParam) return CATCH_CLAUSE_KEYS;
		return /** @type {NonNullable<Printer<Node>['getVisitorKeys']>} */ (estree.getVisitorKeys)(
			node,
			nonTraversableKeys,
		);
	},

	print(path, options, print, args) {
		return printTsrx(path, options, print) ?? estree.print(path, options, print, args);
	},

	embed(path, options) {
		const { node } = path;

		if (node.tsrxType === 'JSXStyleElement' && !node.openingElement.selfClosing) {
			return async (textToDoc, print) =>
				printRawTextElement(
					path,
					print,
					node.css?.trim() ? await textToDoc(node.css, { parser: 'css' }) : '',
				);
		}

		if (isRawScriptElement(node)) {
			return async (textToDoc, print) =>
				printRawTextElement(
					path,
					print,
					node.content.trim() ? await textToDoc(node.content, { parser: 'typescript' }) : '',
				);
		}

		return estree.embed?.(path, options) ?? null;
	},
};

/**
 * Print a TSRX node, or return `null` to let Prettier's estree printer print it.
 * @param {AstPath<Node>} path
 * @param {ParserOptions<Node>} options
 * @param {Print} print
 * @returns {Doc | null}
 */
function printTsrx(path, options, print) {
	const { node, parent } = path;

	switch (node.tsrxType ?? node.type) {
		case 'BlockStatement':
			return node.tsrxCodeBlock
				? ['@', /** @type {Doc} */ (estree.print(path, options, print))]
				: null;

		case 'ExpressionStatement':
			return node.tsrxOutput ? print('expression') : null;

		case 'JSXAttribute':
			return node.shorthand ? ['{', print(['value', 'expression']), '}'] : null;

		case 'IfStatement':
			return node.tsrxElseIf ? printIf(path, print, 'if') : null;

		case 'JSXIfExpression':
			return printIf(path, print, '@if');

		case 'CatchClause':
			if (!node.resetParam) return null;
			return ['catch (', print('param'), ', ', print('resetParam'), ') ', print('body')];

		case 'JSXForExpression':
			return printFor(path, print);

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
					: '',
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
			return [
				'@try ',
				print('block'),
				node.pending ? [' @pending ', print('pending')] : '',
				node.handler ? [' @', print('handler')] : '',
				node.finalizer ? [' @finally ', print('finalizer')] : '',
			];
	}

	return null;
}

/**
 * `@if (test) { … } @else …`, with the head laid out like Prettier's `if`.
 * @param {AstPath<Node>} path
 * @param {Print} print
 * @param {string} keyword
 * @returns {Doc}
 */
function printIf(path, print, keyword) {
	const { node } = path;
	return [
		group([
			keyword,
			' (',
			group([indent([softline, asStatement(node, () => print('test'))]), softline]),
			')',
		]),
		' ',
		print('consequent'),
		node.alternate ? [' @else ', print('alternate')] : '',
	];
}

/**
 * `@for (head; index i; key k) { … } @empty { … }`. The head is laid out like
 * Prettier's `for`: a `for…of`/`for…in` head stays on one line, and a head with
 * several clauses breaks after each `;`.
 * @param {AstPath<Node>} path
 * @param {Print} print
 * @returns {Doc}
 */
function printFor(path, print) {
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
		print('body'),
		node.empty ? [' @empty ', print('empty')] : '',
	];
}

/**
 * Print a directive's children while the directive presents itself as its
 * statement (`IfStatement`, `ForOfStatement`, …), so Prettier lays them out as
 * it would inside that statement: a broken `if` test, a `for` declaration
 * without a semicolon.
 * @template T
 * @param {Node} node
 * @param {() => T} callback
 * @returns {T}
 */
function asStatement(node, callback) {
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
 * @param {Print} print
 * @param {Doc} body
 * @returns {Doc}
 */
function printRawTextElement(path, print, body) {
	const element = [
		print('openingElement'),
		body ? [indent([hardline, body]), hardline] : '',
		print('closingElement'),
	];
	return maybeWrapJsxElementInParens(path, element);
}

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
 * Prettier's `maybeWrapJsxElementInParens`, for the elements `embed()` prints.
 * @param {AstPath<Node>} path
 * @param {Doc} element
 * @returns {Doc}
 */
function maybeWrapJsxElementInParens(path, element) {
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
	return group([ifBreak('('), indent([softline, element]), softline, ifBreak(')')], {
		shouldBreak,
	});
}

/**
 * Whether the line after `index` is blank, like Prettier's `isNextLineEmpty`
 * for a node that ends a line.
 * @param {string} text
 * @param {number} index
 * @returns {boolean}
 */
function isNextLineEmpty(text, index) {
	const rest = /^[ \t]*(?:\r\n?|\n)[ \t]*(\r\n?|\n)?/u.exec(text.slice(index));
	return Boolean(rest?.[1]);
}
