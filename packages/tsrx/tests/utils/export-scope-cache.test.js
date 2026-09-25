import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/index.js';
import { parse_in_worker } from '../shared/parse-in-worker.js';

describe('local export scope lookup', () => {
	it('sees names appended after the scope cache is created', () => {
		const ast = parseModule(
			`const first = 1;
export { first };
const second = 2;
export { second };`,
			'export-scope-cache.tsrx',
		);

		expect(ast.body.filter((node) => node.type === 'ExportNamedDeclaration')).toHaveLength(2);
	});

	it('still rejects missing local exports', () => {
		expect(() => parseModule('export { missing };', 'export-scope-cache.tsrx')).toThrow(
			/Export 'missing' is not defined/,
		);
	});

	// Parsed in a worker, so a parse that never returns fails the test instead of
	// stalling the run.
	const modes = [
		undefined,
		{ collect: true, comments: [], preserveParens: true },
		{ loose: true, comments: [] },
	];
	/** @param {string[]} sources */
	const in_every_mode = (sources) =>
		sources.flatMap((source) => modes.map((options) => ({ source, options })));

	it('sees TypeScript declarations that acorn-typescript keeps apart', async () => {
		const sources = [
			'namespace A { export const n = 42; }\nexport { A };',
			'namespace A.B { export const n = 42; }\nexport { A };',
			'declare namespace N { const x: number; }\nexport { N };',
			'declare module Foo {}\nexport { Foo };',
			'interface Props { n: number; }\nexport type { Props };',
			'interface Props { n: number; }\nexport { Props };',
			'type A = number;\nexport { A };',
			'type A = number;\nexport type { A };',
			'declare function f(): void;\nexport { f };',
			'declare namespace Q { interface I {} export { I }; }',
			'declare namespace Q { namespace R {} export { R }; }',
			'function f() {}\nnamespace f { export const x = 1; }\nexport { f };',
			'export { A };\nnamespace A { export const n = 42; }',
		];

		const outcomes = await parse_in_worker(in_every_mode(sources));

		expect(outcomes).toEqual(
			sources.flatMap(() => [
				{ ok: true, errors: undefined },
				{ ok: true, errors: [] },
				{ ok: true, errors: [] },
			]),
		);
	});

	it('still rejects names that no scope in view declares', async () => {
		const sources = [
			['export { Missing };', 'Missing'],
			['namespace A { export const n = 42; }\nexport { B };', 'B'],
			['namespace Outer { type T = 1; }\nexport { T };', 'T'],
			['namespace Outer { interface I {} }\nexport { I };', 'I'],
		];

		const outcomes = await parse_in_worker(in_every_mode(sources.map(([source]) => source)));

		expect(outcomes).toEqual(
			sources.flatMap(([, name]) => {
				const message = `Export '${name}' is not defined`;
				return [
					{ ok: false, message: expect.stringMatching(`^${message} \\(`), pos: expect.any(Number) },
					{ ok: true, errors: [message] },
					{ ok: true, errors: [message] },
				];
			}),
		);
	});
});
