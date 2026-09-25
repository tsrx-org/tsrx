/**
 * @import { ParserOptions } from 'prettier'
 */

import { parseModule } from '@tsrx/core';

/**
 * A loosely typed AST node. The parser's acorn-typescript output is reshaped in
 * place, so the adapter reads and writes properties that the core types don't
 * declare.
 * @typedef {Record<string, any> & { type: string, start: number, end: number }} Node
 */

/**
 * @typedef {{ type: 'Line' | 'Block', value: string, start: number, end: number }} Comment
 */

/** TSRX template directives, printed by `printer.js`. */
export const TSRX_DIRECTIVES = new Set([
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
]);

/** The statements whose `__contentEnd` Prettier's comment handling reads. */
const CONTENT_END_STATEMENTS = new Set([
	'ExpressionStatement',
	'ImportDeclaration',
	'ExportDefaultDeclaration',
	'ExportNamedDeclaration',
	'ExportAllDeclaration',
	'ReturnStatement',
	'ThrowStatement',
	'DoWhileStatement',
]);

/** Nodes that can be the output of a `@{ … }` or directive body. */
const TSRX_OUTPUT = new Set(['JSXElement', 'JSXFragment', 'JSXStyleElement', ...TSRX_DIRECTIVES]);

/**
 * Parse a `.tsrx` module into the ESTree shape that Prettier's own estree
 * printer expects (the `typescript` parser's typescript-estree shape), plus
 * the TSRX nodes that `printer.js` prints itself.
 * @param {string} text
 * @param {ParserOptions} options
 * @returns {Node}
 */
export function parse(text, options) {
	/** @type {Comment[]} */
	const comments = [];
	const ast = /** @type {Node} */ (
		/** @type {unknown} */ (
			parseModule(text, options.filepath || 'Component.tsrx', {
				collect: true,
				comments: /** @type {any} */ (comments),
				preserveParens: true,
			})
		)
	);
	const adapter = new Adapter(text, comments);
	const program = adapter.visit(ast);
	program.start = 0;
	program.end = text.length;
	program.comments = mergeNestledJsdocComments(
		comments
			.filter((comment) => !adapter.isInsideRawText(comment))
			.map(({ type, value, start, end }) => ({ type, value, start, end })),
	);
	return program;
}

/**
 * Prettier's parsers join JSDoc-style block comments that touch
 * (`/** a *\//** b *\/`) into one comment.
 * @param {Comment[]} comments
 * @returns {Comment[]}
 */
function mergeNestledJsdocComments(comments) {
	for (let i = comments.length - 2; i >= 0; i--) {
		const comment = comments[i];
		const following = comments[i + 1];
		if (
			comment.end === following.start &&
			isIndentableBlockComment(comment) &&
			isIndentableBlockComment(following)
		) {
			comment.value += `*//*${following.value}`;
			comment.end = following.end;
			comments.splice(i + 1, 1);
		}
	}
	return comments;
}

/**
 * A block comment whose every line starts with `*`, like a JSDoc comment.
 * @param {Comment} comment
 * @returns {boolean}
 */
function isIndentableBlockComment(comment) {
	if (comment.type !== 'Block') return false;
	const lines = `*${comment.value}*`.split('\n');
	return lines.length > 1 && lines.every((line) => line.trimStart()[0] === '*');
}

/**
 * Prettier's `locStart`: a declaration starts at its first decorator.
 * @param {Node} node
 * @returns {number}
 */
export function locStart(node) {
	const start = node.range?.[0] ?? node.start;
	const decorators = node.declaration?.decorators ?? node.decorators;
	if (decorators?.length) {
		return Math.min(locStart(decorators[0]), start);
	}
	return start;
}

/**
 * Prettier's `locEnd`, which comment attachment relies on: a statement ends
 * where its content ends, before a semicolon that comments separate from it,
 * and a compound statement ends where its body does.
 * @param {Node} node
 * @returns {number}
 */
