import { RuleTester } from 'eslint';
import rule from '../../src/rules/no-await-in-loop.js';
import * as parser from '@tsrx/eslint-parser';

const ruleTester = new RuleTester({ languageOptions: { parser } });

const list = (
	head: string,
	body = '<li>{item}</li>',
) => `export async function List({ items, load }) @{
	<ul>
		@for (${head}) { ${body} }
	</ul>
}`;

ruleTester.run('no-await-in-loop', rule, {
	valid: [
		list('const item of await load(); key item.id'),
		list('const item of items; key item.id'),
		// A function in the key runs when it is called.
		list('const item of items; key keyOf(async () => await load(item))'),
		`export async function App({ load }) @{
	const data = await load();
	<p>{data}</p>
}`,
		`async function f(items) { for (const item of items) { const g = async () => await item; } }`,
	],
	invalid: [
		{
			code: list('const item of items; key await load(item)'),
			errors: [{ messageId: 'unexpectedAwait', line: 3, column: 34 }],
		},
		{
			code: list('const item of items; index i; key `${i}-${await load(item)}`'),
			errors: [{ messageId: 'unexpectedAwait' }],
		},
		// The core rule's reports are unchanged.
		{
			code: list('const item of items', '<li>{await load(item)}</li>'),
			errors: [{ messageId: 'unexpectedAwait', line: 3, column: 37 }],
		},
		{
			code: `async function f(items) { for (const item of items) { await item; } }`,
			errors: [{ messageId: 'unexpectedAwait' }],
		},
		// Inside another loop, an `await` in the key is reported once.
		{
			code: list(
				'const group of items',
				'@for (const item of group; key await load(item)) { <li>{item}</li> }',
			),
			errors: [{ messageId: 'unexpectedAwait' }],
		},
	],
});
