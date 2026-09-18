import { describe, expect, it } from 'vitest';
import { parseModule } from '@tsrx/core';
import { build_export_stub } from '../src/export-stub.js';

/** @param {string} source */
function stub(source) {
	return build_export_stub(parseModule(source, 'Stub.tsrx', { loose: true }));
}

describe('build_export_stub', () => {
	it('returns an empty module without an AST', () => {
		expect(build_export_stub(null)).toBe('export {};\n');
		expect(build_export_stub(undefined)).toBe('export {};\n');
	});

	it('declares every named export as an any value and type', () => {
		const text = stub(`
export const a = 1, { b, c: [d] } = x;
export function f() {}
export class K {}
export interface I { x: number }
export type T = string;
const local = 1;
export { local as renamed };
`);
		for (const name of ['a', 'b', 'd', 'f', 'K', 'I', 'T', 'renamed']) {
			expect(text).toContain(`export declare const ${name}: any;`);
			expect(text).toContain(`export type ${name} = any;`);
		}
		expect(text).not.toContain('local:');
	});

	it('keeps re-exports and declares the default export', () => {
		const text = stub(`
export * from './a.tsrx';
export * as ns from './b.tsrx';
export { x, y as z } from './c.tsrx';
export default function Component() @{
	<div />
}
`);
		expect(text).toContain(`export * from "./a.tsrx";`);
		expect(text).toContain(`export * as ns from "./b.tsrx";`);
		expect(text).toContain(`export { x, y as z } from "./c.tsrx";`);
		expect(text).toContain('declare const _default: any;\nexport default _default;');
	});

	it('keeps type-only re-exports as type-only', () => {
		const text = stub(`
export type { Foo, Bar as Baz } from './types.tsrx';
export { type Qux, value } from './mixed.tsrx';
export type * from './all-types.tsrx';
export type * as ns from './ns.tsrx';
`);
		expect(text).toContain(`export type { Foo, Bar as Baz } from "./types.tsrx";`);
		expect(text).toContain(`export { type Qux, value } from "./mixed.tsrx";`);
		expect(text).toContain(`export type * from "./all-types.tsrx";`);
		expect(text).toContain(`export type * as ns from "./ns.tsrx";`);
		expect(text).not.toMatch(/export \{ Foo/);
		expect(text).not.toMatch(/export \* from "\.\/all-types/);
	});
});
