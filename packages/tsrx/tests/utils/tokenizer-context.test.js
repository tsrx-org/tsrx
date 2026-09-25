/** @import * as AST from 'estree' */
/** @import { ParseOptions } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { acorn } from '../../src/index.js';
import { parse_in_worker, parse_in_worker_with_ast } from '../shared/parse-in-worker.js';

/**
 * Tokens that depend on what comes before them: a comment after a directive's
 * keyword (#477), an expression that starts with `@` after `yield` (#547), a
 * regular expression that starts with `>` (#584), a `</` after an operand
 * (#586), and what can follow an element (#426). Each source is parsed in a
 * worker, so a parse that never returns fails the test instead of stalling the
 * run.
 */

/** @type {Array<ParseOptions | undefined>} */
const modes = [undefined, { collect: true }, { loose: true }];

/**
 * Parse each source in every mode, expect it to parse without collected
 * errors, and return the program of its strict parse.
 * @param {string[]} sources
 * @returns {Promise<AST.Program[]>}
 */
async function parse_all(sources) {
	const inputs = sources.flatMap((source) => modes.map((options) => ({ source, options })));
	const outcomes = await parse_in_worker_with_ast(inputs);
	expect(
		outcomes.map((outcome) =>
			outcome.ok ? (outcome.errors?.map((error) => error.message) ?? []) : outcome.message,
		),
	).toEqual(inputs.map(() => []));
	return sources.map((_, index) => {
		const outcome = outcomes[index * modes.length];
		if (!outcome.ok) throw new Error(outcome.message);
		return outcome.ast;
	});
}

/**
 * Parse each source in every mode and expect it to throw `message` at `at`:
 * an offset, or the first occurrence of that text in the source.
 * @param {Array<[source: string, message: string, at: string | number]>} cases
 */
async function expect_errors(cases) {
	const inputs = cases.flatMap(([source]) => modes.map((options) => ({ source, options })));
	const outcomes = await parse_in_worker(inputs);
	expect(outcomes).toEqual(
		cases.flatMap(([source, message, at]) => {
			const pos = typeof at === 'number' ? at : source.indexOf(at);
			expect(pos, `${JSON.stringify(at)} in ${JSON.stringify(source)}`).toBeGreaterThan(-1);
			const { line, column } = acorn.getLineInfo(source, pos);
			return modes.map(() => ({ ok: false, message: `${message} (${line}:${column})`, pos }));
		}),
	);
}

/**
 * The first node, depth first, whose type passes `match`.
 * @param {unknown} value
 * @param {(type: string) => boolean} match
 * @returns {(AST.Node & Record<string, any>) | undefined}
 */
function find(value, match) {
	if (!value || typeof value !== 'object') return undefined;
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = find(item, match);
			if (found) return found;
		}
		return undefined;
	}
	const node = /** @type {AST.Node & Record<string, any>} */ (value);
	if (typeof node.type === 'string' && match(node.type)) return node;
	for (const key of Object.keys(node)) {
		if (key === 'loc' || key === 'metadata') continue;
		const found = find(node[key], match);
		if (found) return found;
	}
	return undefined;
}

/** @param {string} type */
const is_directive = (type) =>
	type === 'JSXIfExpression' ||
	type === 'JSXForExpression' ||
	type === 'JSXSwitchExpression' ||
	type === 'JSXTryExpression';

/**
 * The statements of a program, or of its only function's body.
 * @param {AST.Program} program
 * @returns {Array<AST.Node & Record<string, any>>}
 */
function statements(program) {
	const [first] = program.body;
	if (program.body.length === 1 && first.type === 'FunctionDeclaration') {
		return /** @type {any} */ (first.body).body;
	}
	return /** @type {any} */ (program.body);
}

/**
 * The value a statement holds: a declaration's initializer or an expression
 * statement's expression.
 * @param {AST.Node & Record<string, any>} statement
 * @returns {AST.Node & Record<string, any>}
 */
function value_of(statement) {
	if (statement.type === 'VariableDeclaration') return statement.declarations[0].init ?? statement;
	if (statement.type === 'ExpressionStatement') return statement.expression;
	return statement;
}

