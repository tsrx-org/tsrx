import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/index.js';
import { UPSTREAM_ERRORS } from '../../src/diagnostics.js';
import { error_with, thrown } from '../shared/errors.js';
import { parse_in_worker, parse_in_worker_with_ast } from '../shared/parse-in-worker.js';

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
			error_with(UPSTREAM_ERRORS.EXPORT_NOT_DEFINED),
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

	// A strict TypeScript 5.9 program reports none of these.
	it('sees an ambient function declared in a namespace or module body', async () => {
		const sources = [
			'declare namespace Q { function f(): void; export { f }; }',
			"declare module 'm' { function f(): void; export { f }; }",
			'declare namespace Q { function f(): void; function f(x: number): void; export { f }; }',
			"declare module 'm' { function f(): void; function f(x: number): void; export { f }; }",
			'declare namespace A { namespace B { function f(): void; export { f }; } }',
			'declare namespace A.B { function f(): void; export { f }; }',
			"declare module 'm' { namespace N { function f(): void; export { f }; } export { N }; }",
			'declare namespace Q { function f(): void; export { f as g }; }',
			"declare module 'm' { function f(): void; export { f as default }; }",
			"declare module 'm' { export function f(): void; export { f as g }; }",
			'declare function f(): void;\nexport { f as g };',
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

	// A strict TypeScript 5.9 program reports none of these either.
	it('sees a declaration that comes later in a namespace or module body', async () => {
		const sources = [
			'declare namespace Q { export { f }; function f(): void; }',
			'declare namespace Q { export { c }; const c: number; }',
			"declare module 'm' { export { f }; function f(): void; }",
			"declare module 'm' { export { c }; const c: number; }",
			'declare namespace Q { export { f as g }; function f(): void; function f(x: number): void; }',
			'declare namespace Q { export { I, T, C, E, N }; interface I {} type T = 1; class C {} enum E {} namespace N {} }',
			'declare namespace A.B { export { f }; function f(): void; }',
			'declare namespace A { namespace B { export { f }; function f(): void; } }',
			'declare namespace A { namespace B { export { f }; } function f(): void; }',
			"declare module 'm' { export { x }; import { x } from 'y'; }",
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
			['declare namespace Q { export { nope }; }', 'nope'],
			["declare module 'm' { function f(): void; export { f, nope }; }", 'nope'],
			['declare namespace Q { function f(): void; }\nexport { f };', 'f'],
			['declare namespace Q { function f(): void; }\ndeclare namespace R { export { f }; }', 'f'],
		];

		const outcomes = await parse_in_worker(in_every_mode(sources.map(([source]) => source)));

		expect(outcomes).toEqual(
			sources.flatMap(([source, name]) => [
				thrown(UPSTREAM_ERRORS.EXPORT_NOT_DEFINED, source.lastIndexOf(name)),
				{ ok: true, errors: [UPSTREAM_ERRORS.EXPORT_NOT_DEFINED.code] },
				{ ok: true, errors: [UPSTREAM_ERRORS.EXPORT_NOT_DEFINED.code] },
			]),
		);
	});

	// TypeScript reports each of these as TS2304, at the name in the export list
	// that ends `before`.
	it('still rejects a name in a body that no scope in view declares, at the export', async () => {
		/** @type {Array<[source: string, before: string]>} */
		const cases = [
			[
				'declare namespace Q { export { f }; }\ndeclare namespace R { function f(): void; }',
				'Q { export { ',
			],
			[
				'declare namespace Q { export { f }; }\ndeclare namespace R { function f(): void; export { f }; }',
				'Q { export { ',
			],
			[
				"declare module 'm' { export { f }; }\ndeclare module 'n' { function f(): void; export { f }; }",
				"'m' { export { ",
			],
			[
				'declare namespace Q { export { c }; }\ndeclare namespace R { const c: number; export { c }; }',
				'Q { export { ',
			],
			['declare namespace Q { export { nope }; function f(): void; }', 'Q { export { '],
			[
				'declare namespace A { export { f }; namespace B { function f(): void; } }',
				'A { export { ',
			],
			['declare namespace A { namespace B { function f(): void; } export { f }; }', '} export { '],
			['export { f };\nnamespace N { function f() {} export { f }; }', 'export { '],
		];

		const outcomes = await parse_in_worker_with_ast(in_every_mode(cases.map(([source]) => source)));

		expect(
			outcomes.map((outcome) =>
				outcome.ok
					? outcome.errors?.map(({ code, pos }) => ({ code, pos }))
					: { code: outcome.code, pos: outcome.pos },
			),
		).toEqual(
			cases.flatMap(([source, before]) => {
				const error = {
					code: UPSTREAM_ERRORS.EXPORT_NOT_DEFINED.code,
					pos: source.indexOf(before) + before.length,
				};
				return [error, [error], [error]];
			}),
		);
	});
});
