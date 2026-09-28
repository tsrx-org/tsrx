/** @import { ParseOptions } from '../../types/index' */
/** @import { ErrorKind } from '../shared/errors.js' */

import { describe, expect, it } from 'vitest';
import { TS_ERRORS, TSRX_ERRORS, UPSTREAM_ERRORS } from '../../src/diagnostics.js';
import { code_of, line_column, thrown } from '../shared/errors.js';
import { parse_in_worker } from '../shared/parse-in-worker.js';

/**
 * A missing `}` is reported as TypeScript's parser reports it, `'}' expected.`
 * at the token found in its place, instead of acorn's `Unexpected token`, for
 * JavaScript and template blocks alike (#583). It is a syntax error, so every
 * parse mode throws it. Each source is parsed in a worker, so a parse that
 * never returns fails the test instead of stalling the run.
 */

/** @type {Array<ParseOptions | undefined>} */
const modes = [undefined, { collect: true }, { loose: true }];

/**
 * @typedef {{ source: string, at?: string }} MissingBrace
 * `at` is the text that starts where the `}` should be. Without it, the `}` is
 * missing at the end of the input.
 */

/**
 * Parse each case in every mode and expect `'}' expected.` where the `}` is
 * missing.
 * @param {MissingBrace[]} cases
 */
async function expect_brace_expected(cases) {
	const inputs = cases.flatMap(({ source }) => modes.map((options) => ({ source, options })));
	const outcomes = await parse_in_worker(inputs);
	expect(outcomes).toEqual(
		cases.flatMap(({ source, at }) => {
			const pos = at === undefined ? source.length : source.indexOf(at);
			expect(pos, `${JSON.stringify(at)} in ${JSON.stringify(source)}`).toBeGreaterThan(-1);
			return modes.map(() => thrown(TS_ERRORS.TOKEN_EXPECTED, pos));
		}),
	);
}

/**
 * Parse each source in every mode and expect it to throw `error` at `at`,
 * `line:column`.
 * @param {Array<[source: string, error: ErrorKind, at: string]>} cases
 */
async function expect_errors(cases) {
	const inputs = cases.flatMap(([source]) => modes.map((options) => ({ source, options })));
	const outcomes = await parse_in_worker(inputs);
	expect(
		outcomes.map((outcome, index) =>
			outcome.ok ? 'parses' : [outcome.code, line_column(inputs[index].source, outcome.pos)],
		),
	).toEqual(cases.flatMap(([, error, at]) => modes.map(() => [code_of(error), at])));
}

/** @param {string[]} sources */
const at_end = (sources) => sources.map((source) => ({ source }));

