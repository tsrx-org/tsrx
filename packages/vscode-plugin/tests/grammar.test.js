import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHighlighter } from 'shiki';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The extension ships a copy of this grammar in `syntaxes/` (written by
 * `pnpm regenerate-textmate` at package time and not checked in), so the
 * assertions run against the source grammar.
 */
const grammar = JSON.parse(
	readFileSync(resolve(__dirname, '../../../grammars/textmate/tsrx.tmLanguage.json'), 'utf8'),
);

/** @typedef {{ content: string, scopes: string[] }} ScopedToken */

/** @type {import('shiki').Highlighter} */
let highlighter;

beforeAll(async () => {
	highlighter = await createHighlighter({
		themes: ['nord'],
		langs: ['css', 'typescript', { ...grammar, name: 'tsrx' }],
		engine: createOnigurumaEngine(import('shiki/wasm')),
	});
});

/**
 * Tokenize TSRX source and return every non-blank token with its scope stack
 * (the root `source.tsrx` scope is omitted).
 *
 * @param {string} code
 * @returns {ScopedToken[]}
 */
function tokenize(code) {
	const lines = highlighter.codeToTokensBase(code, {
		// The TSRX grammar is registered at runtime, not one of shiki's bundled ids.
		lang: /** @type {import('shiki').BundledLanguage} */ (/** @type {unknown} */ ('tsrx')),
		theme: 'nord',
		includeExplanation: 'scopeName',
	});
	/** @type {ScopedToken[]} */
	const tokens = [];
	for (const line of lines) {
		for (const token of line) {
			for (const explanation of token.explanation ?? []) {
				if (explanation.content.trim() === '') continue;
				tokens.push({
					content: explanation.content,
					scopes: explanation.scopes.map((scope) => scope.scopeName).slice(1),
				});
			}
		}
	}
	return tokens;
}

/**
 * @param {ScopedToken[]} tokens
 * @param {string} content
 * @param {number} [occurrence]
 * @returns {ScopedToken}
 */
function find(tokens, content, occurrence = 0) {
	const matches = tokens.filter((token) => token.content === content);
	const token = matches[occurrence];
	if (!token) {
		throw new Error(
			`Token ${JSON.stringify(content)} #${occurrence} not found in:\n${tokens
				.map((entry) => `${JSON.stringify(entry.content)} ${entry.scopes.join(' ')}`)
				.join('\n')}`,
		);
	}
	return token;
}

describe('TSRX TextMate grammar: <style> blocks', () => {
	it('highlights a self-closing <style apply={…} /> as a style tag with a JS expression', () => {
		const tokens = tokenize(
			['function App() @{', '  <style apply={theme} />', '  <div />', '}'].join('\n'),
		);

		expect(find(tokens, '<').scopes).toEqual(
			expect.arrayContaining(['style.tag.js', 'punctuation.definition.tag.begin.js']),
		);
		expect(find(tokens, 'style').scopes).toEqual(
			expect.arrayContaining(['style.tag.js', 'entity.name.tag.js']),
		);
		expect(find(tokens, 'apply').scopes).toEqual(
			expect.arrayContaining(['meta.tag.attributes.js', 'entity.other.attribute-name.js']),
		);
		expect(find(tokens, 'theme').scopes).toEqual(
			expect.arrayContaining(['meta.embedded.expression.js', 'variable.other.readwrite.js']),
		);
		expect(find(tokens, '/>').scopes).toEqual(
			expect.arrayContaining(['style.tag.js', 'punctuation.definition.tag.end.js']),
		);
		// The tag closes at `/>`: the following element is a regular JSX tag.
		expect(find(tokens, 'div').scopes).toContain('meta.tag.js');
		expect(find(tokens, 'div').scopes).not.toContain('style.tag.js');
		expect(tokens.some((token) => token.scopes.includes('source.css'))).toBe(false);
	});

	it('highlights an array apply value as JS inside a self-closing style', () => {
		const tokens = tokenize('<style apply={[base, theme]} />');

		expect(find(tokens, '[').scopes).toEqual(
			expect.arrayContaining([
				'style.tag.js',
				'meta.embedded.expression.js',
				'meta.array.literal.js',
			]),
		);
		expect(find(tokens, 'base').scopes).toContain('variable.other.readwrite.js');
		expect(find(tokens, '/>').scopes).toContain('punctuation.definition.tag.end.js');
	});

	it('scopes the body of <style apply={…}>…</style> as CSS', () => {
		const tokens = tokenize(
			[
				'function App() @{',
				'  <style apply={theme}>',
				'    .card { color: red; }',
				'  </style>',
				'  <div />',
				'}',
			].join('\n'),
		);

		expect(find(tokens, 'theme').scopes).toEqual(
			expect.arrayContaining(['meta.tag.attributes.js', 'variable.other.readwrite.js']),
		);
		expect(find(tokens, '>').scopes).toEqual(
			expect.arrayContaining(['style.tag.js', 'punctuation.definition.tag.end.js']),
		);
		expect(find(tokens, 'card').scopes).toEqual(
			expect.arrayContaining(['source.css', 'entity.other.attribute-name.class.css']),
		);
		expect(find(tokens, 'color').scopes).toEqual(
			expect.arrayContaining(['source.css', 'support.type.property-name.css']),
		);
		expect(find(tokens, '</').scopes).toContain('punctuation.definition.tag.begin.js');
		expect(find(tokens, 'style', 1).scopes).toContain('entity.name.tag.js');
		expect(find(tokens, 'div').scopes).toContain('meta.tag.js');
	});

	it('does not end the tag at a `>` inside the apply expression', () => {
		const tokens = tokenize(
			['<style apply={(x) => x > 1 ? big : small}>', '  div { color: red; }', '</style>'].join(
				'\n',
			),
		);

		expect(find(tokens, '=>').scopes).toEqual(
			expect.arrayContaining(['meta.embedded.expression.js', 'storage.type.function.arrow.js']),
		);
		expect(find(tokens, '>').scopes).toEqual(
			expect.arrayContaining(['meta.embedded.expression.js', 'keyword.operator.relational.js']),
		);
		expect(find(tokens, '>', 1).scopes).toEqual(
			expect.arrayContaining(['style.tag.js', 'punctuation.definition.tag.end.js']),
		);
		expect(find(tokens, 'div').scopes).toEqual(
			expect.arrayContaining(['source.css', 'entity.name.tag.css']),
		);
	});

	it('closes a self-closing style whose apply expression contains `>`', () => {
		const tokens = tokenize('<style apply={(x) => x > 1 ? big : small} />\n<div />');

		expect(find(tokens, '/>').scopes).toContain('style.tag.js');
		expect(find(tokens, 'div').scopes).toContain('meta.tag.js');
		expect(find(tokens, 'div').scopes).not.toContain('style.tag.js');
	});

	it('keeps the plain <style>…</style> form scoped as CSS', () => {
		const tokens = tokenize('<style>\n  div { color: red; }\n</style>');

		expect(find(tokens, 'div').scopes).toEqual(
			expect.arrayContaining(['source.css', 'entity.name.tag.css']),
		);
		expect(find(tokens, '</').scopes).toContain('style.tag.js');
	});
});

