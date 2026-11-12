import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as react from '@tsrx/react';
import { transform_tsrx } from '@tsrx/typescript-plugin/src/transform.js';
import { create_tsrx_content_mapper } from '../src/mapper.js';
import { to_verification_mappings } from '../src/span-mappings.js';
import { consumer_fixture_dir } from './fixture-utils.js';

/** @import {VerificationMapping} from '../src/protocol.js' */
/** @import {CodeMapping} from '@tsrx/core/types' */

/**
 * @typedef {{
 * 	toSourceRange(start: number, end: number, fallback: boolean, filter?: (data: any) => boolean): Iterable<[number, number, ...unknown[]]>,
 * }} VolarSourceMap
 */

/**
 * `@volar/source-map`'s `SourceMap` and Volar's diagnostics filter, through the
 * classic plugin's own Volar, as `tsrx-tsc` uses them.
 * @type {{
 * 	SourceMap: new (mappings: readonly object[]) => VolarSourceMap,
 * 	shouldReportDiagnostics: (data: any, source: string, code: string) => boolean,
 * }}
 */
const volar = createRequire(
	createRequire(import.meta.url).resolve('@tsrx/typescript-plugin/package.json'),
)('@volar/language-core');

/**
 * Code whose printed form differs from the source in many ways: respaced
 * literals and type arguments, comments the printer leaves out, a blank line
 * after `return;`, loops, spreads and index signatures. It is also valid
 * TypeScript, so `tsc` on the same text as a `.ts` file is the reference.
 */
const SAMPLE = [
	'declare function g<T extends string>(): void;',
	'g<{}>();',
	'export const t = [ {}, [] ] satisfies number[];',
	'export const u: number[] = [ [ 1 ] ];',
	'declare const o: { a: number };',
	'export const x = [ /*comment*/ 1 as string ];',
	"export const y: number[] = [ /* c */ o.a + 'x' ];",
	'export const w = { /* comment */ a: 1 as string };',
	'declare const s: string | undefined;',
	'export const v = { /* c */ ...s };',
	"export const z: number[] = [ ...['x'] ];",
	'export type T = { /*comment*/ [x: string]: string; [x: string]: number };',
	'export const b = () => { while (true) { return; break; } };',
	'export function j() { for (const k of [1]) { return; continue; } }',
	'export function f(c: number, d: string) {',
	'\tif (c) c = d',
	'\tfor (;;) {',
	'\t\treturn;',
	'\t\tbreak;',
	'\t}',
	'}',
	"export const p: Record<{}, 1> = { 'a': 2 };",
	'',
].join('\n');

/**
 * More `.tsrx` sources for the comparison with `tsrx-tsc`, with templates and
 * many mistakes, so the checker reports many kinds of diagnostics.
 */
const PROBES = [
	SAMPLE,
	fs.readFileSync(path.join(consumer_fixture_dir, 'Panel.tsrx'), 'utf8'),
	fs.readFileSync(path.join(consumer_fixture_dir, 'Button.tsrx'), 'utf8'),
	`import { useState } from 'react';
export function Counter({ start, unusedProp }: { start: number; unusedProp: string }) @{
	const [count, setCount] = useState(start);
	const unused = 1;
	<div class="x" onClick={() => setCount(count + 'one')}>
		@if (count > 'a') {
			<span>{missing}</span>
		} @else {
			<b>{count.toFixed('2')}</b>
		}
		@for (const item of count; index i) {
			<i key={i}>{item}</i>
		}
		<Unknown prop={[ /* c */ 1 as string ]} {...{ /* c */ ...count }} />
	</div>
}
export default function Plain() {
	const { a, b } = { a: 1, b: [ 2 ] };
	let u1 = [ 1 ], u2 = {a: 1};
	for (const x of [1]) { return; continue; }
	return <p>{a + b}</p>;
}
`,
	`export class Registry { static [k: string]: number; [k: string]: string; [k: string]: number }
export type R = Record< {}, 1 > | import(  './missing'  ).X | { /* c */ [x: string]: 1; [x: string]: 2 };
export const f = (n: number) => { while (n) { return; break; } };
export function g(c: number, d: string) { if (c) c = d; else d = c; for (;;) { return; break; } }
`,
	`export const a: number[] = [1,   {},
	[],
		{ },
];
export const b: number[] = [ /* c */ {} , [ ] ,
	// note
	{} ];
export const c: [number] = [   ];
export const d: { x: number }[] = [{ x: 'no' }, {  }];
export type T = { a: 1 } & {  } & { b:
	Missing };
export const e: number[] = [...[{}], , 1];
declare function h(x: { a: number }): void;
h({ a: 1, b: 2 });
h({  });
class Base {}
export class X extends [Base][0] {}
export class Z extends [1][0] {}
`,
	`declare function foo(): void;
declare const xs: number[];
declare const o: { a: number };
export function a() {
	for (const x of xs) {
		return;
		foo();
	}
	for (const k in o) { return; foo(); }
	for (const x of 1) {}
	for (const k in 1) {}
	for (const [p, q] of [[1, 'a']]) { const r: string = p; }
	outer: for (;;) { for (;;) { return; break outer; } }
}
export const m = import.meta.url satisfies number;
export const n = (0, o);
export const s = 'x' as unknown as number satisfies string;
`,
];