export function locEnd(node) {
	switch (node.type) {
		case 'IfStatement':
			return locEnd(node.alternate ?? node.consequent);
		case 'ForInStatement':
		case 'ForOfStatement':
		case 'ForStatement':
		case 'LabeledStatement':
		case 'WithStatement':
		case 'WhileStatement':
			return locEnd(node.body);
		case 'BreakStatement':
			return node.label ? locEnd(node.label) : locStart(node) + 'break'.length;
		case 'ContinueStatement':
			return node.label ? locEnd(node.label) : locStart(node) + 'continue'.length;
		case 'DebuggerStatement':
			return locStart(node) + 'debugger'.length;
		case 'VariableDeclaration':
			return locEnd(node.declarations.at(-1));
	}
	return node.__contentEnd ?? node.range?.[1] ?? node.end;
}

class Adapter {
	/**
	 * @param {string} text
	 * @param {Comment[]} comments
	 */
	constructor(text, comments) {
		this.text = text;
		this.comments = comments;
		/**
		 * Source ranges of `<style>` and `<script>` bodies. Comments inside them
		 * belong to the embedded CSS/TypeScript, not to the TSRX AST.
		 * @type {Array<[number, number]>}
		 */
		this.rawTextRanges = [];
	}

	/**
	 * The source with every comment blanked out, for `setContentEnd`.
	 * @type {string | undefined}
	 */
	#textWithoutComments;