describe('a comment after a directive keyword (#477)', () => {
	it('reads the directive, as it reads the statement without the `@`', async () => {
		/** @type {Array<[source: string, type: string]>} */
		const cases = [
			[
				'function A() @{\n  @try /* c */ {\n    <b />\n  } @catch (e) {\n    <p />\n  }\n}',
				'JSXTryExpression',
			],
			[
				'function A() @{\n  @try // c\n  {\n    <b />\n  } @pending {\n    <p />\n  }\n}',
				'JSXTryExpression',
			],
			['function A() @{\n  @if /* c */ (x) {\n    <b />\n  }\n}', 'JSXIfExpression'],
			['function A() @{\n  @if // c\n  (x) {\n    <b />\n  }\n}', 'JSXIfExpression'],
			['function A() @{\n  @for /* c */ (const x of xs) {\n    <b />\n  }\n}', 'JSXForExpression'],
			['function A() @{\n  @for // c\n  (const x of xs) {\n    <b />\n  }\n}', 'JSXForExpression'],
			[
				'async function A() @{\n  @for /* c */ await /* d */ (const x of xs) {\n    <b />\n  }\n}',
				'JSXForExpression',
			],
			[
				'async function A() @{\n  @for await // c\n  (const x of xs) {\n    <b />\n  }\n}',
				'JSXForExpression',
			],
			[
				'function A() @{\n  @switch /* c */ (x) {\n    @case 1: {\n      <b />\n    }\n  }\n}',
				'JSXSwitchExpression',
			],
			[
				'function A() @{\n  const x = 1;\n  @if /* c */ (x) {\n    <b />\n  }\n}',
				'JSXIfExpression',
			],
			['const v = @if /* c */ (x) { <b /> };', 'JSXIfExpression'],
			['const v = @for /* c */ (const x of xs) { <b /> };', 'JSXForExpression'],
			['const v = () => @switch /* c */ (x) { @case 1: { <b /> } };', 'JSXSwitchExpression'],
			['const v = @try /* c */ { <b /> } @catch { <i /> };', 'JSXTryExpression'],
			[
				'function A() @{\n  <div>\n    @if /* c */ (x) {\n      <b />\n    }\n  </div>\n}',
				'JSXIfExpression',
			],
			[
				'function A() @{\n  <div>\n    @for // c\n    (const x of xs) {\n      <b />\n    }\n  </div>\n}',
				'JSXForExpression',
			],
		];
		const programs = await parse_all(cases.map(([source]) => source));
		expect(programs.map((program) => find(program, is_directive)?.type)).toEqual(
			cases.map(([, type]) => type),
		);
	});

	it('reads a directive in element children that used to be text and a container', async () => {
		// The comment made `@if` text, so the text was `@if  (x) ` and `{ <b /> }`
		// an expression container.
		const [program] = await parse_all(['const v = <div>@if /* c */ (x) { <b /> }</div>;']);
		const element = value_of(statements(program)[0]);
		expect(element.children.map((/** @type {AST.Node} */ child) => child.type)).toEqual([
			'JSXIfExpression',
		]);
	});

	it('keeps reading comments around the clause keywords', async () => {
		const programs = await parse_all([
			'function A() @{\n  @if (x) {\n    <b />\n  } /* c */ @else /* d */ if /* e */ (y) {\n    <i />\n  } // f\n  @else // g\n  {\n    <p />\n  }\n}',
			'function A() @{\n  @for (const x of xs) {\n    <b />\n  } @empty /* c */ {\n    <p />\n  }\n}',
			'function A() @{\n  @try {\n    <b />\n  } @pending // c\n  {\n    <p />\n  } @catch /* d */ (e) {\n    <i />\n  }\n}',
			'function A() @{\n  @switch (x) {\n    @case /* c */ 1: {\n      <b />\n    }\n    @default // d\n    : {\n      <i />\n    }\n  }\n}',
		]);
		expect(programs.map((program) => find(program, is_directive)?.type)).toEqual([
			'JSXIfExpression',
			'JSXForExpression',
			'JSXTryExpression',
			'JSXSwitchExpression',
		]);
	});

	it('still says which clause keyword needs its `@` when a comment follows the keyword', async () => {
		await expect_errors([
			[
				'function A() @{\n  @if (x) {\n    <b />\n  } else /* c */ {\n    <i />\n  }\n}',
				'Expected `@else` after `@if` block.',
				'else',
			],
			[
				'function A() @{\n  @if (x) {\n    <b />\n  } else // c\n  if (y) {\n    <i />\n  }\n}',
				'Expected `@else` after `@if` block.',
				'else',
			],
			[
				'function A() @{\n  @for (const x of xs) {\n    <b />\n  } empty /* c */ {\n    <i />\n  }\n}',
				'Expected `@empty` after `@for` block.',
				'empty',
			],
			[
				'function A() @{\n  @try {\n    <b />\n  } pending /* c */ {\n    <i />\n  }\n}',
				'Expected `@pending` after `@try` block.',
				'pending',
			],
			[
				'function A() @{\n  @try {\n    <b />\n  } catch /* c */ (e) {\n    <i />\n  }\n}',
				'Expected `@catch` after `@try` block.',
				'catch',
			],
		]);
	});

	it('still needs the `@` and the keyword to touch', async () => {
		await expect_errors([
			['function A() @{\n  @ /* c */ if (x) {\n    <b />\n  }\n}', "Unexpected keyword 'if'", 'if'],
		]);
	});
});

