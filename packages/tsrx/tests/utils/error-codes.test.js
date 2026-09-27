/** @import { CompileError } from '../../types/index' */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { get_error_code } from '../../src/diagnostics.js';
import { analyzeTsrx, DIAGNOSTIC_CODES, parseModule } from '../../src/index.js';

/**
 * The codes of the errors that parsing `source`, strictly and when collecting,
 * and analyzing it report.
 * @param {string} source
 * @returns {Array<string | undefined>}
 */
function reported_codes(source) {
	/** @type {Array<string | undefined>} */
	const codes = [];
	for (const collect of [false, true]) {
		/** @type {CompileError[]} */
		const errors = [];
		/** @type {any[]} */
		const comments = [];
		try {
			const ast = parseModule(source, 'App.tsrx', collect ? { collect, errors, comments } : {});
			const result = analyzeTsrx(ast, 'App.tsrx', collect ? { collect, comments } : {});
			codes.push(...errors.map((error) => error.code));
			codes.push(...result.errors.map((error) => error.code));
		} catch (error) {
			codes.push(/** @type {CompileError} */ (error).code);
		}
	}
	return codes;
}

describe('error codes', () => {
	it('reports the TSRX code of each mistake the parser or the analysis finds', () => {
		/** @type {Array<[code: string, source: string]>} */
		const cases = [
			['TSRX1001', 'const a = <div><b>text</b>;'],
			['TSRX1002', 'const a = <div></span>;'],
			[
				'TSRX1003',
				`function App() @{
	<div></span>
}`,
			],
			[
				'TSRX1004',
				`function App() @{
	<script>s = "</scripts>";</script>
}`,
			],
			['TSRX1005', 'const a = <foo:bar />;'],
			['TSRX1006', 'const a = <div a={...b} />;'],
			[
				'TSRX1007',
				`function App() @{
	<div>{a;}</div>
}`,
			],
			['TSRX1008', 'const a = <div>@if (x) <b /></div>;'],
			['TSRX1009', 'const a = <div>@if (x) { <b /> } else { <i /> }</div>;'],
			['TSRX1010', 'const a = <div>@try { <b /> }</div>;'],
			[
				'TSRX1011',
				`function App() @{
	@for (const x of xs; index 0) {
		<li />
	}
}`,
			],
			[
				'TSRX1011',
				`function App() @{
	@for (const x of xs; key x index i) {
		<li />
	}
}`,
			],
			[
				'TSRX2001',
				`function App() @{
	@try {
		return;
	} @catch (e) {
		<p />
	}
}`,
			],
			[
				'TSRX2008',
				`function App() @{
	@switch (x) {
		@case 1: {
			break;
		}
	}
}`,
			],
			[
				'TSRX2009',
				`function App() @{
	@switch (x) {
		@case 1: {
			return;
		}
	}
}`,
			],
			[
				'TSRX2010',
				`function App() {
	<div />;
}`,
			],
			[
				'TSRX2011',
				`function App() @{
	<a />
	<b />
}`,
			],
			[
				'TSRX2012',
				`function App() @{
	<a />
	const x = 1;
}`,
			],
			['TSRX2013', 'const a = <div>{...items}</div>;'],
			['TSRX2014', 'const a = <{x ? A : B} />;'],
			[
				'TSRX3001',
				`function App() @{
	<>
		<style apply="a" />
		<p />
	</>
}`,
			],
			[
				'TSRX3002',
				`function App() @{
	<>
		<style apply={a} />
		<p />
	</>
}`,
			],
			[
				'TSRX3003',
				`function App() @{
	<>
		<style apply={a} />
		<p />
	</>
}
const a = <style>.x {}</style>;`,
			],
			[
				'TSRX3004',
				`const a = <style>.x {}</style>;
function App() @{
	<>
		<style apply={a} apply={a} />
		<p />
	</>
}`,
			],
			[
				'TSRX3005',
				`const a = <style>.x {}</style>;
function App() @{
	<>
		<style href="x.css" apply={a} />
		<p />
	</>
}`,
			],
			['TSRX3006', 'const t = <style>.\\$class {}</style>;'],
			['TSRX3007', '<style>.a {}</style>;'],
			[
				'TSRX3008',
				`function App() {
	return <div><style>p {}</style></div>;
}`,
			],
			[
				'TSRX3009',
				`function App() @{
	<style>p {}</style>
}`,
			],
			[
				'TSRX3010',
				`function App() @{
	<>
		<style id="x">p {}</style>
		<p />
	</>
}`,
			],
			[
				'TSRX3012',
				`function App() @{
	<>
		<style>@import 'a.css';</style>
		<p />
	</>
}`,
			],
			[
				'TSRX3013',
				`function App() @{
	<>
		<style>p { color: red; </style>
		<p />
	</>
}`,
			],
			['TSRX4003', "import a from 'a' with { type: 'json', type: 'json' };"],
		];
		for (const [code, source] of cases) {
			expect(reported_codes(source), source).toContain(code);
		}
	});

	it("reports TypeScript's code for a mistake TypeScript reports", () => {
		/** @type {Array<[code: string, source: string]>} */
		const cases = [
			['TS1005', 'if (a) {'],
			['TS1012', 'let x = );'],
			[
				'TS2300',
				`let a = 1;
let a = 2;`,
			],
			[
				'TS1184',
				`function f() {
	export const a = 1;
}`,
			],
			[
				'TS1184',
				`function f() {
	export default class {}
}`,
			],
			[
				'TS1232',
				`function f() {
	import a from 'a';
}`,
			],
			[
				'TS1232',
				`function f() {
	export import a = b;
}`,
			],
			[
				'TS1233',
				`function f() {
	export { f };
}`,
			],
			[
				'TS1233',
				`function f() {
	export * from 'a';
}`,
			],
			[
				'TS1231',
				`function f() {
	export = f;
}`,
			],
			[
				'TS1316',
				`function f() {
	export as namespace A;
}`,
			],
			[
				'TS1258',
				`function f() {
	export default 1;
}`,
			],
			[
				'TS1235',
				`function f() {
	export declare namespace N {}
}`,
			],
			[
				'TS1030',
				`class A {
	readonly readonly a;
}`,
			],
			[
				'TS1206',
				`class A {
	@dec constructor() {}
}`,
			],
			['TS2369', 'function f(private a) {}'],
			['TS2858', "import a from 'a' with { type: 1 };"],
			// acorn raises it with `raiseRecoverable`.
			[
				'TS1111',
				`class A {
	m() {
		return this.#x;
	}
}`,
			],
		];
		for (const [code, source] of cases) {
			expect(reported_codes(source), source).toContain(code);
		}
	});

	it("maps a message to the code of that exact mistake, not a broader one's", () => {
		// Messages that no source reaches today, which a broader pattern would
		// catch first.
		/** @type {Array<[code: string, message: string]>} */
		const cases = [
			['TS1382', 'Unexpected token `>`. Did you mean `&gt;` or `{">"}`?'],
			['TS1381', 'Unexpected token `}`. Did you mean `&rbrace;` or `{"}"}`?'],
			[
				'TS7059',
				'This syntax is reserved in files with the .mts or .cts extension. Use an `as` expression instead.',
			],
			[
				'TS7060',
				'This syntax is reserved in files with the .mts or .cts extension. Add a trailing comma, as in `<T,>() => ...`.',
			],
			['TS1012', 'Unexpected token'],
		];
		for (const [code, message] of cases) {
			expect(get_error_code(message), message).toBe(code);
		}
	});

	it('are all listed in the specification', () => {
		const specification = readFileSync(
			new URL('../../../../website-tsrx/src/pages/specification.tsrx', import.meta.url),
			'utf8',
		);
		const diagnostics = readFileSync(new URL('../../src/diagnostics.js', import.meta.url), 'utf8');
		const typescript_codes = new Set(
			[...diagnostics.matchAll(/'(TS\d+)'/g)].map(([, code]) => code),
		);
		for (const code of [...Object.values(DIAGNOSTIC_CODES), ...typescript_codes]) {
			expect(specification, code).toMatch(new RegExp(`['"]${code}  `));
		}
	});
});