	/**
	 * Prettier's parsers record where a statement's content ends when comments
	 * separate it from its semicolon (`foo // c` + newline + `;`); Prettier's
	 * comment handling reads it.
	 * @param {Node} node
	 */
	setContentEnd(node) {
		const end = node.end - 1;
		if (this.text[end] !== ';') return;
		this.#textWithoutComments ??= this.comments.reduce(
			(text, comment) =>
				text.slice(0, comment.start) +
				' '.repeat(comment.end - comment.start) +
				text.slice(comment.end),
			this.text,
		);
		const content = this.#textWithoutComments.slice(node.start, end);
		node.__contentEnd = end - (content.length - content.trimEnd().length);
	}

	/**
	 * The parser leaves the whitespace between JSX children out of its text
	 * nodes, but Prettier reads it to keep blank lines and to choose line
	 * breaks, so rebuild the text nodes from the source between children.
	 * Text around a comment keeps the parser's shape.
	 * @param {Node} node
	 */
	restoreJsxWhitespace(node) {
		const opening = node.openingElement ?? node.openingFragment;
		const closing = node.closingElement ?? node.closingFragment;
		if (!closing) return;

		/** @type {Node[]} */
		const children = [];
		let position = opening.end;
		const addText = (/** @type {number} */ end) => {
			if (end <= position) return;
			if (this.comments.some((comment) => comment.start < end && comment.end > position)) {
				return;
			}
			const previous = children.at(-1);
			const start =
				previous?.type === 'JSXText' && previous.end === position ? previous.start : position;
			if (start !== position) children.pop();
			const raw = this.text.slice(start, end);
			children.push({ type: 'JSXText', start, end, value: raw, raw });
		};
		for (const child of node.children) {
			if (child.type === 'JSXText') {
				addText(child.start);
				const containsComment = this.comments.some(
					(comment) => comment.start >= child.start && comment.end <= child.end,
				);
				if (containsComment) {
					children.push(child);
				} else {
					position = child.start;
					addText(child.end);
				}
			} else {
				addText(child.start);
				children.push(child);
			}
			position = Math.max(position, child.end);
		}
		addText(closing.start);
		node.children = children;
	}

	/**
	 * @param {Comment} comment
	 * @returns {boolean}
	 */
	isInsideRawText(comment) {
		return this.rawTextRanges.some(([start, end]) => comment.start >= start && comment.end <= end);
	}

	/**
	 * Prettier keeps parentheses only around JSDoc type casts
	 * (`/** @type {T} *\/ (value)`), like its `babel` parser.
	 * @param {Node} node
	 * @returns {boolean}
	 */
	isTypeCastParentheses(node) {
		const comment = this.comments.findLast((comment) => comment.end <= node.start);
		return (
			comment?.type === 'Block' &&
			comment.value[0] === '*' &&
			/@(?:type|satisfies)\b/u.test(comment.value) &&
			this.text.slice(comment.end, node.start).trim() === ''
		);
	}

	/**
	 * @param {any} value
	 * @returns {any}
	 */
	visit(value) {
		if (Array.isArray(value)) {
			return value.map((item) => this.visit(item));
		}
		if (!value || typeof value !== 'object' || typeof value.type !== 'string') {
			return value;
		}
		/** @type {Node} */
		const node = value;

		if (node.type === 'ParenthesizedExpression' && !this.isTypeCastParentheses(node)) {
			return this.visit(node.expression);
		}
		if (node.type === 'TSParenthesizedType') {
			return this.visit(node.typeAnnotation);
		}

		// The core parser attaches comments itself; Prettier attaches them again
		// from `program.comments`.
		delete node.leadingComments;
		delete node.trailingComments;
		delete node.innerComments;
		delete node.comments;
		delete node.metadata;

		if (node.type === 'JSXStyleElement' || isRawScriptElement(node)) {
			// `embed()` prints the CSS or TypeScript body from `node.css` or
			// `node.content`. (A stylesheet's own positions are CSS offsets.)
			if (node.closingElement) {
				this.rawTextRanges.push([node.openingElement.end, node.closingElement.start]);
			}
			if (node.type === 'JSXStyleElement') node.children = [];
		}

		for (const key of Object.keys(node)) {
			if (key === 'loc' || key === 'range') continue;
			node[key] = this.visit(node[key]);
		}

		return this.reshape(node);
	}

	/**
	 * Rename acorn-typescript shapes to typescript-estree ones and wrap the TSRX
	 * nodes so Prettier's layout rules treat them like their closest JS
	 * relatives.
	 * @param {Node} node
	 * @returns {Node}
	 */
	reshape(node) {
		if (CONTENT_END_STATEMENTS.has(node.type)) {
			this.setContentEnd(node);
		}

		switch (node.type) {
			// Prettier's parsers rebalance `a || (b || c)` into `(a || b) || c`.
			case 'LogicalExpression':
				return rebalanceLogicalTree(node);

			// …and drop a union or intersection of one type.
			case 'TSUnionType':
			case 'TSIntersectionType':
				if (node.types.length === 1) return node.types[0];
				break;

			case 'JSXElement':
			case 'JSXFragment':
				if (!isRawScriptElement(node)) this.restoreJsxWhitespace(node);
				break;

			case 'Program':
				// A module-level JSX statement is a plain expression statement.
				node.body = node.body.map((/** @type {Node} */ child) =>
					isTsrxOutput(child) ? expressionStatement(child) : child,
				);
				break;

			// `@{ … }` is a block whose last statement is the output node. Prettier
			// prints it like any block; `printer.js` adds the `@`.
			case 'JSXCodeBlock': {
				const body = node.render ? [...node.body, node.render] : node.body;
				return {
					type: 'BlockStatement',
					tsrxCodeBlock: true,
					start: node.start,
					end: node.end,
					body: body.map(templateStatement),
				};
			}

			// Directive and case bodies hold bare JSX output as statements.
			case 'BlockStatement':
				node.body = node.body.map(templateStatement);
				break;
			case 'SwitchCase':
				node.consequent = node.consequent.map(templateStatement);
				break;

			// An `@case` body is a `{ … }` template block. The parser keeps only its
			// statements, so rebuild the block to get Prettier's block printing
			// (blank lines, comments, empty bodies).
			case 'JSXSwitchExpression':
				for (const switchCase of node.cases) {
					const start = this.text.indexOf('{', switchCase.test?.end ?? switchCase.start);
					switchCase.consequent = [
						{
							type: 'BlockStatement',
							start,
							end: switchCase.end,
							body: switchCase.consequent,
						},
					];
				}
				break;

			// `<style>` is a JSX element whose body `embed()` prints as CSS.
			case 'JSXStyleElement':
				node.tsrxType = node.type;
				node.type = 'JSXElement';
				break;

			case 'JSXIfExpression':
				for (let alternate = node.alternate; alternate?.type === 'IfStatement';) {
					alternate.tsrxElseIf = true;
					alternate = alternate.alternate;
				}
				break;

			case 'MethodDefinition':
			case 'TSAbstractMethodDefinition':
				if (node.typeParameters) {
					node.value.typeParameters = node.typeParameters;
					delete node.typeParameters;
				}
				break;

			case 'ClassDeclaration':
			case 'ClassExpression':
				rename(node, 'superTypeParameters', 'superTypeArguments');
				for (const heritage of node.implements ?? []) heritage.type = 'TSClassImplements';
				break;

			case 'TSInterfaceDeclaration':
				for (const heritage of node.extends ?? []) heritage.type = 'TSInterfaceHeritage';
				break;

			case 'TSExpressionWithTypeArguments':
				rename(node, 'typeParameters', 'typeArguments');
				break;

			case 'TSFunctionType':
			case 'TSConstructorType':
			case 'TSCallSignatureDeclaration':
			case 'TSConstructSignatureDeclaration':
			case 'TSMethodSignature':
				rename(node, 'parameters', 'params');
				rename(node, 'typeAnnotation', 'returnType');
				break;

			case 'TSEnumDeclaration':
				if (node.members) {
					node.body = {
						type: 'TSEnumBody',
						start: node.id.end,
						end: node.end,
						members: node.members,
					};
					delete node.members;
				}
				break;

			case 'TSImportType':
				if (node.argument) {
					node.source =
						node.argument.type === 'TSLiteralType' ? node.argument.literal : node.argument;
					delete node.argument;
				}
				node.options ??= null;
				break;

			case 'TSMappedType':
				if (node.typeParameter) {
					node.key = node.typeParameter.name;
					node.constraint = node.typeParameter.constraint;
					delete node.typeParameter;
				}
				break;

			case 'TSTypeParameter':
				if (typeof node.name === 'string') {
					const modifiers = /^(?:(?:const|in|out)\s+)*/u.exec(
						this.text.slice(node.start, node.end),
					);
					const start = node.start + (modifiers?.[0].length ?? 0);
					node.name = {
						type: 'Identifier',
						name: node.name,
						start,
						end: start + node.name.length,
					};
				}
				break;
		}

		// Directives are block-shaped expressions. Prettier's closest relative is
		// `do { … }`, so layout decisions (hugging an arrow body, a JSX expression
		// container, a last call argument) treat them the same way. `printer.js`
		// prints each directive's head as its statement (`node.statementType`).
		if (TSRX_DIRECTIVES.has(node.type)) {
			node.tsrxType = node.type;
			node.type = 'DoExpression';
		}

		return node;
	}
}

