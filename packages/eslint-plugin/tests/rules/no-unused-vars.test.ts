import { describe, expect, it } from 'vitest';
import { Linter, RuleTester } from 'eslint';
import rule from '../../src/rules/no-unused-vars.js';
import * as parser from '@tsrx/eslint-parser';

const ruleTester = new RuleTester({ languageOptions: { parser } });

const list = (head: string) => `export function List({ items }) @{
	<ul>
		@for (${head}) { <li>{item.name}</li> }
	</ul>
}`;

ruleTester.run('no-unused-vars', rule, {
	valid: [
		list('const item of items; index i; key i'),
		`export function List({ items }) @{
	<ul>
		@for (const item of items; index i) { <li>{i}: {item}</li> }
	</ul>
}`,
	],
	invalid: [
		{
			code: list('const item of items; index i'),
			errors: [
				{
					messageId: 'unusedVar',
					suggestions: [
						{
							messageId: 'removeVar',
							data: { varName: 'i' },
							output: list('const item of items'),
						},
					],
				},
			],
		},
		{
			code: list('const item of items; index i; key item.id'),
			errors: [
				{
					messageId: 'unusedVar',
					suggestions: [
						{ messageId: 'removeVar', output: list('const item of items; key item.id') },
					],
				},
			],
		},
		{
			code: list('const item of items; /* row */ index i'),
			errors: [
				{
					messageId: 'unusedVar',
					suggestions: [{ messageId: 'removeVar', output: list('const item of items') }],
				},
			],
		},
		// Every other variable gets the core rule's report and suggestion.
		{
			code: `const unused = 1;
export function App() @{
	<p />
}`,
			errors: [
				{
					messageId: 'unusedVar',
					suggestions: [
						{
							messageId: 'removeVar',
							output: `
export function App() @{
	<p />
}`,
						},
					],
				},
			],
		},
	],
});

describe('no-unused-vars', () => {
	it('reports what the core rule reports, with its suggestions, outside @for indexes', () => {
		const code = `import { a, b } from './x';
export function f(unused, used) { return used + a; }
const { c, ...rest } = obj; let d = 1; d = 2;
try { f(); } catch (e) {}
export function List({ items, extra }) @{
	<ul>
		@for (const item of items; index i) { <li>{i}</li> }
		@if (items.length) { const local = 1; <p /> }
		@try { <b /> } @catch (error, reset) { <i /> }
	</ul>
}`;
		const options = { args: 'all', ignoreRestSiblings: false };
		const lint = (config: Linter.Config) =>
			new Linter()
				.verify(code, { files: ['**/*.tsrx'], languageOptions: { parser }, ...config }, 'App.tsrx')
				.map(({ ruleId, ...message }) => message);
		const messages = lint({ rules: { 'no-unused-vars': ['error', options] } });

		expect(messages.length).toBeGreaterThan(5);
		expect(
			lint({
				plugins: { tsrx: { rules: { 'no-unused-vars': rule } } },
				rules: { 'tsrx/no-unused-vars': ['error', options] },
			}),
		).toEqual(messages);
	});
});
