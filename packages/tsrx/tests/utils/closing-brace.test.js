/** @import { ParseOptions } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { acorn } from '../../src/index.js';
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
 * @param {string} source
 * @param {string} message
 * @param {number} pos
 */
function thrown(source, message, pos) {
	const { line, column } = acorn.getLineInfo(source, pos);
	return { ok: false, message: `${message} (${line}:${column})`, pos };
}

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
			return modes.map(() => thrown(source, "'}' expected.", pos));
		}),
	);
}

/**
 * Parse each source in every mode and expect it to throw `message`.
 * @param {Array<[source: string, message: string]>} cases
 */
async function expect_messages(cases) {
	const inputs = cases.flatMap(([source]) => modes.map((options) => ({ source, options })));
	const outcomes = await parse_in_worker(inputs);
	expect(outcomes.map((outcome) => (outcome.ok ? 'parses' : outcome.message))).toEqual(
		cases.flatMap(([, message]) => modes.map(() => message)),
	);
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
		const unclosed = (/** @type {string} */ tag) =>
			`Unclosed tag '<${tag}>'. Expected '</${tag}>' before end of template.`;
		const inputs = [style, section, div].flatMap((source) =>
			modes.map((options) => ({ source, options })),
		);

		const outcomes = await parse_in_worker(inputs);

		expect(outcomes).toEqual([
			thrown(style, unclosed('style'), style.indexOf('\n      .a')),
			thrown(style, "'}' expected.", style.indexOf(': red')),
			thrown(style, "'}' expected.", style.length),
			thrown(section, unclosed('section'), section.length),
			thrown(section, "'}' expected.", section.length),
			thrown(section, "'}' expected.", section.length),
			thrown(div, unclosed('div'), div.length),
			thrown(div, "'}' expected.", div.length),
			thrown(div, "'}' expected.", div.length),
		]);
	});

	it('keeps the other syntax errors', async () => {
		// Where TypeScript reports something else first, such as a missing `)` or
		// expression, or a `;` or `,` at the next token, the message stays.
		/** @type {Array<[source: string, message: string]>} */
		const cases = [
			['{ a(', 'Unexpected token (1:4)'],
			['{ a[', 'Unexpected token (1:4)'],
			['{ a +', 'Unexpected token (1:5)'],
			['{ a.', 'Unexpected token (1:4)'],
			['{ if (x)', 'Unexpected token (1:8)'],
			['{ while (x)', 'Unexpected token (1:11)'],
			['{ a:', 'Unexpected token (1:4)'],
			['{ do', 'Unexpected token (1:4)'],
			['{ const a =', 'Unexpected token (1:11)'],
			['x = { a:', 'Unexpected token (1:8)'],
			['x = { m(', 'Unexpected token (1:8)'],
			['x = { [a', 'Unexpected token (1:8)'],
			['x = { a: f(1', 'Unexpected token (1:12)'],
			['x = { a: [1', 'Unexpected token (1:11)'],
			['x = <div>{', 'Unexpected token (1:10)'],
			['x = <div id={', 'Unexpected token (1:13)'],
			['x = `${', 'Unexpected token (1:7)'],
			['x = [1, 2', 'Unexpected token (1:9)'],
			['switch (x) { case 1', 'Unexpected token (1:19)'],
			['switch (x) { a }', 'Unexpected token (1:13)'],
			['class A { @dec', 'Unexpected token (1:14)'],
			['class A { ) }', 'Unexpected token (1:10)'],
			['interface I { ) }', 'Unexpected token (1:14)'],
			['try {} catch (e)', 'Unexpected token (1:16)'],
			['export', 'Unexpected token (1:6)'],
			['}', 'Unexpected token (1:0)'],
			['x = { a 1 }', 'Unexpected token (1:8)'],
			['x = [{ a: 1 ];', 'Unexpected token (1:12)'],
			['foo(() => {\n  a();\n);\n', 'Unexpected token (3:0)'],
			['const o = {\n  a: 1\nconst b = 2;\n', 'Unexpected token (3:0)'],
			['class A {\n  m() {\n    a();\n\n  n() {}\n}\n', 'Unexpected token (5:6)'],
			['enum E { A B }', 'Unexpected token (1:11)'],
			['import { a b } from "x";', 'Unexpected token (1:11)'],
			["import a from './a.json' with { type: 'json' x };", 'Unexpected token (1:45)'],
			['type M = { [K in T]: X; Y };', 'Unexpected token (1:24)'],
			['type M = { [K in T]: X Y };', 'Unexpected token (1:23)'],
			["x = 'abc", 'Unterminated string constant (1:4)'],
			[
				'export function App() @{\n  @try {\n    <b />\n  } @catch (e) {\n    <p />\n  } finally {\n  }\n}',
				'Unexpected token (6:4)',
			],
		];
		await expect_messages(cases);
	});

	it('keeps the error where the parse fails before it reaches the missing `}`', async () => {
		// TypeScript reports `'}' expected` for these, but TSRX fails first for a
		// cause of its own: a `</` read as less-than and a regular expression (#586),
		// `get` read as a getter's keyword, and an import attribute read after a
		// trailing comma.
		/** @type {Array<[source: string, message: string]>} */
		const cases = [
			['x = <div>{a</div>;', 'Unterminated regular expression (1:13)'],
			['x = { get', 'Unexpected token (1:9)'],
			["import a from './a.json' with { type: 'json',", 'Unexpected token (1:45)'],
		];
		await expect_messages(cases);
	});

	it('reports it after a mistake that TypeScript reports only from its checker, when collecting', async () => {
		// An `export` inside a block (#587), and a `const` or `let` with nothing
		// after it (#588). A strict parse throws the mistake itself.
		/** @type {Array<[source: string, message: string]>} */
		const cases = [
			[
				'function f() {\n  a();\nexport function g() {}\n',
				"'import' and 'export' may only appear at the top level (3:0)",
			],
			['{ const', 'Unexpected token (1:7)'],
			['{ let', "The keyword 'let' is reserved (1:2)"],
		];
		const outcomes = await parse_in_worker(
			cases.flatMap(([source]) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes.map((outcome) => (outcome.ok ? 'parses' : outcome.message))).toEqual(
			cases.flatMap(([source, message]) =>
				modes.map((options) =>
					options ? thrown(source, "'}' expected.", source.length).message : message,
				),
			),
		);
	});
});