describe('an expression that starts with `@` after `yield` (#547)', () => {
	it('takes a TSRX expression as the argument of `yield`', async () => {
		/** @type {Array<[source: string, type: string]>} */
		const cases = [
			['export function* nodes() { yield @{ <div /> }; }', 'JSXCodeBlock'],
			['export function* nodes() { yield @if (ok) { <div /> }; }', 'JSXIfExpression'],
			['export function* nodes() { yield @for (const x of xs) { <div /> }; }', 'JSXForExpression'],
			[
				'export function* nodes() { yield @switch (x) { @case 1: { <div /> } }; }',
				'JSXSwitchExpression',
			],
			['export function* nodes() { yield @try { <div /> } @catch { <i /> }; }', 'JSXTryExpression'],
			['export function* nodes() { const node = yield @{ <div /> }; }', 'JSXCodeBlock'],
			['export function* nodes() { f(yield /* c */ @if (ok) { <div /> }, 1); }', 'JSXIfExpression'],
			['export async function* nodes() { yield @{ <div /> }; }', 'JSXCodeBlock'],
			['export function* nodes() { yield (@{ <div /> }); }', 'JSXCodeBlock'],
			['export function* nodes() { yield <div />; }', 'JSXElement'],
		];
		const programs = await parse_all(cases.map(([source]) => source));
		expect(
			programs.map((program) => {
				const expression = find(program, (type) => type === 'YieldExpression');
				return [expression?.delegate, expression?.argument?.type];
			}),
		).toEqual(cases.map(([, type]) => [false, type]));
	});

	it('ends `yield` at a line break before the `@`', async () => {
		const [program] = await parse_all(['export function* nodes() {\n  yield\n  @{ <div /> };\n}']);
		const body = /** @type {any} */ (program.body[0]).declaration.body.body;
		expect(body.map((/** @type {any} */ statement) => value_of(statement).type)).toEqual([
			'YieldExpression',
			'JSXCodeBlock',
		]);
		expect(value_of(body[0]).argument).toBe(null);
	});
});

describe('a regular expression that starts with `>` (#584)', () => {
	it('reads the regular expression and the code after it', async () => {
		const sources = [
			'const CLOSE_TAG_REGEX = />/g;\nconst x = 1;',
			'f(/>/);\nx = 1;',
			'c = />/g.test(s);',
			'const c = />a/.test(s) && 1;',
			'const s = t.replace(/>/g, "&gt;").replace(/</g, "&lt;");\nconst x = 1;',
			'if (/>/.test(s)) {}\nconst x = 1;',
			'if (x) />/.test(s);\nconst y = 1;',
			'{}\n/>/.test(s);\nconst y = 1;',
			'switch (x) { case />/: break; }\nconst y = 1;',
			'const t = typeof />/;\nconst y = 1;',
			'const a = x ? />/ : /</;\nconst y = 1;',
			'const a = `${/>/.source}`;\nconst y = 1;',
			'const a = { re: />/ };\nconst y = 1;',
			'const a = (x) => />/;\nconst y = 1;',
			'async function f() { await />/; x = 1; }',
			'function* g() { yield />/; }\nconst y = 1;',
			'export function App() @{\n  const ok = />/.test(s);\n  @if (ok) {\n    <b />\n  }\n}',
			'export function App() @{\n  <div>{/>/.test(s) ? 1 : 2}</div>\n}',
			'export function App() @{\n  <div title={/>/.source} />\n}',
			'export function App() @{\n  @if (/>/.test(s)) {\n    <b />\n  }\n}',
			'const a = <div title={/>/.source} />;\nconst b = 1;',
			'const a = <div>{/>/.source}</div>;\nconst b = 1;',
		];
		const programs = await parse_all(sources);
		expect(
			programs.map((program) => {
				const literal = find(program, (type) => type === 'Literal');
				return literal?.regex?.pattern.startsWith('>') ? 'regex' : literal?.type;
			}),
		).toEqual(sources.map(() => 'regex'));
	});

	it('still reads `/>` as the end of an open tag', async () => {
		const programs = await parse_all([
			'const a = <Foo<T> />;\nconst b = 1;',
			'const a = <A render={() => <b />} x={1} />;\nconst b = 1;',
			'export function App() @{\n  <A render={() => <b />} />\n}',
			'export function App() @{\n  <A render={() => { return <b /> }} />\n}',
			'export function App() @{\n  <A slot={@if (x) { <b /> } @else { <i /> }} />\n}',
			'const a = (<div />) < <div />;\nconst b = 1;',
		]);
		expect(programs.map((program) => statements(program).length)).toEqual([2, 2, 1, 1, 1, 2]);
	});
});

