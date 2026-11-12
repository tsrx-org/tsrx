import { describe, expect, it } from 'vitest';
import { Linter, RuleTester } from 'eslint';
import rule, { STATEMENT_PARSE_LIMIT } from '../../src/rules/jsx-curly-brace-presence.js';
import * as parser from '@tsrx/eslint-parser';

const ruleTester = new RuleTester({
	languageOptions: {
		parser,
		parserOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			ecmaFeatures: { jsx: true },
		},
	},
});

/** A component whose template is `template`. */
const component = (template: string) => `export function A() @{\n\t${template}\n}`;

/**
 * Strings that TSRX text reads as syntax, with the element around them. Each
 * keeps its braces.
 */
const tsrx_syntax_children = [
	"<code>{'@for (item of items)'}</code>",
	"<code>{'@for await (item of items)'}</code>",
	"<p>{'Write @if (ok) before the block.'}</p>",
	"<code>{'@switch(kind)'}</code>",
	"<code>{'x@if (a)'}</code>",
	// A `{…}` after the text starts `@try`, and a block before it continues
	// `@else`, `@empty`, `@pending` and `@catch`.
	"<p>{'@try'} {1}</p>",
	"<p>@if (ok) {<b />} {'@else'}</p>",
	"<p>@for (const item of items) {<b />}{'@empty'}</p>",
	"<p>@try {<b />} @pending {<i />} {'@catch (e)'}</p>",
	"<p>@if (ok) {<b />} /* c */ {'@else'} {1}</p>",
	// TSRX also reads a clause written without its `@` and reports it.
	"<p>@if (ok) {<b />} {'else if'}</p>",
	"<p>@try {<b />} @pending {<i />} {'catch (e)'}</p>",
	// A comment may come between a directive's keyword and its `(`.
	"<p>{'@for// c'}\n\t\t(const item of items) {1}\n\t</p>",
	"<code>{'//'}</code>",
	"<code>{'// note'}</code>",
	"<div>\n\t\t{'// something'}\n\t</div>",
	"<code>{'a // b'}</code>",
	"<code>{'/* note */'}</code>",
	'<code>{`/* note */`}</code>',
	'<code>{`// note`}</code>',
	'<code>{`@if (ok)`}</code>',
	// The new text would join the text or comment beside it: `a //b`, `@if (x)`,
	// `Total// TODO` (text, where `// TODO` was a comment) and `a //* c */`.
	"<p>a /{'/b'}</p>",
	"<p>{'@i'}f (x)</p>",
	"<p>{'@if'} (x)</p>",
	"<p>\n\t\t{'Total'}// TODO\n\t</p>",
	"<p>{'a /'}/* c */</p>",
	"<p>{'a /'}// c\n\t</p>",
	// `&amp;` would read as `&`.
	"<p>{'&'}amp;</p>",
	// The first child of a `<style>` decides whether it is a scoped style block.
	"<style>{'.card'}</style>",
	'<style>{`.card`}</style>',
	'<style>{<b />}</style>',
];

const valid: RuleTester.ValidTestCase[] = [
	...tsrx_syntax_children.map((template) => component(template)),
	component("<p>{'a'}{'b'}</p>"),
	component("<p>{' padded '}</p>"),
	component("<p>{'{'}</p>"),
	component('<p>plain text</p>'),
	component('<a title="x" />'),
	// A dynamic tag's expression is no child or attribute.
	component('<{\'div\'} class="box" />'),
	{
		code: component('<style>.card { color: red; }</style>'),
		options: [{ children: 'always' }],
	},
	{
		code: component('<p>{"hello"}</p>'),
		options: ['always'],
	},
];

