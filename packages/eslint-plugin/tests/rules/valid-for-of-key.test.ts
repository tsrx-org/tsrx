import { RuleTester } from 'eslint';
import rule from '../../src/rules/valid-for-of-key.js';
import * as parser from '@tsrx/eslint-parser';

const ruleTester = new RuleTester({
	languageOptions: {
		parser,
		parserOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
		},
	},
});

ruleTester.run('valid-for-of-key', rule, {
	valid: [
		// Valid: @for with valid key (variable defined in loop)
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key item.id) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
		},
		// Valid: @for with valid key (variable defined in outer scope)
		{
			code: `
				function App() {
					const items = [1, 2];
					const globalId = 123;
					return <>
						@for (const item of items; key globalId) {
							<div>{item}</div>
						}
					</>;
				}
			`,
		},
		// Valid: @for without key
		{
			code: `
				function App() {
					const items = [1, 2];
					return <>
						@for (const item of items) {
							<div>{item}</div>
						}
					</>;
				}
			`,
		},
		// Valid: @for with index and key
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; index i; key item.id) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
		},
		// Valid: @for with the declared index as the key
		{
			code: `
				function App() {
					const items = ['a', 'b'];
					return <>
						@for (const item of items; index i; key i) {
							<p>{i}: {item}</p>
						}
					</>;
				}
			`,
		},
		// Valid: @for with an optional-chain key on the loop variable
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; index i; key item?.id ?? \`\${i}\`) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
		},
		// Valid: @for keys with a type name and a nested function parameter
		{
			code: `
				interface Id {}
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key ((x) => x.id as Id)(item)) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
		},
	],
	invalid: [
		// Invalid: key uses undefined variable
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key unknownVariable) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [
				{
					messageId: 'undefinedVariable',
					data: {
						name: 'unknownVariable',
					},
				},
			],
		},
		// Invalid: key uses undefined variable in expression
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key item.id + unknownVariable) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [
				{
					messageId: 'undefinedVariable',
					data: {
						name: 'unknownVariable',
					},
				},
			],
		},
		// Invalid: undefined variable in `missing?.id`
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key missing?.id) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `missing!`
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key missing!) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `missing as string`
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key missing as string) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `missing satisfies string`
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key missing satisfies string) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `[...missing]`
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key [...missing]) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `(missing, item.id)`
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key (missing, item.id)) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `new Key(item.id)`
		{
			code: `
				function App() {
					const items = [{id: 1}, {id: 2}];
					return <>
						@for (const item of items; key new Key(item.id)) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'Key' } }],
		},
		// Invalid: undefined variable in `tag\`\${missing}\``
		{
			code: `
				async function App() {
					const items = [{id: 1}, {id: 2}];
					const tag = (strings) => strings[0];
					let t;
					return <>
						@for (const item of items; key tag\`\${missing}\`) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `missing++`
		{
			code: `
				async function App() {
					const items = [{id: 1}, {id: 2}];
					const tag = (strings) => strings[0];
					let t;
					return <>
						@for (const item of items; key missing++) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `(t = missing)`
		{
			code: `
				async function App() {
					const items = [{id: 1}, {id: 2}];
					const tag = (strings) => strings[0];
					let t;
					return <>
						@for (const item of items; key (t = missing)) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `import(missing)`
		{
			code: `
				async function App() {
					const items = [{id: 1}, {id: 2}];
					const tag = (strings) => strings[0];
					let t;
					return <>
						@for (const item of items; key import(missing)) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `((x) => missing)(item)`
		{
			code: `
				async function App() {
					const items = [{id: 1}, {id: 2}];
					const tag = (strings) => strings[0];
					let t;
					return <>
						@for (const item of items; key ((x) => missing)(item)) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
		// Invalid: undefined variable in `await missing`
		{
			code: `
				async function App() {
					const items = [{id: 1}, {id: 2}];
					const tag = (strings) => strings[0];
					let t;
					return <>
						@for (const item of items; key await missing) {
							<div>{item.id}</div>
						}
					</>;
				}
			`,
			errors: [{ messageId: 'undefinedVariable', data: { name: 'missing' } }],
		},
	],
});
