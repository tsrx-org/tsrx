import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.js';

/**
 * The codes of the errors that compiling `source`, strictly and when
 * collecting, reports.
 * @param {string} source
 * @returns {Array<string | undefined>}
 */
function reported_codes(source) {
	/** @type {Array<string | undefined>} */
	const codes = [];
	for (const collect of [false, true]) {
		try {
			const result = compile(source, 'App.tsrx', { collect });
			codes.push(...(result.errors ?? []).map((/** @type {any} */ error) => error.code));
		} catch (error) {
			codes.push(/** @type {{ code?: string }} */ (error).code);
		}
	}
	return codes;
}

describe('error codes', () => {
	it("reports the TSRX code of each mistake the target's transform finds", () => {
		/** @type {Array<[code: string, source: string]>} */
		const cases = [
			[
				'TSRX2002',
				`function App() @{
	@if (x) {
		return;
	}
}`,
			],
			[
				'TSRX2003',
				`function App() @{
	@if (x) {
		for (const y of ys) {
			break;
		}
		<p />
	}
}`,
			],
			[
				'TSRX2004',
				`function App() @{
	@if (x) {
		for (const y of ys) {
			continue;
		}
		<p />
	}
}`,
			],
			[
				'TSRX2005',
				`function App() @{
	@for (const x of xs) {
		return;
	}
}`,
			],
			[
				'TSRX2006',
				`function App() @{
	@for (const x of xs) {
		break;
	}
}`,
			],
			[
				'TSRX2007',
				`function App() @{
	@for (const x of xs) {
		continue;
	}
}`,
			],
			[
				'TSRX2015',
				`function App() @{
	@for (const k in o) {
		<li />
	}
}`,
			],
			['TSRX2016', 'const a = <div ref={a} ref={b} />;'],
			[
				'TSRX2021',
				`async function App() @{
	@try {
		<p />
	} @catch (e) {
		<p>{await f(e)}</p>
	}
}`,
			],
			[
				'TSRX2022',
				`function* f(xs) {
	return <ul>{@for (const x of xs) { <li title={yield x} /> }}</ul>;
}`,
			],
			[
				'TSRX2023',
				`class A extends B {
	*f(p) {
		return p ? <i ref={r} {...s} t={yield super.x} /> : null;
	}
}`,
			],
			[
				'TSRX2024',
				`async function App() @{
	@for await (const x of xs) {
		<p />
	}
}`,
			],
			[
				'TSRX3011',
				`function App() @{
	<>
		<style>a :global(b) c {}</style>
		<p />
	</>
}`,
			],
			['TSRX4001', 'const a = import.meta.env.platform.web;'],
		];
		for (const [code, source] of cases) {
			expect(reported_codes(source), source).toContain(code);
		}
	});
});