describe("reporting a missing `}` as `'}' expected.`", () => {
	it('reports it at the end of the input in JavaScript blocks', async () => {
		await expect_brace_expected(
			at_end([
				'function f() {\n  a();\n',
				'function f() {\n  a();\n  // a comment\n',
				'if (ok) {\n  a();\n',
				'if (ok) {\n} else {\n  a();\n',
				'if (ok) {\n} else if (b) {\n  a();\n',
				'for (const x of xs) {\n  a();\n',
				'for (let i = 0; i < 1; i++) {\n',
				'for (const k in o) {\n',
				'while (ok) {\n  a();\n',
				'do {\n  a();\n',
				'try {\n  a();\n',
				'try {\n} catch (e) {\n  a();\n',
				'try {\n} finally {\n  a();\n',
				'{\n  a();\n',
				'{',
				'a: {\n  b();\n',
				'switch (x) {\n',
				'switch (x) {\n  case 1:\n',
				'switch (x) {\n  case 1:\n    a();\n',
				'switch (x) {\n  default:\n',
				'switch (x) {\n  case 1: {\n    a();\n',
				'class A {\n',
				'class A {\n  x = 1;\n',
				'class A {\n  static a = 1',
				'class A {\n  #a',
				'class A {\n  accessor a',
				'class A {\n  [k: string]: number',
				'class A {\n  a()',
				'class A {\n  static',
				'class A {\n  @dec m() {}',
				'class A {\n  m() {\n    a();\n',
				'class A {\n  get m() {\n',
				'class A {\n  static {\n    a();\n',
				'const A = class {\n  x = 1;\n',
				'const o = {\n',
				'const o = {\n  a: 1,\n',
				'const o = {\n  a: 1\n',
				'const o = {\n  a',
				'const o = {\n  ...a',
				'const o = {\n  1: 2',
				'const o = {\n  async',
				'const o = {\n  m() {\n    a();\n',
				'const o = [{ a: 1',
				'foo({ a: { b',
				'const {',
				'const { a, b\n',
				'const { ...a',
				'const [a, { b',
				'function f({ a, b\n',
				'try {} catch ({ a',
				'const f = () => {\n  a();\n',
				'const f = function () {\n  a();\n',
				'foo(() => {\n  a();\n',
				'function a() {\n  if (x) {\n    b();\n}\nfunction c() {}\n',
				'namespace N {\n  const a = 1;\n',
				'namespace A.B {\n',
				"declare module 'm' {\n  export const a: number;\n",
				'declare global {\n  var a: number;\n',
				'namespace N {\n  export function f() {}',
				'enum E {\n',
				'enum E {\n  A,\n',
				'enum E {\n  A\n',
				'enum E {\n  A = 1',
				'interface I {\n',
				'interface I {\n  a: string;\n',
				'interface I {\n  a(): void',
				'type T = {\n',
				'type T = {\n  a: string;\n',
				'type T = {\n  a: string,\n  b',
				'let t: {\n  a: string;\n',
				'let t: Array<{ a: string',
				'type M = { [K in keyof T]: T[K]\n',
				'import {',
				'import { a, b\n',
				'export { a, b\n',
				"export { a } from './a' with { type: 'json'",
				"import a from './a.json' with {",
				"type A = typeof import('./a.json', { with: { type: 'json' ",
				'const s = `a${b\n',
				'type T = `${A',
				'const e = <div>{x\n',
				'const e = <div id={x\n',
				'const e = <div {...x\n',
				'const e = <div>{...x\n',
			]),
		);
	});

	it('reports it at the end of the input in template blocks', async () => {
		await expect_brace_expected(
			at_end([
				'export function App() @{\n',
				'export function App() @{\n  const a = 1;\n  <div />\n',
				'const App = () => @{\n  const a = 1;\n',
				'const node = @{\n  const a = 1;\n',
				'export function App() @{\n  <div>\n    @{\n      const a = 1;\n',
				'export function App() @{\n  @if (ok) {\n',
				'export function App() @{\n  @if (ok) {\n    <b />\n',
				'export function App() @{\n  @if (ok) {\n    const a = 1;\n',
				'export function App() @{\n  @if (ok) {\n    <b>hi</b>\n',
				'export function App() @{\n  @if (ok) {\n    <b />\n  }\n',
				'export function App() @{\n  @if (a) {\n    <b />\n  } @else if (c) {\n    <i />\n',
				'export function App() @{\n  @if (a) {\n    <b />\n  } @else {\n    <i />\n',
				'export function App() @{\n  @for (const x of xs) {\n    <li />\n',
				'export function App() @{\n  @for (const x of xs; index i; key x.id) {\n    <li />\n',
				'export function App() @{\n  @for (const x of xs) {\n    <li />\n  } @empty {\n    <p />\n',
				'export function App() @{\n  @switch (x) {\n',
				'export function App() @{\n  @switch (x) {\n    @case 1: {\n      <b />\n    }\n',
				'export function App() @{\n  @switch (x) {\n    @case 1: {\n',
				'export function App() @{\n  @switch (x) {\n    @case 1: {\n      <b />\n',
				'export function App() @{\n  @switch (x) {\n    @default: {\n      <b />\n',
				'export function App() @{\n  @try {\n    <b />\n',
				'export function App() @{\n  @try {\n    <b />\n  } @pending {\n    <p />\n',
				'export function App() @{\n  @try {\n    <b />\n  } @catch (e) {\n    <p />\n',
				'export function App() @{\n  @try {\n    <b />\n  } @catch {\n    <p />\n',
				'export function App() @{\n  <div>\n    @if (ok) {\n      <b />\n',
				'export function App() @{\n  <div>{x\n',
				'export function App() @{\n  <div>{x + 1\n',
				'export function App() @{\n  <div id={x\n',
				'export function App() @{\n  if (ok) {\n    a();\n',
				'export function App() @{\n  function f() {\n    a();\n',
				'export function App() @{\n  const o = {\n    a: 1,\n',
				'export function App() @{\n  return 1;\n',
				'const v = @switch (x) {\n  @case 1: {\n    <b />\n',
				'function App() { return <div>@switch (mode) { @case 1: {',
			]),
		);
	});

	it('reports a directive body left open at the end of the input, which used to parse', async () => {
		// With nothing around it, such a body was taken as closed: the compilers
		// compiled it, and the formatters printed a `}` that was never written.
		await expect_brace_expected(
			at_end([
				'const v = @if (ok) {\n  <b />\n',
				'const App = () => @if (ok) {\n  <b />\n',
				'const App = () => @for (const x of xs) {\n  <li />\n',
				'const App = () => <ul>\n  @for (const x of xs) {\n    <li />\n',
				'const App = () => <div>\n  @if (ok) {\n    <b />\n',
				'const v = @try {\n  <b />\n',
				'const v = @try {\n  <b />\n} @pending {\n  <p />\n',
				'\t\t@if (condition) {',
			]),
		);
	});

	it('reports it at the token after the expression of a template span or an expression container', async () => {
		// TypeScript reports these at the token found in place of the `}`.
		await expect_brace_expected([
			{ source: 'x = `${a b}`;', at: 'b}' },
			{ source: 'x = `${a {b}}`;', at: '{b}' },
			{ source: 'x = `${ {a: 1} b}`;', at: 'b}' },
			{ source: 'x = `${`${a b}`}`;', at: 'b}' },
			{ source: 'x = tag`${a b}`;', at: 'b}' },
			{ source: 'type T = `${A B}`;', at: 'B}' },
			{ source: 'x = <div>{a b}</div>;', at: 'b}' },
			{ source: 'x = <div id={a b} />;', at: 'b}' },
			{ source: 'x = <div {...a b} />;', at: 'b}' },
			{ source: 'x = <div>{...a b}</div>;', at: 'b}' },
			{ source: 'export function App() @{\n  <b>{text name}</b>\n}', at: 'name}' },
			{ source: 'export function App() @{\n  <div class={style "root"}>hi</div>\n}', at: '"root"' },
			// As in TSX, `</` after the expression starts a closing tag (#586)
			{ source: 'x = <div>{a</div>;', at: '</div>' },
			{ source: 'x = <div id={a>b</div>;', at: '</div>' },
			{ source: 'export function App() @{\n  <p>{count</p>\n}', at: '</p>' },
		]);
	});

	it('throws an unclosed tag first when not collecting, and keeps its recovery', async () => {
		// Collect and loose mode record the unclosed tag and keep parsing, as before,
		// and then stop at the missing `}`. Only loose mode recovers the body of an
		// unclosed `<style>`; collect mode reads it as markup, where `{ color` is an
		// expression container that the `:` doesn't close.
		const style = 'export function App() @{\n  <>\n    <style>\n      .a { color: red; }\n';
		const section = 'export function App() @{\n  @if (ok) {\n    <section>\n';
		const div = '{ <div>';
		const inputs = [style, section, div].flatMap((source) =>
			modes.map((options) => ({ source, options })),
		);

		const outcomes = await parse_in_worker(inputs);

		expect(outcomes).toEqual([
			thrown(TSRX_ERRORS.UNCLOSED_TAG, style.indexOf('\n      .a')),
			thrown(TS_ERRORS.TOKEN_EXPECTED, style.indexOf(': red')),
			thrown(TS_ERRORS.TOKEN_EXPECTED, style.length),
			thrown(TSRX_ERRORS.UNCLOSED_TAG, section.length),
			thrown(TS_ERRORS.TOKEN_EXPECTED, section.length),
			thrown(TS_ERRORS.TOKEN_EXPECTED, section.length),
			thrown(TSRX_ERRORS.UNCLOSED_TAG, div.length),
			thrown(TS_ERRORS.TOKEN_EXPECTED, div.length),
			thrown(TS_ERRORS.TOKEN_EXPECTED, div.length),
		]);
	});

	it('keeps the other syntax errors', async () => {
		// Where TypeScript reports something else first, such as a missing `)` or
		// expression, or a `;` or `,` at the next token, that error stays.
		/** @type {Array<[source: string, error: ErrorKind, at: string]>} */
		const cases = [
			['{ a(', TS_ERRORS.UNEXPECTED_TOKEN, '1:4'],
			['{ a[', TS_ERRORS.UNEXPECTED_TOKEN, '1:4'],
			['{ a +', TS_ERRORS.UNEXPECTED_TOKEN, '1:5'],
			['{ a.', TS_ERRORS.UNEXPECTED_TOKEN, '1:4'],
			['{ if (x)', TS_ERRORS.UNEXPECTED_TOKEN, '1:8'],
			['{ while (x)', TS_ERRORS.UNEXPECTED_TOKEN, '1:11'],
			['{ a:', TS_ERRORS.UNEXPECTED_TOKEN, '1:4'],
			['{ do', TS_ERRORS.UNEXPECTED_TOKEN, '1:4'],
			['{ const a =', TS_ERRORS.UNEXPECTED_TOKEN, '1:11'],
			['x = { a:', TS_ERRORS.UNEXPECTED_TOKEN, '1:8'],
			['x = { m(', TS_ERRORS.UNEXPECTED_TOKEN, '1:8'],
			['x = { [a', TS_ERRORS.UNEXPECTED_TOKEN, '1:8'],
			['x = { a: f(1', TS_ERRORS.UNEXPECTED_TOKEN, '1:12'],
			['x = { a: [1', TS_ERRORS.UNEXPECTED_TOKEN, '1:11'],
			['x = <div>{', TS_ERRORS.UNEXPECTED_TOKEN, '1:10'],
			['x = <div id={', TS_ERRORS.UNEXPECTED_TOKEN, '1:13'],
			['x = `${', TS_ERRORS.UNEXPECTED_TOKEN, '1:7'],
			['x = [1, 2', TS_ERRORS.UNEXPECTED_TOKEN, '1:9'],
			['switch (x) { case 1', TS_ERRORS.UNEXPECTED_TOKEN, '1:19'],
			['switch (x) { a }', TS_ERRORS.UNEXPECTED_TOKEN, '1:13'],
			['class A { @dec', TS_ERRORS.UNEXPECTED_TOKEN, '1:14'],
			['class A { ) }', TS_ERRORS.UNEXPECTED_TOKEN, '1:10'],
			['interface I { ) }', TS_ERRORS.UNEXPECTED_TOKEN, '1:14'],
			['try {} catch (e)', TS_ERRORS.UNEXPECTED_TOKEN, '1:16'],
			['export', TS_ERRORS.UNEXPECTED_TOKEN, '1:6'],
			['}', TS_ERRORS.UNEXPECTED_TOKEN, '1:0'],
			['x = { a 1 }', TS_ERRORS.UNEXPECTED_TOKEN, '1:8'],
			['x = [{ a: 1 ];', TS_ERRORS.UNEXPECTED_TOKEN, '1:12'],
			['foo(() => {\n  a();\n);\n', TS_ERRORS.UNEXPECTED_TOKEN, '3:0'],
			['const o = {\n  a: 1\nconst b = 2;\n', TS_ERRORS.UNEXPECTED_TOKEN, '3:0'],
			['class A {\n  m() {\n    a();\n\n  n() {}\n}\n', TS_ERRORS.UNEXPECTED_TOKEN, '5:6'],
			['enum E { A B }', TS_ERRORS.UNEXPECTED_TOKEN, '1:11'],
			['import { a b } from "x";', TS_ERRORS.UNEXPECTED_TOKEN, '1:11'],
			["import a from './a.json' with { type: 'json' x };", TS_ERRORS.UNEXPECTED_TOKEN, '1:45'],
			['type M = { [K in T]: X; Y };', TS_ERRORS.UNEXPECTED_TOKEN, '1:24'],
			['type M = { [K in T]: X Y };', TS_ERRORS.UNEXPECTED_TOKEN, '1:23'],
			["x = 'abc", 'TS1002', '1:4'],
			[
				'export function App() @{\n  @try {\n    <b />\n  } @catch (e) {\n    <p />\n  } finally {\n  }\n}',
				TS_ERRORS.UNEXPECTED_TOKEN,
				'6:4',
			],
		];
		await expect_errors(cases);
	});

	it('keeps the error where the parse fails before it reaches the missing `}`', async () => {
		// TypeScript reports `'}' expected` for these, but TSRX fails first for a
		// cause of its own: `get` read as a getter's keyword, and an import
		// attribute read after a trailing comma.
		/** @type {Array<[source: string, error: ErrorKind, at: string]>} */
		const cases = [
			['x = { get', TS_ERRORS.UNEXPECTED_TOKEN, '1:9'],
			["import a from './a.json' with { type: 'json',", TS_ERRORS.UNEXPECTED_TOKEN, '1:45'],
		];
		await expect_errors(cases);
	});

	it('reports it after a mistake that TypeScript reports only from its checker, when collecting', async () => {
		// An `export` inside a block (#587), and a `const` or `let` with nothing
		// after it (#588). A strict parse throws the mistake itself.
		/** @type {Array<[source: string, error: ErrorKind, at: string]>} */
		const cases = [
			[
				'function f() {\n  a();\nexport function g() {}\n',
				TS_ERRORS.MODIFIERS_CANNOT_APPEAR_HERE,
				'3:0',
			],
			['{ const', TS_ERRORS.UNEXPECTED_TOKEN, '1:7'],
			['{ let', UPSTREAM_ERRORS.LET_RESERVED, '1:2'],
		];
		const outcomes = await parse_in_worker(
			cases.flatMap(([source]) => modes.map((options) => ({ source, options }))),
		);

		expect(
			outcomes.map((outcome, index) =>
				outcome.ok
					? 'parses'
					: [outcome.code, line_column(cases[Math.floor(index / modes.length)][0], outcome.pos)],
			),
		).toEqual(
			cases.flatMap(([source, error, at]) =>
				modes.map((options) =>
					options
						? [TS_ERRORS.TOKEN_EXPECTED.code, line_column(source, source.length)]
						: [code_of(error), at],
				),
			),
		);
	});
});
