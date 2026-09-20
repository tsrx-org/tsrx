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

	it('quotes string-literal export names in re-exports', () => {
		const text = stub(`
export { "foo-bar" as baz, qux as "qux-name" } from './a.tsrx';
export * as "ns-name" from './b.tsrx';
export { "same" as "same" } from './c.tsrx';
`);
		expect(text).toContain(`export { "foo-bar" as baz, qux as "qux-name" } from "./a.tsrx";`);
		expect(text).toContain(`export * as "ns-name" from "./b.tsrx";`);
		expect(text).toContain(`export { "same" } from "./c.tsrx";`);
	});

	it('keeps the type modifier of type-only re-exports', () => {
		const text = stub(`
export type { A } from './a.tsrx';
export type * from './b.tsrx';
export type * as types from './c.tsrx';
export { type D, E as F, type G as H } from './d.tsrx';
export type { I };
export { type J, K };
interface I {}
type J = 1;
const K = 1;
`);
		expect(text).toContain(`export type { A } from "./a.tsrx";`);
		expect(text).toContain(`export type * from "./b.tsrx";`);
		expect(text).toContain(`export type * as types from "./c.tsrx";`);
		expect(text).toContain(`export { type D, E as F, type G as H } from "./d.tsrx";`);
		expect(text).not.toContain('type type');
		// Local type-only exports are re-declared as `any` values and types like
		// every other local export; only re-exports have to keep the modifier.
		for (const name of ['I', 'J', 'K']) {
			expect(text).toContain(`export declare const ${name}: any;`);
			expect(text).toContain(`export type ${name} = any;`);
		}
	});
});