const invalid: RuleTester.InvalidTestCase[] = [
	{
		code: component("<p>{'plain text'}</p>"),
		output: component('<p>plain text</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		code: component('<p>{`plain text`}</p>'),
		output: component('<p>plain text</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		code: component("<p>{'user@example.com'}</p>"),
		output: component('<p>user@example.com</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		code: component("<p>{'@iffy @ home @'}</p>"),
		output: component('<p>@iffy @ home @</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		// Without a `(`, `@if`, `@switch` and `@for` are text.
		code: component("<code>{'@if, @switch and @for'}</code>"),
		output: component('<code>@if, @switch and @for</code>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		// `@case` and `@default` are labels only in a `@switch` body, not in an element.
		code: component("<code>{'@case 1: @default:'}</code>"),
		output: component('<code>@case 1: @default:</code>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		// Away from a block, and without a `{…}` after `@try`, these are text.
		code: component("<code>{'@try, @else, @empty, @pending and @catch'}</code>"),
		output: component('<code>@try, @else, @empty, @pending and @catch</code>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		code: component("<p>{'https://example.com'}</p>"),
		output: component('<p>https://example.com</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		code: component("<p>{'a//b'}</p>"),
		output: component('<p>a//b</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		// A no-break space isn't whitespace to TSRX, so `//` touches the text.
		code: component("<p>{'a\u00a0//b'}</p>"),
		output: component('<p>a\u00a0//b</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		// `@empty` continues only a `@for`.
		code: component("<p>\n\t\t@if (ok) {1}\n\t\t{'@empty'}\n\t</p>"),
		output: component('<p>\n\t\t@if (ok) {1}\n\t\t@empty\n\t</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		// `else` alone is text, even after an `@if` block.
		code: component("<p>@if (ok) {<b />} {'else'}</p>"),
		output: component('<p>@if (ok) {<b />} else</p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		// Fixes that would touch the same text go in separate passes, and each
		// pass checks the code it edits.
		code: component("<p>{'a'} {'b'}</p>"),
		output: component("<p>a {'b'}</p>"),
		errors: [{ messageId: 'unnecessaryCurly' }, { messageId: 'unnecessaryCurly' }],
	},
	{
		// After `{css}`, the `<style>` stays an ordinary element.
		code: component("<style>{css}x{'plain'}</style>"),
		output: component('<style>{css}xplain</style>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		code: component('<p>{<b />}</p>'),
		output: component('<p><b /></p>'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		// TSRX reads an attribute string as JSX does.
		code: component("<a title={'@if (ok) // note'} />"),
		output: component('<a title="@if (ok) // note" />'),
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
	{
		code: component('<a title="x">hello</a>'),
		output: component('<a title={"x"}>{"hello"}</a>'),
		options: ['always'],
		errors: [{ messageId: 'missingCurly' }, { messageId: 'missingCurly' }],
	},
	{
		code: component('<a title={<b />} />'),
		output: component('<a title=<b /> />'),
		options: [{ propElementValues: 'never' }],
		errors: [{ messageId: 'unnecessaryCurly' }],
	},
];

ruleTester.run('jsx-curly-brace-presence', rule, { valid, invalid });

describe('jsx-curly-brace-presence --fix', () => {
	it('leaves every string that TSRX text reads as syntax in braces', () => {
		const linter = new Linter();
		for (const template of tsrx_syntax_children) {
			const code = component(template);
			const { output, messages } = linter.verifyAndFix(
				code,
				{
					files: ['**/*.tsrx'],
					languageOptions: { parser },
					plugins: { tsrx: { rules: { 'jsx-curly-brace-presence': rule } } },
					rules: { 'tsrx/jsx-curly-brace-presence': 'error' },
				},
				'App.tsrx',
			);
			expect({ template, output, messages }).toEqual({ template, output: code, messages: [] });
		}
	});

	it('writes TSRX that parses', () => {
		for (const { output } of invalid) {
			expect(() => parser.parseForESLint(output as string, { filePath: 'App.tsrx' })).not.toThrow();
		}
	});

	it('keeps what every element renders', () => {
		// What each element's children render: text, with a string in braces read
		// as its text, and the type of anything else. Also the comments and
		// diagnostics.
		const reading = (code: string) => {
			let result;
			try {
				result = parser.parseForESLint(code, { filePath: 'App.tsrx' }) as any;
			} catch (error: any) {
				return `fatal: ${error.message}`;
			}
			const elements: string[][] = [];
			const walk = (node: any) => {
				if (!node || typeof node !== 'object') return;
				if (Array.isArray(node)) return node.forEach(walk);
				if (node.children && /^JSX(Element|Fragment)$/.test(node.type)) {
					const parts: string[] = [];
					for (const child of node.children) {
						const expression = child.type === 'JSXExpressionContainer' ? child.expression : null;
						const value =
							child.type === 'JSXText'
								? child.value
								: typeof expression?.value === 'string'
									? expression.value
									: expression?.type === 'TemplateLiteral' && !expression.expressions.length
										? expression.quasis[0].value.cooked
										: null;
						if (value !== null && parts.length && !parts.at(-1)!.startsWith('<')) {
							parts[parts.length - 1] += value;
						} else {
							parts.push(value ?? `<${child.expression?.type ?? child.type}>`);
						}
					}
					elements.push(parts);
				}
				for (const key of Object.keys(node)) {
					if (key !== 'parent' && key !== 'loc' && key !== 'range' && key !== 'metadata') {
						walk(node[key]);
					}
				}
			};
			walk(result.ast.body);
			return JSON.stringify({
				elements,
				comments: result.ast.comments.map((comment: any) => comment.value),
				diagnostics: result.services.tsrxDiagnostics.map((diagnostic: any) => diagnostic.code),
			});
		};
		const lint = (code: string, parser_object: any) =>
			new Linter().verifyAndFix(
				code,
				{
					files: ['**/*.tsrx'],
					languageOptions: { parser: parser_object },
					plugins: { tsrx: { rules: { 'jsx-curly-brace-presence': rule } } },
					rules: { 'tsrx/jsx-curly-brace-presence': 'error' },
				},
				'App.tsrx',
			);
		const cases = [
			...tsrx_syntax_children.map(component),
			...invalid.map(({ code }) => code),
			// Text after a directive's block and before an element.
			component("<p>@if (ok) {<b />}, write to {'me@x.dev'}<br /></p>"),
			component("<p>@if (ok) {<b />}, write to {'hello'}<br /></p>"),
			component("<p>@if (ok) {<b />} or {'me@x.dev'}<br /></p>"),
			component("<p>@for (const item of items) {<b />}{'/'}</p>"),
			// An element in an expression container, which a cut can't reproduce.
			`export function A({ ok }) {\n\treturn <div>{ok ? <p>@if (ok) {<b />}<i />{'x'}<em /></p> : null}</div>;\n}`,
			`export function A({ ok }) {\n\treturn <div>{ok && <p>@if (ok) {<b />}<i />{'a@b'}<em /></p>}</div>;\n}`,
		];
		// A parser with only `parse` gives no diagnostics, and the check still runs.
		const parse_only = { parse: parser.parse };
		for (const code of cases) {
			for (const parser_object of [parser, parse_only]) {
				const { output } = lint(code, parser_object);
				expect({ code, reading: reading(output) }).toEqual({ code, reading: reading(code) });
			}
		}
		expect(lint(component("<p>{'user@example.com'}</p>"), parse_only).output).toBe(
			component('<p>user@example.com</p>'),
		);
	});

	const config = {
		files: ['**/*.tsrx'],
		languageOptions: { parser },
		plugins: { tsrx: { rules: { 'jsx-curly-brace-presence': rule } } },
		rules: { 'tsrx/jsx-curly-brace-presence': 'error' },
	} as const;

	it('finishes in one --fix run', () => {
		const strings = (count: number) => Array.from({ length: count }, (_, i) => `{'a${i}'}`);
		let nested = "{'a'}";
		for (let i = 0; i < 15; i++) nested = `{'a'}<li>${nested}</li>`;
		for (const template of [
			`<div>${strings(93).join(' ')}</div>`,
			`<div>${strings(200).join('x')}</div>`,
			`<div>${nested}</div>`,
		]) {
			const { output, messages } = new Linter().verifyAndFix(
				component(template),
				config,
				'App.tsrx',
			);
			expect(messages).toEqual([]);
			expect(output).toBe(component(template.replace(/\{'([^']*)'\}/g, '$1')));
		}
	});

	it('checks a bounded number of children in expression containers', () => {
		// Each child here needs its top-level statement parsed. Past the limit,
		// the rest keep their braces.
		const children = Array.from(
			{ length: STATEMENT_PARSE_LIMIT + 5 },
			(_, i) => ` x{'a@b${i}'}<i />`,
		).join('');
		const messages = new Linter().verify(
			`export function A({ ok }) {\n\treturn <div>{ok && <section>${children}</section>}</div>;\n}`,
			config,
			'App.tsrx',
		);
		expect(messages).toHaveLength(STATEMENT_PARSE_LIMIT);
	});
});
