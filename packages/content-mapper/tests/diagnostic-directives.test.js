import * as preact from '@tsrx/preact';
import * as react from '@tsrx/react';
import * as solid from '@tsrx/solid';
import { transform_tsrx } from '@tsrx/typescript-plugin/src/transform.js';
import * as vue from '@tsrx/vue';
import { describe, expect, it } from 'vitest';
import { ignore_directives } from '../src/diagnostic-directives.js';

/**
 * The generated ranges that a source's errors hide, and the offset of `needle`
 * in the generated code, from a target's real compile.
 * @param {any} compiler
 * @param {string} source
 * @param {string} needle
 */
function hidden_ranges(compiler, source, needle) {
	const result = transform_tsrx(compiler, 'App.tsrx', source);
	expect(result.fatalError, source).toBeFalsy();
	const at = result.text.indexOf(needle);
	expect(at, result.text).toBeGreaterThan(-1);
	const { directives } = ignore_directives(
		result.errors,
		result.sourceAst,
		result.mappings,
		source.length,
		result.text.length,
	) ?? { directives: [] };
	return { at, ranges: directives.map(([, , start, end]) => [start, end]) };
}

/**
 * Whether a directive covers `needle`. A recovered closing tag can come after
 * the code that follows, so a swallowed component sits between the tag's ranges.
 * @param {any} compiler
 * @param {string} source
 * @param {string} needle
 */
function covers(compiler, source, needle) {
	const { at, ranges } = hidden_ranges(compiler, source, needle);
	return ranges.some(([start, end]) => start <= at && at < end);
}

/**
 * Whether a directive runs past the start of `needle`.
 * @param {any} compiler
 * @param {string} source
 * @param {string} needle
 */
function reaches(compiler, source, needle) {
	const { at, ranges } = hidden_ranges(compiler, source, needle);
	return ranges.some(([, end]) => end > at);
}

const TEMPLATE = `export function B() @{\n\tconst wrong: string = 1;\n\t<span />\n}\n`;
const ARROW = `export const B = () => @{\n\tconst wrong: string = 1;\n\t<span />\n};\n`;
const PLAIN = `export function B() {\n\tconst wrong: string = 1;\n\treturn wrong;\n}\n`;

describe.each(Object.entries({ react, preact, solid, vue }))('%s', (_, compiler) => {
	// An unclosed tag at module level swallows a `@{ … }` as a block inside it,
	// so its declaration stretches around the component that follows.
	it.each([
		'export const A = () => <div>\n',
		'export const A = () => <div>;\n',
		'export const y = <div>\n',
		'export const y = <Missing>\n',
		'export const y = <a.b>\n',
		'export const A = () => <>\n',
		'export const y = <div><b>\n',
	])('leaves the components after %j alone', (first) => {
		for (const rest of [
			TEMPLATE,
			TEMPLATE.trimEnd(),
			ARROW,
			TEMPLATE + ARROW.replace('const B', 'const C'),
		]) {
			expect(covers(compiler, first + rest, 'wrong: string'), first + rest).toBe(false);
		}
	});

	it('leaves a component before an unclosed tag alone', () => {
		const before = TEMPLATE.replace('function B', 'function Z');
		for (const last of ['export const A = () => <div>\n', 'export const y = <Missing>']) {
			expect(covers(compiler, before + last, 'wrong: string'), last).toBe(false);
		}
	});

	// An anchor can't run off its generated line, whichever way it would: past
	// code the generated output drops, or by the length of a long tag.
	it.each(
		Object.entries({
			'dropped code before a fragment': (/** @type {number} */ n) =>
				`export function A({ x }: any) @{\n\t<div>{x}{/*${'x'.repeat(n)}*/}<>{x}\n}\n`,
			'dropped code before a style tag': (/** @type {number} */ n) =>
				`export function A({ x }: any) @{\n\t<div>{x}{/*${'x'.repeat(n)}*/}<style>.a {}</div>\n}\n`,
			'a long tag in a nested body': (/** @type {number} */ n) =>
				`export function A() {\n\tconst f = () => { return <Missing${'x'.repeat(n)}>; };\n\treturn f;\n}\n`,
			'a long tag in a method': (/** @type {number} */ n) =>
				`export function A() {\n\tclass K { m() { return <Missing${'x'.repeat(n)}>; } }\n\treturn K;\n}\n`,
			'a long tag in a returned arrow': (/** @type {number} */ n) =>
				`export function A() {\n\treturn () => { return <Missing${'x'.repeat(n)}>; };\n}\n`,
		}),
	)('keeps its anchor in its component with %s', (_, first) => {
		for (let n = 0; n <= 120; n += 3) {
			expect(reaches(compiler, first(n) + PLAIN, 'export function B'), first(n)).toBe(false);
		}
	});

	// Inside a function, the directive still covers the function, as the closing
	// tag recovery adds has no mapping of its own.
	it('still covers a statement before an unclosed tag in its function', () => {
		const source = `export function A() {\n\tconst n: number = 'x';\n\treturn <div>{n};\n}\n`;
		expect(covers(compiler, source, 'n: number')).toBe(true);
	});
});
