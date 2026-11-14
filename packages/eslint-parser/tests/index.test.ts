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

	it('reports an unclosed tag at its name, the innermost one first', () => {
		let thrown: any;
		try {
			parseForESLint('export function App() @{\n\t<main><section>\n}\n', {
				filePath: 'App.tsrx',
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(SyntaxError);
		expect(thrown.message).toContain("Unclosed tag '<section>'");
		expect([thrown.lineNumber, thrown.column]).toEqual([2, 9]);
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

	it('parses a file with a warning and keeps the warning for ESLint rules', () => {
		const result = parseForESLint(
			`export function UserName({ user }: { user: { name: string } }) @{
				<p>@{user.name}</p>
			}`,
			{ filePath: 'App.tsrx' },
		);

		expect(result.ast.body).toHaveLength(1);
		expect(result.services?.tsrxDiagnostics).toEqual([
			expect.objectContaining({
				code: DIAGNOSTIC_CODES.CODE_BLOCK_EXPRESSION_ONLY,
				severity: 'warning',
			}),
		]);
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

	it('resolves names in the pending block of a plain try', () => {
		const code = `export function App() {
	try { foo(); } pending { bar(); } catch (e) { baz(e); }
}`;
		expect(lint(code, { rules: { 'no-undef': 'error' } })).toEqual([
			"2: no-undef: 'foo' is not defined.",
			"2: no-undef: 'bar' is not defined.",
			"2: no-undef: 'baz' is not defined.",
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

	it('reports a clause that no directive takes as a parse error (#1330)', () => {
		expect(
			lint('export function App({ ok }) @{\n\t<p>@if (ok) {<i />} note @else {<b />}</p>\n}\n'),
		).toEqual([
			'2: null: Parsing error: `@else` must come right after an `@if` block. To write it as text, write `&#64;else`.',
		]);
	});

	it('reports a plain try with only a pending block as a parse error', () => {
		const code = `export function App() @{
	try { <p>a</p> } pending { <p>loading</p> }
}`;
		expect(lint(code)).toEqual(['2: null: Parsing error: Missing catch or finally clause']);
		const [message] = new Linter().verify(
			code,
			{ files: ['**/*.tsrx'], languageOptions: { parser } },
			'App.tsrx',
		);
		expect([message.line, message.column]).toEqual([2, 2]);
	});

	it('accepts a plain try with a pending block and a catch or finally', () => {
		for (const clause of ['catch (e) { baz(e); }', 'finally { baz(); }']) {
			const code = `export function App() {
	try { foo(); } pending { bar(); } ${clause}
}`;
			expect(lint(code)).toEqual([]);
		}
	});

	it('gives each arm of an @if its own code path', () => {
		const code = `export function A({ n }) @{
	let x = 0;
	<div>
		@if (n) { throw new Error('a'); } @else if (n > 1) { <i /> } @else { <u /> }
		@if (n > 2) { x = 1; <b /> } @else { x = 2; <s /> }
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
		).toEqual(['2: no-useless-assignment', '6: no-unreachable']);
	});

	it('runs the blocks of a @try one after another', () => {
		// The README's known limitation: code path analysis doesn't know that
		// `@pending` and `@catch` run only when the body suspends or throws, so it
		// reports them, and the `@if` after them.
		const code = `export function A({ n }) @{
	<div>
		@try { throw new Error('b'); } @pending { <p /> } @catch (e) { <p>{String(e)}</p> }
		@if (n) { <i /> }
	</div>
}`;
		expect(
			lint(code, { rules: { 'no-unreachable': 'error' } }).map((message) =>
				message.split(': ', 2).join(': '),
			),
		).toEqual(['3: no-unreachable', '3: no-unreachable', '4: no-unreachable']);
	});

	it('visits the blocks of a @try in source order', () => {
		const names: string[] = [];
		lint(
			`export function A() @{
	@try { <a /> } @pending { <p /> } @catch (e) { <b /> }
}`,
			{
				plugins: {
					probe: {
						rules: {
							order: {
								create: () => ({
									'JSXOpeningElement > JSXIdentifier'(node: any) {
										names.push(node.name);
									},
								}),
							},
						},
					},
				},
				rules: { 'probe/order': 'error' },
			},
		);
		expect(names).toEqual(['a', 'p', 'b']);
	});

	it('keeps hooks in a @try body on one path, outside any try', () => {
		// Test doubles for two checks in eslint-plugin-react-hooks, which isn't a
		// dependency here: `use()` under a `TryStatement` or `CatchClause`, and a hook
		// that some path to the end skips.
		const seen: string[] = [];
		const code = `export function A({ p }) @{
	<div>
		@try {
			const data = use(p);
			const b = useB();
			<p>{data}{b}</p>
		} @pending {
			const s = use(p);
			<s>{s}</s>
		} @catch (e) {
			<b>{String(e)}</b>
		}
	</div>
}`;
		lint(code, {
			plugins: {
				probe: {
					rules: {
						hooks: {
							create: () => {
								const paths: Set<any>[] = [];
								return {
									onCodePathStart: () => paths.push(new Set()),
									onCodePathEnd: () => paths.pop(),
									onCodePathSegmentStart: (segment: any) => paths.at(-1)!.add(segment),
									onCodePathSegmentEnd: (segment: any) => paths.at(-1)!.delete(segment),
									'CallExpression[callee.name=/^use/]'(node: any) {
										let in_try = false;
										for (let parent = node.parent; parent; parent = parent.parent) {
											if (parent.type === 'TryStatement' || parent.type === 'CatchClause')
												in_try = true;
										}
										seen.push(
											`${node.callee.name} in a try: ${in_try}, segments: ${[...paths.at(-1)!].map((segment) => segment.id)}`,
										);
									},
								};
							},
						},
					},
				},
			},
			rules: { 'probe/hooks': 'error' },
		});
		expect(seen).toEqual([
			'use in a try: false, segments: s2_1',
			'useB in a try: false, segments: s2_1',
			'use in a try: false, segments: s2_1',
		]);
	});

	it('shows ESLint the if statement of an @if, and the blocks of a @try', () => {
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
		for (const tsrx_try_node of [tsrx_try, pending_only]) {
			expect(tsrx_try_node.type).toBe('JSXTryExpression');
			expect(tsrx_try_node.statement).toBeUndefined();
			expect(tsrx_try_node.block.type).toBe('BlockStatement');
			expect(tsrx_try_node.pending.type).toBe('BlockStatement');
		}
		expect(tsrx_try.handler.type).toBe('CatchClause');
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

	it('shows rules the name of a dynamic tag as the JSX name it mirrors', () => {
		// jsx-ast-utils' `elementType`, which eslint-plugin-react and
		// eslint-plugin-jsx-a11y use for the tag name, and the tag that
		// eslint-plugin-react's `no-danger` reads for each attribute.
		const element_type = (name: any): string =>
			name.type === 'JSXMemberExpression'
				? `${element_type(name.object)}.${name.property.name}`
				: name.name;
		const no_danger_tag = (name: any) => name.name || `${name.object.name}.${name.property.name}`;
		const names: string[] = [];
		lint(
			`export function App({ as, ui, icons, key, pick }) @{
	<>
		<{as} class="box">{'hi'}</{as}>
		<{ ui.Box } class="box" />
		<{this.items.Item} class="box" />
		<{'div'} class="box" />
		<{icons[key]} class="box" />
		<{pick()} class="box"></{pick()}>
	</>
}`,
			{
				plugins: {
					probe: {
						rules: {
							names: {
								create: (context) => {
									const text = (node: any) => context.sourceCode.getText(node);
									const record = (node: any) => {
										const { name } = node;
										const parts =
											name.type === 'JSXMemberExpression'
												? ` (${text(name.object)} . ${text(name.property)})`
												: '';
										names.push(
											`${node.type === 'JSXOpeningElement' ? '<' : '</'}${element_type(name)} ` +
												`${name.type} ${text(name)}${parts}`,
										);
										if (node.attributes?.length) no_danger_tag(name);
									};
									return { JSXOpeningElement: record, JSXClosingElement: record };
								},
							},
						},
					},
				},
				rules: { 'probe/names': 'error' },
			},
		);

		expect(names).toEqual([
			'<as JSXIdentifier {as}',
			'</as JSXIdentifier {as}',
			'<ui.Box JSXMemberExpression { ui.Box } (ui . Box)',
			'<this.items.Item JSXMemberExpression {this.items.Item} (this.items . Item)',
			// Shapes JSX names can't show get a synthetic name.
			"<tsrx-dynamic-tag JSXIdentifier {'div'}",
			'<tsrx-dynamic-tag JSXIdentifier {icons[key]}',
			'<tsrx-dynamic-tag JSXIdentifier {pick()}',
			'</tsrx-dynamic-tag JSXIdentifier {pick()}',
		]);
	});

	it('resolves the expression of a dynamic tag once per element', () => {
		const code = `import { icons, pick, unused } from './x';
export function App({ as, ui, key }) @{
	<>
		<{as} />
		<{ui.Box}>{'x'}</{ui.Box}>
		<{icons[key]} />
		<{pick()} />
		<{Missing} />
		<{missing.Box}>{'y'}</{missing.Box}>
	</>
}`;
		// eslint-scope adds JSX references of its own when JSX is enabled.
		for (const jsx of [false, true]) {
			const messages = new Linter().verify(
				code,
				{
					files: ['**/*.tsrx'],
					languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx } } },
					rules: { 'no-undef': 'error', 'no-unused-vars': 'error' },
				},
				'App.tsrx',
			);
			expect(messages.map((m) => `${m.line}:${m.column} ${m.ruleId}: ${m.message}`)).toEqual([
				"1:23 no-unused-vars: 'unused' is defined but never used.",
				"8:5 no-undef: 'Missing' is not defined.",
				"9:5 no-undef: 'missing' is not defined.",
			]);
		}
	});

	it('reads no reference from a closing tag', () => {
		const code = `export function App() @{
	<>
		<style>.a { color: red; }</style>
		<div class="a" />
	</>
}`;
		for (const jsx of [false, true]) {
			expect(
				lint(code, {
					languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx } } },
					rules: { 'no-undef': 'error' },
				}),
			).toEqual([]);
		}
	});

	it('keeps the expression of a dynamic tag in view of rules', () => {
		const code = `export class List {
	Item = 'li';
	render() @{
		<{this.Item}>{'a'}</{this.Item}>
	}
}
export function Icon({ icons }) @{
	<{icons['Home']} class="icon"></{icons['Home']}>
}
`;
		const { output, messages } = new Linter().verifyAndFix(
			code,
			{
				files: ['**/*.tsrx'],
				languageOptions: { parser },
				rules: { 'class-methods-use-this': 'error', 'dot-notation': 'error' },
			},
			'App.tsrx',
		);

		expect(messages).toEqual([]);
		expect(output).toBe(code.replaceAll("icons['Home']", 'icons.Home'));
	});

	it('keeps the braces of a dynamic tag when a rule fixes around its name', () => {
		// Fixes as eslint-plugin-react's `jsx-tag-spacing`, `jsx-first-prop-new-line`
		// and `jsx-closing-bracket-location` make them, from the name's range.
		const code = `export function App({ as }) @{
	< { as }
		class="box"  >{'hi'}</{ as }>
}`;
		const { output, messages } = new Linter().verifyAndFix(
			code,
			{
				files: ['**/*.tsrx'],
				languageOptions: { parser },
				plugins: {
					probe: {
						rules: {
							spacing: {
								meta: { fixable: 'whitespace' },
								create: (context) => ({
									JSXOpeningElement(node: any) {
										const opening = context.sourceCode.getTokenBefore(node.name)!;
										const [first] = node.attributes;
										const edits: Array<[number, number, string]> = [
											[opening.range[1], node.name.range[0], ''],
											[node.name.range[1], first.range[0], ' '],
											[first.range[1], node.range[1], '>'],
										];
										const { text } = context.sourceCode;
										if (edits.every(([start, end, value]) => text.slice(start, end) === value)) {
											return;
										}
										context.report({
											node,
											message: 'spacing',
											fix: (fixer) =>
												edits.map(([start, end, value]) =>
													fixer.replaceTextRange([start, end], value),
												),
										});
									},
								}),
							},
						},
					},
				},
				rules: { 'probe/spacing': 'error' },
			},
			'App.tsrx',
		);

		expect(messages).toEqual([]);
		expect(output).toBe(`export function App({ as }) @{
	<{ as } class="box">{'hi'}</{ as }>
}`);
	});
});