/**
 * Diagnostics of `files` (name → text) as `[file, start, end, code]`.
 * @param {Record<string, string>} files
 */
function check(files) {
	const options = {
		strict: true,
		noEmit: true,
		noUnusedLocals: true,
		noUnusedParameters: true,
		allowUnreachableCode: false,
		jsx: ts.JsxEmit.Preserve,
		target: ts.ScriptTarget.ES2022,
		types: [],
	};
	const host = ts.createCompilerHost(options);
	const read = host.readFile.bind(host);
	const get = host.getSourceFile.bind(host);
	host.fileExists = (name) => name in files || ts.sys.fileExists(name);
	host.readFile = (name) => files[name] ?? read(name);
	host.getSourceFile = (name, language) =>
		name in files ? ts.createSourceFile(name, files[name], language, true) : get(name, language);
	const program = ts.createProgram(Object.keys(files), options, host);
	return ts
		.getPreEmitDiagnostics(program)
		.filter((d) => d.file && d.file.fileName in files)
		.map((d) => ({
			file: /** @type {ts.SourceFile} */ (d.file).fileName,
			start: /** @type {number} */ (d.start),
			end: /** @type {number} */ (d.start) + /** @type {number} */ (d.length),
			code: d.code,
		}));
}

/**
 * The first source range Volar maps a generated range to, with
 * `fallbackToAnyMatch` as `tsrx-tsc` uses it.
 * @param {VolarSourceMap} map
 * @param {number} start
 * @param {number} end
 * @param {(data: any) => boolean} [filter]
 */
function to_source(map, start, end, filter) {
	for (const [source_start, source_end] of map.toSourceRange(start, end, true, filter)) {
		return [source_start, source_end];
	}
	return null;
}