/**
 * @param {Node} node
 * @returns {Node}
 */
function rebalanceLogicalTree(node) {
	const { left, right, operator } = node;
	if (right.type !== 'LogicalExpression' || right.operator !== operator) {
		return node;
	}
	return rebalanceLogicalTree({
		type: 'LogicalExpression',
		operator,
		left: rebalanceLogicalTree({
			type: 'LogicalExpression',
			operator,
			left,
			right: right.left,
			start: locStart(left),
			end: locEnd(right.left),
		}),
		right: right.right,
		start: locStart(node),
		end: locEnd(node),
	});
}

/**
 * @param {Node | null | undefined} node
 * @returns {boolean}
 */
export function isRawScriptElement(node) {
	return (
		node?.type === 'JSXElement' &&
		node.openingElement?.name?.type === 'JSXIdentifier' &&
		node.openingElement.name.name === 'script' &&
		typeof node.content === 'string'
	);
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isTsrxOutput(node) {
	return TSRX_OUTPUT.has(node.tsrxType ?? node.type);
}

/**
 * @param {Node} node
 * @returns {Node}
 */
function expressionStatement(node) {
	return { type: 'ExpressionStatement', expression: node, start: node.start, end: node.end };
}

/**
 * A template body's output node, printed without a semicolon.
 * @param {Node} node
 * @returns {Node}
 */
function templateStatement(node) {
	if (!isTsrxOutput(node)) return node;
	return { ...expressionStatement(node), tsrxOutput: true };
}

/**
 * @param {Node} node
 * @param {string} from
 * @param {string} to
 */
function rename(node, from, to) {
	if (node[from] !== undefined) {
		node[to] ??= node[from];
		delete node[from];
	}
}