describe('`</` after an operand (#586)', () => {
	it('starts a closing tag, as in TSX, so the expression ends there', async () => {
		// TypeScript reports `',' expected` at the `</`.
		await expect_errors([
			['const b = a </re/.test(c);', 'Unexpected token', '</'],
			[
				'function App() { return <div>@{\n  const x = 3</div>/\n  <>{x}</>\n}</div>; }',
				'Unexpected token',
				'</div>/',
			],
		]);
	});

	it('keeps less-than before a space or a comment', async () => {
		const programs = await parse_all([
			'const b = a < /re/.test(c);',
			'const b = a <// c\n  d;',
			'const b = a </* c */ d;',
			'const a = <div>{a < /re/.test(b)}</div>;',
		]);
		expect(
			programs.map((program) => find(program, (type) => type === 'BinaryExpression')?.operator),
		).toEqual(['<', '<', '<', '<']);
	});
});

describe('what follows an element (#426)', () => {
	it('starts a new statement at a `(`, `[`, or template literal on the next line', async () => {
		/** @type {Array<[value: string, type: string]>} */
		const values = [
			['<b>x</b>', 'JSXElement'],
			['<b />', 'JSXElement'],
			['<>x</>', 'JSXFragment'],
			['@{ <b /> }', 'JSXCodeBlock'],
			['@if (x) { <b /> }', 'JSXIfExpression'],
			['@if (x) { <b /> } @else { <i /> }', 'JSXIfExpression'],
			['@for (const x of xs) { <b /> }', 'JSXForExpression'],
			['@switch (x) { @case 1: { <b /> } }', 'JSXSwitchExpression'],
			['@try { <b /> } @catch { <i /> }', 'JSXTryExpression'],
		];
		/** @type {Array<[next: string, type: string]>} */
		const nexts = [
			['(foo)', 'Identifier'],
			['[1].map(f)', 'CallExpression'],
			['`t${a}`', 'TemplateLiteral'],
		];
		const cases = values.flatMap(([value, type]) =>
			nexts.flatMap(([next, next_type]) => [
				{ source: `const a = ${value}\n${next}`, types: [type, next_type] },
				{ source: `function f() {\n  const a = ${value}\n  ${next}\n}`, types: [type, next_type] },
				{
					source: `const f = () => ${value}\n${next}`,
					types: ['ArrowFunctionExpression', next_type],
				},
			]),
		);
		const programs = await parse_all(cases.map(({ source }) => source));
		expect(
			programs.map((program) => statements(program).map((statement) => value_of(statement).type)),
		).toEqual(cases.map(({ types }) => types));
		expect(
			programs
				.filter((_, index) => cases[index].types[0] === 'ArrowFunctionExpression')
				.map((program) => value_of(statements(program)[0]).body.type),
		).toEqual(values.flatMap(([, type]) => nexts.map(() => type)));
	});

	it('rejects a call, member access, index, non-null assertion, or tagged template after it', async () => {
		// TypeScript reports `',' expected` at the same token.
		/** @type {Array<[source: string, message: string, at: number]>} */
		const cases = [];
		for (const value of ['<b />', '<b>x</b>', '<>x</>', '@{ <b /> }', '@if (x) { <b /> }']) {
			for (const next of ['.foo', '?.foo', '!', '(x)', '[0]', '`t`']) {
				const before = `const e = ${value}`;
				cases.push([`${before}${next};`, 'Unexpected token', before.length]);
			}
		}
		await expect_errors(cases);
	});

	it('keeps a call, member access, index, non-null assertion, or tagged template in parentheses', async () => {
		const sources = [
			'const e = (<b />).foo;',
			'const e = (<b />)?.foo;',
			'const e = (<b />)!;',
			'const e = (<b />)(x);',
			'const e = (<b />)[0];',
			'const e = (<b />)`t`;',
			'const e = (<>x</>)(x);',
			'const e = (@{ <b /> })(x);',
			'const e = (@if (x) { <b /> }).foo;',
		];
		const programs = await parse_all(sources);
		expect(programs.map((program) => value_of(statements(program)[0]).type)).toEqual([
			'MemberExpression',
			'ChainExpression',
			'TSNonNullExpression',
			'CallExpression',
			'MemberExpression',
			'TaggedTemplateExpression',
			'CallExpression',
			'CallExpression',
			'MemberExpression',
		]);
	});

	it('keeps operators after it, on its line or the next', async () => {
		const programs = await parse_all([
			'const e = <b /> + 1;',
			'const e = <b />\n  + 1;',
			'const e = <b /> as any;',
			'const e = <b /> satisfies X;',
			'const e = <b />\n  ? 1\n  : 2;',
			'const e = @{ <b /> } || null;',
		]);
		expect(programs.map((program) => value_of(statements(program)[0]).type)).toEqual([
			'BinaryExpression',
			'BinaryExpression',
			'TSAsExpression',
			'TSSatisfiesExpression',
			'ConditionalExpression',
			'LogicalExpression',
		]);
	});
});
