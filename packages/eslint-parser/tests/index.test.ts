import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import { DIAGNOSTIC_CODES } from '@tsrx/core';
import * as parser from '../src/index.ts';
import { parseForESLint } from '../src/index.ts';

function lint(code: string, config: Linter.Config = {}) {
	return new Linter()
		.verify(code, { files: ['**/*.tsrx'], languageOptions: { parser }, ...config }, 'App.tsrx')
		.map((message) => `${message.line}: ${message.ruleId}: ${message.message}`);
}

describe('eslint-parser', () => {
	it('throws collected broken-markup diagnostics as ESLint parse errors', () => {
		expect(() =>
			parseForESLint(`export function App() { return <div><span></div>; }`, {
				filePath: 'App.tsrx',
			}),
		).toThrow(/Expected closing tag to match opening tag/);
	});

	it('keeps forgotten statement-container hints available to ESLint rules', () => {
		const result = parseForESLint(
			`export function UserBadge({ user }: UserBadgeProps): JSX.Element {
				const initials = user.name.slice(0, 2).toUpperCase();

				<button title={user.name}>{initials}</button>
			}`,
			{ filePath: 'App.tsrx' },
		);

		expect(result.ast.type).toBe('Program');
		expect(result.services?.tsrxDiagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: DIAGNOSTIC_CODES.FORGOTTEN_STATEMENT_CONTAINER,
				}),
			]),
		);
	});

	it('lints @switch cases with no rules enabled', () => {
		expect(
			lint(`export function App(n) @{
				@switch (n) {
					@case 1: { <div /> }
					@case 2: { <p /> }
				}
			}`),
		).toEqual([]);
		expect(
			lint(`export function App(n) @{
				@switch (n) {
					@default: { <div /> }
				}
			}`),
		).toEqual([]);
	});

	it('gives ESLint the comments, so directive comments apply', () => {
		let comment_count = 0;
		const messages = lint(
			`// eslint-disable-next-line no-unused-vars
const unused = 1;
/* eslint-disable-next-line no-unused-vars */
const alsoUnused = 2;
const reported = 3;

export function App() @{
	<div />
}
`,
			{
				plugins: {
					probe: {
						rules: {
							comments: {
								create: (context) => ({
									Program() {
										comment_count = context.sourceCode.getAllComments().length;
									},
								}),
							},
						},
					},
				},
				rules: { 'no-unused-vars': 'error', 'probe/comments': 'error' },
			},
		);

		expect(messages).toEqual(["5: no-unused-vars: 'reported' is assigned a value but never used."]);
		expect(comment_count).toBe(2);
	});

	it('gives ESLint tokens, so no-unused-vars reports an unused parameter', () => {
		expect(lint(`export function f(unused) {}`, { rules: { 'no-unused-vars': 'error' } })).toEqual([
			"1: no-unused-vars: 'unused' is defined but never used.",
		]);
	});

	it('gives ESLint espree-style tokens for TSRX syntax', () => {
		const code = `export function App(n) @{
	<p class="a">
		{\`#\${n}\`} // note
		@if (n) { <><style>.b {}</style><b /></> }
	</p>
}`;
		const { tokens, comments } = parseForESLint(code, { filePath: 'App.tsrx' }).ast as any;

		expect(tokens.map((token: any) => `${token.type} ${token.value}`)).toEqual([
			'Keyword export',
			'Keyword function',
			'Identifier App',
			'Punctuator (',
			'Identifier n',
			'Punctuator )',
			'Punctuator @',
			'Punctuator {',
			'Punctuator <',
			'JSXIdentifier p',
			'JSXIdentifier class',
			'Punctuator =',
			'JSXText "a"',
			'Punctuator >',
			'JSXText \n\t\t',
			'Punctuator {',
			'Template `#${',
			'Identifier n',
			'Template }`',
			'Punctuator }',
			'JSXText  ',
			'JSXText \n\t\t',
			'Punctuator @',
			'Keyword if',
			'Punctuator (',
			'Identifier n',
			'Punctuator )',
			'Punctuator {',
			'Punctuator <',
			'Punctuator >',
			'Punctuator <',
			'JSXIdentifier style',
			'Punctuator >',
			'JSXText .b {}',
			'Punctuator <',
			'Punctuator /',
			'JSXIdentifier style',
			'Punctuator >',
			'Punctuator <',
			'JSXIdentifier b',
			'Punctuator /',
			'Punctuator >',
			'Punctuator <',
			'Punctuator /',
			'Punctuator >',
			'Punctuator }',
			'JSXText \n\t',
			'Punctuator <',
			'Punctuator /',
			'JSXIdentifier p',
			'Punctuator >',
			'Punctuator }',
		]);
		const comment_start = code.indexOf('// note');
		expect(comments).toEqual([
			expect.objectContaining({
				type: 'Line',
				value: ' note',
				range: [comment_start, comment_start + '// note'.length],
			}),
		]);

		// Every character outside whitespace and comments is in a token, and each
		// `loc` matches its `range`.
		const lines = code.split('\n');
		let position = 0;
		for (const item of [...tokens, ...comments].sort((a, b) => a.range[0] - b.range[0])) {
			expect(code.slice(position, item.range[0]).trim()).toBe('');
			const text = code.slice(item.range[0], item.range[1]);
			const { start, end } = item.loc;
			expect(lines[start.line - 1].startsWith(text.split('\n')[0], start.column)).toBe(true);
			expect(lines[end.line - 1].slice(0, end.column).endsWith(text.split('\n').at(-1)!)).toBe(
				true,
			);
			position = item.range[1];
		}
		expect(code.slice(position).trim()).toBe('');
	});

	it('starts and ends template elements and JSX children on tokens', () => {
		const spacing = { rules: { 'template-curly-spacing': 'error' } } as const;
		expect(lint('export const s = (y) => `x${y}z`;', spacing)).toEqual([]);
		expect(lint('export const s = (y) => `x${ y }z`;', spacing)).toEqual([
			"1: template-curly-spacing: Unexpected space(s) after '${'.",
			"1: template-curly-spacing: Unexpected space(s) before '}'.",
		]);

		const code = `export function A(x) @{
	<div>
		@if (x) { <span /> }
		// note
		<b />
		{/* empty */}
	</div>
}`;
		const indent = { rules: { indent: ['error', 'tab'] } } as const;
		expect(lint(code, indent)).toEqual([]);
		expect(lint(code.replace('\t\t<b />', '  <b />'), indent)).toEqual([
			'5: indent: Expected indentation of 2 tabs but found 2 spaces.',
		]);
	});

	it('gives text after a template directive block one JSXText token', () => {
		for (const text of [' hello', ' 2', ' if (a) b']) {
			const code = `export function A(x) @{
	<span>@if (x) { <b /> }${text}</span>
}`;
			const { tokens } = parseForESLint(code, { filePath: 'App.tsrx' }).ast as any;
			const start = code.indexOf(text);
			expect(
				tokens
					.filter((token: any) => token.range[0] >= start && token.range[0] < start + text.length)
					.map((token: any) => `${token.type} ${token.value}`),
			).toEqual([`JSXText ${text}`]);
		}
	});

	it('leaves @for heads alone under semi --fix', () => {
		for (const head of [
			'const item of items',
			'let item of items',
			'using item of items',
			'const item of items; index i; key item.id',
			'let n = 0; n < items.length; n++',
		]) {
			const code = `export function A({ items }) @{
	@for (${head}) { <li /> }
}
export const x = 1
`;
			const { output } = new Linter().verifyAndFix(
				code,
				{ files: ['**/*.tsrx'], languageOptions: { parser }, rules: { semi: 'error' } },
				'App.tsrx',
			);
			expect(output).toBe(code.replace('= 1\n', '= 1;\n'));
		}
	});

	it('resolves a @for index, key and @empty branch in their scopes', () => {
		const code = `import { prefix, emptyText, unused } from './x';
export function A({ items }) @{
	<ul>
		@for (const item of items; index i; key prefix + i) { <li>{i}: {item}</li> } @empty { <p>{emptyText}</p> }
		@for (const unusedItem of items; index unusedIndex) { <li /> }
		@for (const item of items) { <li>{item}</li> } @empty { <p>{item}</p> }
	</ul>
}`;
		expect(
			lint(code, {
				rules: { 'no-undef': 'error', 'no-unused-vars': 'error', 'init-declarations': 'error' },
			}),
		).toEqual([
			"1: no-unused-vars: 'unused' is defined but never used.",
			"5: no-unused-vars: 'unusedItem' is assigned a value but never used.",
			"5: no-unused-vars: 'unusedIndex' is defined but never used.",
			"6: no-undef: 'item' is not defined.",
		]);
	});
});