describe('TSRX TextMate grammar: JSX expression boundaries', () => {
	it('highlights the issue #100 JSX structure and embedded expressions independently', () => {
		const tokens = tokenize(
			[
				'const output = (',
				'  <ul>',
				'    {visibleItems.length > 0',
				'      ? visibleItems.map((item) => (',
				'          <li key={item.text}>{item.text}</li>',
				'        ))',
				'      : (',
				'          <li className="no-todos">No todos</li>',
				'        )}',
				'  </ul>',
				');',
			].join('\n'),
		);

		// Tag names and delimiters are separate evidence categories.
		expect(find(tokens, 'ul').scopes).toContain('entity.name.tag.js');
		expect(find(tokens, 'ul', 1).scopes).toContain('entity.name.tag.js');
		expect(find(tokens, 'li').scopes).toContain('entity.name.tag.js');
		expect(find(tokens, 'li', 1).scopes).toContain('entity.name.tag.js');
		expect(find(tokens, '<').scopes).toContain('punctuation.definition.tag.begin.js');
		expect(find(tokens, '</').scopes).toContain('punctuation.definition.tag.begin.js');
		expect(find(tokens, '>').scopes).toContain('punctuation.definition.tag.end.js');

		// Attribute names are asserted independently from their values.
		expect(find(tokens, 'key').scopes).toContain('entity.other.attribute-name.js');
		expect(find(tokens, 'className').scopes).toContain('entity.other.attribute-name.js');

		// Embedded expression objects, methods, and properties keep distinct roles.
		expect(find(tokens, 'visibleItems').scopes).toContain('variable.other.object.js');
		expect(find(tokens, 'length').scopes).toContain('support.variable.property.js');
		expect(find(tokens, 'visibleItems', 1).scopes).toContain('variable.other.object.js');
		expect(find(tokens, 'map').scopes).toContain('entity.name.function.js');
		expect(find(tokens, 'text').scopes).toContain('variable.other.property.js');
		expect(find(tokens, 'text', 1).scopes).toContain('variable.other.property.js');
	});

	it.each([
		['return', ['function view() {', '  return (', '    <div />', '  );', '}'].join('\n')],
		['arrow body', ['const view = () => (', '  <div />', ');'].join('\n')],
		['initializer', ['const view = (', '  <div />', ');'].join('\n')],
	])('recognizes JSX after a multiline %s boundary', (_name, code) => {
		const tokens = tokenize(code);

		expect(find(tokens, 'div').scopes).toContain('entity.name.tag.js');
		expect(find(tokens, '<').scopes).toContain('punctuation.definition.tag.begin.js');
		expect(find(tokens, '/>').scopes).toContain('punctuation.definition.tag.end.js');
	});

	it('does not reclassify relational, shift, generic, or type syntax as JSX', () => {
		const tokens = tokenize(
			[
				'const less = a < b;',
				'const lessOrEqual = a <= b;',
				'const shifted = a << b;',
				'const called = fn<T>(x);',
				'const identity = <T,>(value: T): T => value;',
				'type Box<T> = { value: T };',
			].join('\n'),
		);

		for (const token of tokens) {
			expect(token.scopes).not.toContain('meta.tag.js');
			expect(token.scopes).not.toContain('punctuation.definition.tag.begin.js');
			expect(token.scopes).not.toContain('entity.name.tag.js');
			expect(token.scopes).not.toContain('meta.jsx.children.js');
		}
	});

	it('preserves representative @if and @for directive scopes', () => {
		const tokens = tokenize(
			[
				'function App(items) @{',
				'  @if (items.length > 0) {',
				'    <div />',
				'  }',
				'  @for (const item of items) {',
				'    <span>{item}</span>',
				'  }',
				'}',
			].join('\n'),
		);

		expect(find(tokens, '@').scopes).toContain('keyword.control.directive.tsrx');
		expect(find(tokens, 'if').scopes).toContain('keyword.control.directive.tsrx');
		expect(find(tokens, '@', 1).scopes).toContain('keyword.control.directive.tsrx');
		expect(find(tokens, 'for').scopes).toContain('keyword.control.directive.tsrx');
		expect(find(tokens, 'item', 1).scopes).toContain('meta.embedded.expression.js');
	});
});