describe('verificationMappings', () => {
	/**
	 * @param {Record<string, unknown>} [options]
	 * @param {string} [content]
	 */
	function transform(options, content = SAMPLE) {
		const mapper = create_tsrx_content_mapper();
		mapper.openProject({
			configFileName: path.join(consumer_fixture_dir, 'tsconfig.json'),
			projectHandle: 'p',
			compilerOptions: {},
			options,
		});
		return mapper.transform({
			fileName: path.join(consumer_fixture_dir, 'Sample.tsrx'),
			content,
			projectHandle: 'p',
		});
	}

	it('maps every diagnostic of a checker run as tsrx-tsc does, through @volar/source-map', () => {
		const file_name = path.join(consumer_fixture_dir, 'Sample.tsrx');
		/** @type {Record<string, string>} */
		const files = {};
		const maps = PROBES.map((content, index) => {
			const result = transform({ verificationMappings: true }, content);
			// What tsrx-tsc maps through: every mapping, with Volar's diagnostics filter.
			const classic = transform_tsrx(react, file_name, content);
			expect(classic.text).toBe(result.text);
			files[`/probe${index}.tsx`] = result.text;
			return {
				exported: new volar.SourceMap(
					/** @type {VerificationMapping[]} */ (result.verificationMappings),
				),
				all: new volar.SourceMap(classic.mappings),
			};
		});
		const diagnostics = check(files);
		for (const { file, start, end, code } of diagnostics) {
			const { exported, all } = maps[Number(file.slice('/probe'.length, -'.tsx'.length))];
			const filter = (/** @type {any} */ data) =>
				volar.shouldReportDiagnostics(data, 'ts', String(code));
			expect(to_source(exported, start, end), `${file}, TS${code} at ${start}`).toEqual(
				to_source(all, start, end, filter),
			);
		}
		expect(diagnostics.length).toBeGreaterThan(90);
	}, 60_000);

	it('maps the sample as tsc reports it on the same code as a .ts file', () => {
		const result = transform({ verificationMappings: true });
		const map = new volar.SourceMap(
			/** @type {VerificationMapping[]} */ (result.verificationMappings),
		);
		const diagnostics = check({ '/virtual.ts': result.text, '/plain.ts': SAMPLE });
		const starts = (/** @type {string} */ file) =>
			diagnostics.filter((d) => d.file === file).map((d) => [d.start, d.code]);
		const mapped = diagnostics
			.filter((d) => d.file === '/virtual.ts')
			.map((d) => [to_source(map, d.start, d.end)?.[0], d.code]);
		expect(mapped.length).toBeGreaterThan(15);
		expect(mapped).toEqual(starts('/plain.ts'));
	}, 60_000);

	it('is absent by default and leaves the rest of the result unchanged', () => {
		const default_result = transform();
		expect(default_result).not.toHaveProperty('verificationMappings');
		expect(transform({ verificationMappings: false })).toEqual(default_result);
		const { verificationMappings, ...rest } = transform({ verificationMappings: true });
		expect(verificationMappings?.length).toBeGreaterThan(0);
		expect(JSON.stringify(rest)).toBe(JSON.stringify(default_result));
		// A file that fails to compile gets the export stub and no segments.
		expect(transform({ verificationMappings: true }, '{{{').verificationMappings).toEqual([]);
	});
});

describe('to_verification_mappings', () => {
	/**
	 * @param {number[]} offsets
	 * @param {number[]} lengths
	 * @param {CodeMapping['data']} data
	 * @returns {CodeMapping}
	 */
	const mapping = (offsets, lengths, data) => ({
		sourceOffsets: offsets,
		generatedOffsets: offsets.map((offset) => offset + 1),
		lengths,
		generatedLengths: lengths,
		data,
	});

	it('keeps each mapping with verification whole and in order, and nothing else', () => {
		const points = mapping([1, 9], [0, 0], { verification: true, customData: {} });
		const wide = mapping([0], [6], { verification: true, customData: {} });
		const narrow = mapping([2], [2], { verification: true, customData: {} });
		const object = mapping([5], [1], { verification: {}, customData: {} });
		const mappings = [
			points,
			mapping([3], [1], { semantic: true, customData: {} }),
			narrow,
			wide,
			object,
		];
		const strip = (/** @type {CodeMapping} */ m) => ({
			sourceOffsets: m.sourceOffsets,
			generatedOffsets: m.generatedOffsets,
			lengths: m.lengths,
			generatedLengths: m.generatedLengths,
			data: { verification: true },
		});
		expect(to_verification_mappings(mappings)).toEqual([
			strip(points),
			strip(narrow),
			strip(wide),
			strip(object),
		]);
		// The arrays are copies, not the transform's own.
		expect(to_verification_mappings(mappings)[0].sourceOffsets).not.toBe(points.sourceOffsets);
	});

	it('gives nothing for a transform with a shouldReport callback anywhere', () => {
		// Leaving out only that mapping could let the wide one below it map a
		// diagnostic that the callback would have reported through the narrow one.
		const mappings = [
			mapping([2], [2], { verification: { shouldReport: () => true }, customData: {} }),
			mapping([0], [6], { verification: true, customData: {} }),
		];
		expect(to_verification_mappings(mappings)).toEqual([]);
	});
});
