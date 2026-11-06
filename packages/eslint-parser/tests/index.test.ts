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

	it('scopes a @for with a var or bare head to the loop', () => {
		const code = `export function A({ items }) @{
	let target;
	<ul>
		@for (var item of items; index i) { <li>{item}{i}</li> } @empty { <p>{item}{i}</p> }
		@for (var other of items; index i) { <li>{other}{i}</li> }
		@for (target of items; index j) { <li>{j}</li> } @empty { <p>{target}{j}</p> }
	</ul>
}`;
		expect(lint(code, { rules: { 'no-undef': 'error', 'no-redeclare': 'error' } })).toEqual([
			"4: no-undef: 'item' is not defined.",
			"4: no-undef: 'i' is not defined.",
			"6: no-undef: 'j' is not defined.",
		]);
	});

	it('defines the reset function of a @catch in its scope, as the error is', () => {
		const code = `export function A() @{
	<div>
		@try { <b /> } @catch (e, reset) { <button onClick={() => reset()}>{e.message}</button> }
		@try { <b /> } @catch (error, unusedReset) { <p>{error.message}</p> }
		@try { <b /> } @catch (e) { <p>{e.message}</p> }
		<p>{reset}</p>
	</div>
}`;
		expect(lint(code, { rules: { 'no-undef': 'error', 'no-unused-vars': 'error' } })).toEqual([
			"4: no-unused-vars: 'unusedReset' is defined but never used.",
			"6: no-undef: 'reset' is not defined.",
		]);
	});

	it('locates the loop of a @for with any line break', () => {
		for (const line_break of ['\n', '\r\n', '\r', ' ']) {
			const code = [
				'export function A({ items }) @{',
				'\t<ul>',
				'\t\t@for (const item of items) { <li>{item}</li> }',
				'\t</ul>',
				'}',
			].join(line_break);
			const tsrx_for = (parseForESLint(code, { filePath: 'App.tsrx' }).ast as any).body[0]
				.declaration.body.render.children[1];
			expect(tsrx_for.loc.start).toEqual({ line: 3, column: 2 });
			expect(tsrx_for.loop.loc).toEqual({
				start: { line: 3, column: 3 },
				end: { line: 3, column: 48 },
			});
		}
	});

	it('reports a plain try with only a pending block as a parse error', () => {
		const code = `export function App() @{
	try { <p>a</p> } pending { <p>loading</p> }
}`;
		expect(lint(code)).toEqual(['2: null: Parsing error: Missing catch or finally clause']);
	});

	it('gives each arm of an @if or @try its own code path', () => {
		const code = `export function A({ n }) @{
	let x = 0;
	<div>
		@if (n) { throw new Error('a'); } @else if (n > 1) { <i /> } @else { <u /> }
		@if (n > 2) { x = 1; <b /> } @else { x = 2; <s /> }
		@try { throw new Error('b'); } @catch (e) { <p>{String(e)}</p> }
		@try { <Child /> } @pending { <p /> } @catch (e) { <p>{String(e)}</p> }
		@try { <Child /> } @pending { <p /> }
		@if (n > 3) { throw new Error('c'); const late = 1; <p>{late}</p> }
		{x}
	</div>
}
export const B = ({ ok }) => @if (ok) { throw new Error('d'); } @else { <i /> };`;
		// Only `x = 0` is overwritten on every path, and only `late` follows a
		// `throw` in its own arm. (ESLint 9 words the first message differently.)
		expect(
			lint(code, {
				rules: { 'no-unreachable': 'error', 'no-useless-assignment': 'error' },
			}).map((message) => message.split(': ', 2).join(': ')),
		).toEqual(['2: no-useless-assignment', '9: no-unreachable']);
	});

	describe('@pending code paths', () => {
		const rules = { 'no-unreachable': 'error', 'no-useless-assignment': 'error' } as const;
		const app = (template: string, setup = '') => `export function App({ n }) @{
	${setup}
	<div>
		${template}
	</div>
}`;
		// Each shape, with and without a `@catch`.
		const with_and_without_catch = ['', ' @catch (e) { <p>err</p> }'];

		it('runs @pending after a @try body that throws', () => {
			for (const handler of with_and_without_catch) {
				const code = app(
					`@try { @{ throw new Error('x'); } } @pending { <p>loading</p> }${handler}`,
				);
				expect(lint(code, { rules })).toEqual([]);
			}
		});

		it('keeps a value that only @pending reads', () => {
			for (const handler of with_and_without_catch) {
				for (const body of [`@{ x = 1; } <p>{x}</p>`, `x = 1; <p>{x}</p>`]) {
					const code = app(`@try { ${body} } @pending { <p>{x}</p> }${handler}`, 'let x = 0;');
					expect(lint(code, { rules })).toEqual([]);
				}
			}
		});

		it('runs the body, the @catch and later code after a @pending that throws', () => {
			const later = `@try { <a /> } @pending { throw new Error('x'); }
		@if (n) { <i /> }`;
			expect(lint(app(later), { rules })).toEqual([]);
			for (const body of [`<a />`, `throw new Error('x');`]) {
				const handled = `@try { ${body} } @pending { throw new Error('y'); } @catch (e) { <p /> }
		@if (n) { <i /> }`;
				expect(lint(app(handled), { rules })).toEqual([]);
			}
		});

		it('reaches @pending and later code when the @catch throws', () => {
			const code = app(`@try { <a /> } @pending { <p /> } @catch (e) { throw e; }
		@if (n) { <i /> }`);
			expect(lint(code, { rules })).toEqual([]);
		});

		it('reads a value assigned and read in @pending, or read in @catch', () => {
			for (const handler of with_and_without_catch) {
				const code = app(
					`@try { <a /> } @pending { const y = n; let v = y; v += 1; <p>{v}</p> }${handler}`,
				);
				expect(lint(code, { rules })).toEqual([]);
			}
			const code = app(
				`@try { <a /> } @pending { x = 1; <p /> } @catch (e) { <p>{x}</p> }`,
				'let x = 0;',
			);
			expect(lint(code, { rules })).toEqual([]);
		});

		it('still reports dead code and overwritten values', () => {
			const messages = (template: string, setup?: string) =>
				lint(app(template, setup), { rules }).map((message) => message.split(': ', 2).join(': '));
			const later = `
		@if (n) { <i /> }`;
			expect(
				messages(`@try { <a /> } @pending { throw new Error('x'); const late = 1; <p>{late}</p> }`),
			).toEqual(['4: no-unreachable']);
			expect(messages(`@try { throw new Error('x'); } @pending { <p /> }${later}`)).toEqual([
				'5: no-unreachable',
			]);
			expect(
				messages(
					`@try { throw new Error('x'); } @pending { <p /> } @catch (e) { throw e; }${later}`,
				),
			).toEqual(['5: no-unreachable']);
			expect(
				messages(
					`@try { <a /> } @pending { x = 1; x = 2; <p>{x}</p> } @catch (e) { <p /> }`,
					'let x = 0;',
				),
			).toEqual(['2: no-useless-assignment', '4: no-useless-assignment']);
		});

		it('hides the test of a @pending branch from rules', () => {
			const code = app(
				`@try { <a /> } @pending { <p>{n}</p> } @catch (e) { <p /> }
		@try { <a /> } @pending { <p /> }`,
			);
			expect(
				lint(code, {
					rules: {
						curly: 'error',
						'no-cond-assign': 'error',
						'no-constant-condition': 'error',
						'no-dupe-else-if': 'error',
						'no-else-return': 'error',
						'no-extra-boolean-cast': 'error',
						'no-lonely-if': 'error',
						'no-undef': 'error',
						'no-unused-vars': ['error', { caughtErrors: 'none' }],
					},
				}),
			).toEqual([]);
		});

		it('visits a @try with a @catch in source order, and @pending first without one', () => {
			const visited = (template: string) => {
				const names: string[] = [];
				lint(app(template), {
					plugins: {
						probe: {
							rules: {
								order: {
									create: () => ({
										'JSXOpeningElement > JSXIdentifier, CatchClause > Identifier'(node: any) {
											names.push(node.name);
										},
									}),
								},
							},
						},
					},
					rules: { 'probe/order': 'error' },
				});
				return names;
			};
			expect(visited(`@try { <a /> } @pending { <b /> } @catch (c) { <d /> }`)).toEqual([
				'div',
				'a',
				'b',
				'c',
				'd',
			]);
			expect(visited(`@try { <a /> } @pending { <b /> }`)).toEqual(['div', 'b', 'a']);
		});

		it('leaves a @catch after @pending as it is without one', () => {
			const code = `export function App({ call }) @{
	<div>
		@try { <a /> } @pending { call(); <p /> } /* note */ @catch (e) { throw e; }
	</div>
}`;
			const seen: unknown[] = [];
			const messages = lint(code, {
				plugins: {
					probe: {
						rules: {
							clause: {
								create: ({ sourceCode }) => ({
									CatchClause(node: any) {
										seen.push(
											node.parent.type,
											node.parent.handler.clause === node,
											sourceCode.getFirstToken(node)?.value,
											sourceCode.getFirstToken(node, (token) => token.value === '(')?.range,
											sourceCode.getCommentsBefore(node).map((comment) => comment.value),
											sourceCode.getCommentsInside(node),
											sourceCode.getText(node),
										);
									},
								}),
							},
						},
					},
				},
				rules: { 'no-useless-catch': 'error', 'probe/clause': 'error' },
			});
			const start = code.indexOf('@catch');
			expect(seen).toEqual([
				'TryStatement',
				true,
				'@',
				[code.indexOf('(e)'), code.indexOf('(e)') + 1],
				[' note '],
				[],
				code.slice(start, code.indexOf(' }\n\t</div>') + 2),
			]);
			// On the `try`, as it is with no `@pending`.
			expect(messages).toEqual(['3: no-useless-catch: Unnecessary try/catch wrapper.']);
			expect(lint(code, { rules: { 'no-useless-catch': 'error' } })).toEqual(messages);
		});

		it('applies a comment above a @catch to the @catch', () => {
			const code = `export function App() @{
	<div>
		@try { <a /> } @pending { <p /> }
		// eslint-disable-next-line no-restricted-syntax
		@catch (e) { <b>{e}</b> }
	</div>
}`;
			expect(lint(code, { rules: { 'no-restricted-syntax': ['error', 'CatchClause'] } })).toEqual(
				[],
			);
		});

		it('keeps every child inside the range of its parent', () => {
			const code = app(
				`@try { <a /> } /* a */ @pending /* b */ { <p title="t">{n}</p> } /* c */ @catch (e) { <b>{e}</b> }
		@try { <a /> } @pending { @try { <i /> } @pending { <p /> } @catch { <b /> } }
		@try { @try { <a /> } @pending { <p /> } @catch (e, reset) { <b /> } } @pending { <p /> }
		@if (n) { <i /> } @else { <u /> }
		@for (const item of n; index i; key item) { <li>{i}</li> } @empty { <p /> }
		@switch (n) { @case 1: { <i /> } @default: { <u /> } }`,
			);
			const { ast, visitorKeys } = parseForESLint(code, { filePath: 'App.tsrx' }) as any;
			let visited = 0;
			const visit = (node: any, parent: any) => {
				visited++;
				if (parent) {
					expect([node.type, node.range[0] >= parent.range[0]]).toEqual([node.type, true]);
					expect([node.type, node.range[1] <= parent.range[1]]).toEqual([node.type, true]);
				}
				const keys =
					visitorKeys[node.type] ??
					Object.keys(node).filter((key) => !['parent', 'loc', 'range', 'metadata'].includes(key));
				for (const key of keys) {
					for (const child of [node[key]].flat()) {
						if (child?.range && child.type !== 'Line' && child.type !== 'Block') {
							visit(child, node);
						}
					}
				}
			};
			visit(ast, null);
			expect(visited).toBeGreaterThan(100);
		});

		it('finds a node in @pending by its position', () => {
			const code = app(
				'@try { <a /> } @pending { const sql = `select 1`; <pre title="t">{sql}</pre> } @catch (e) { <b>{e}</b> }',
			);
			const linter = new Linter();
			expect(
				linter.verify(code, { files: ['**/*.tsrx'], languageOptions: { parser } }, 'App.tsrx'),
			).toEqual([]);
			const source = linter.getSourceCode();
			const node_at = (text: string) => source.getNodeByRangeIndex(code.indexOf(text))?.type;
			expect(node_at('pending')).toBe('JSXPendingKeyword');
			expect(node_at('select')).toBe('TemplateElement');
			expect(node_at('pre')).toBe('JSXIdentifier');
			expect(node_at('"t"')).toBe('Literal');
			expect(node_at('(e)')).toBe('CatchClause');
			expect(node_at('e)')).toBe('Identifier');
			expect(source.getNodeByRangeIndex(code.indexOf('<a />'))?.type).toBe('JSXOpeningElement');
		});

		it('leaves a template literal in @pending to the rules that skip it', () => {
			for (const handler of with_and_without_catch) {
				const code = app(
					`@try { <a /> } @pending {
			const sql = \`select 1${'   '}
				from t\`;
			<pre>{sql}</pre>
		}${handler}`,
					'const label = 1;',
				);
				const { fixed, output } = new Linter().verifyAndFix(
					code,
					{
						files: ['**/*.tsrx'],
						languageOptions: { parser },
						rules: { 'no-trailing-spaces': 'error' },
					},
					{ filename: 'App.tsrx' },
				);
				expect(fixed).toBe(false);
				expect(output).toBe(code);
			}
		});

		it('gives rules that look a node up by position the node in @pending', () => {
			const long = 'a'.repeat(90);
			const cases: Array<[string, Linter.RuleEntry, string, number]> = [
				['no-mixed-spaces-and-tabs', 'error', 'const s = `line\n \tone`; <p>{s}</p>', 0],
				['max-len', ['error', { code: 80, ignoreStrings: true }], `<p title="${long}" />`, 0],
				[
					'object-curly-spacing',
					['error', 'always', { objectsInObjects: false }],
					'const o = { a: { b: 1 }}; <p>{o.a.b}</p>',
					0,
				],
				[
					'object-curly-spacing',
					['error', 'always', { arraysInObjects: false }],
					'const o = { a: [1]}; <p>{o.a[0]}</p>',
					0,
				],
				[
					'lines-around-comment',
					['error', { beforeBlockComment: true, allowBlockStart: true }],
					'\n\t\t\t/* note */\n\t\t\t<p />',
					0,
				],
				[
					'no-multi-spaces',
					['error', { exceptions: { Property: true } }],
					'const y = { a:  1 }; <p>{y.a}</p>',
					0,
				],
				[
					'padding-line-between-statements',
					['error', { blankLine: 'always', prev: 'block-like', next: '*' }],
					'{ n; }\n\t\t\tconst y = 2; <p>{y}</p>',
					1,
				],
			];
			for (const handler of with_and_without_catch) {
				for (const [rule, entry, body, count] of cases) {
					const code = app(`@try { <a /> } @pending { ${body} }${handler}`);
					expect([rule, lint(code, { rules: { [rule]: entry } }).length]).toEqual([rule, count]);
				}
			}
		});

		it('does not read a throw in @pending as a throw in the @catch', () => {
			const code = app(
				`@try { <a /> } @pending { throw new Error('p'); } @catch (e) { <b>{e}</b> }`,
				'const label = n;',
			);
			expect(lint(code, { rules: { 'preserve-caught-error': 'error' } })).toEqual([]);
		});

		it('finds the scope of a @pending branch outside the @catch', () => {
			const scopes: string[] = [];
			const code = app(`@try { <a /> } @pending { <p /> } @catch (e) { <b>{e}</b> }`);
			lint(code, {
				plugins: {
					probe: {
						rules: {
							scope: {
								create: ({ sourceCode }) => ({
									'JSXTryHandler > IfStatement'(node: any) {
										for (const part of [node, node.test, node.consequent]) {
											scopes.push(sourceCode.getScope(part).type);
										}
									},
								}),
							},
						},
					},
				},
				rules: { 'probe/scope': 'error' },
			});
			expect(scopes).toEqual(['function', 'function', 'block']);
		});

		it('keeps @pending out of the scope of the @catch', () => {
			const code = app(
				`@try { <a /> } @pending { <p>{e}</p> } @catch (e) { <p>{e}</p> }
		@try { <a /> } @pending { const e = 1; <p>{e}</p> } @catch (e) { <p>{e}</p> }`,
			);
			expect(
				lint(code, {
					rules: { 'no-undef': 'error', 'no-shadow': 'error', 'no-redeclare': 'error' },
				}),
			).toEqual(["4: no-undef: 'e' is not defined."]);
		});
	});

	it('shows ESLint the if or try statement of an @if or @try', () => {
		const code = `export function A({ n }) @{
	<div>
		@if (n) { <i /> } @else { <u /> }
		@try { <b /> } @pending { <p /> } @catch (e) { <s /> }
		@try { <b /> } @pending { <p /> }
	</div>
}`;
		const [, tsrx_if, , tsrx_try, , pending_only] = (
			parseForESLint(code, { filePath: 'App.tsrx' }).ast as any
		).body[0].declaration.body.render.children;
		expect(tsrx_if.type).toBe('JSXIfExpression');
		expect(tsrx_if.statement).toMatchObject({
			type: 'IfStatement',
			loc: { start: { line: 3, column: 3 }, end: { line: 3, column: 35 } },
			test: { name: 'n' },
			consequent: { type: 'BlockStatement' },
			alternate: { type: 'BlockStatement' },
		});
		expect(tsrx_try.type).toBe('JSXTryExpression');
		expect(tsrx_try.statement).toMatchObject({
			type: 'TryStatement',
			loc: { start: { line: 4, column: 3 }, end: { line: 4, column: 56 } },
			block: { type: 'BlockStatement' },
			handler: {
				type: 'JSXTryHandler',
				loc: { start: { line: 4, column: 18 }, end: { line: 4, column: 56 } },
				pending: {
					type: 'IfStatement',
					loc: { start: { line: 4, column: 18 }, end: { line: 4, column: 35 } },
					test: {
						type: 'JSXPendingKeyword',
						loc: { start: { line: 4, column: 18 }, end: { line: 4, column: 25 } },
					},
					consequent: { type: 'BlockStatement' },
					alternate: null,
				},
				clause: {
					type: 'CatchClause',
					loc: { start: { line: 4, column: 36 }, end: { line: 4, column: 56 } },
				},
			},
		});
		const { param, body, clause } = tsrx_try.statement.handler;
		expect(param).toBe(clause.param);
		expect(body).toBe(clause.body);
		expect(param.name).toBe('e');
		expect(Object.keys(tsrx_try.statement.handler)).not.toContain('body');
		expect(tsrx_try.pending).toBeNull();
		// A `try` needs a `catch` or `finally`.
		expect(pending_only.statement).toBeUndefined();
		expect(pending_only.block.type).toBe('BlockStatement');
		expect(pending_only.pending).toMatchObject({
			type: 'IfStatement',
			test: { type: 'JSXPendingKeyword' },
			consequent: { type: 'BlockStatement' },
		});
	});

	it('gives TypeScript function types the params ESLint reads', () => {
		const code = `type Fn = (a: number, b: string, c: boolean) => void;
type Ctor = new (a, b, c) => object;
interface Api {
	(a, b, c): void;
	new (a, b, c): Api;
	method(a, b, c): void;
}
export function Button(props: { onPress?: () => void }) @{
	<button onClick={props.onPress}>{'ok'}</button>
}`;
		expect(lint(code, { rules: { 'max-params': ['error', 2] } })).toEqual([
			'1: max-params: Function has too many parameters (3). Maximum allowed is 2.',
		]);
		const [fn, ctor, api] = (parseForESLint(code, { filePath: 'App.tsrx' }).ast as any).body;
		for (const node of [fn.typeAnnotation, ctor.typeAnnotation, ...api.body.body]) {
			expect(node.params.map((param: any) => param.name)).toEqual(['a', 'b', 'c']);
		}
	});

	it('gives jsx-ast-utils a {name} shorthand attribute as a JSXAttribute', () => {
		// jsx-ast-utils' `propName` and `getPropValue`, which eslint-plugin-react
		// and eslint-plugin-jsx-a11y call on every attribute that is not a spread.
		const prop_name = (prop: any) => {
			if (prop.type !== 'JSXAttribute') {
				throw new Error('The prop must be a JSXAttribute collected by the AST parser.');
			}
			return prop.name.name;
		};
		const prop_value = (prop: any) => {
			if (prop.value === null) return true;
			const value =
				prop.value.type === 'JSXExpressionContainer' ? prop.value.expression : prop.value;
			return value.type === 'Identifier' ? value.name : value.value;
		};
		const props: string[] = [];
		const messages = lint(
			`export function App({ onClick }) @{
	<button {onClick} type="submit" />
}`,
			{
				plugins: {
					probe: {
						rules: {
							props: {
								create: (context) => ({
									JSXOpeningElement(node: any) {
										for (const prop of node.attributes) {
											props.push(`${prop_name(prop)}=${prop_value(prop)}`);
										}
									},
								}),
							},
						},
					},
				},
				rules: { 'no-unused-vars': 'error', 'probe/props': 'error' },
			},
		);

		expect(messages).toEqual([]);
		expect(props).toEqual(['onClick=onClick', 'type=submit']);
	});
});
