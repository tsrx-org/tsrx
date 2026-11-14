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
 * @param {(error: any) => any} [reported] What the compiler reports for an error
 */
function hidden_ranges(compiler, source, needle, reported = (error) => error) {
	const result = transform_tsrx(compiler, 'App.tsrx', source);
	expect(result.fatalError, source).toBeFalsy();
	const at = result.text.indexOf(needle);
	expect(at, result.text).toBeGreaterThan(-1);
	const { directives } = ignore_directives(
		result.errors.map(reported),
		result.sourceAst,
		result.mappings,
		source.length,
		result.text,
	) ?? { directives: [] };
	return { at, ranges: directives.map(([, , start, end]) => [start, end]) };
}

/**
 * Whether a directive covers `needle`. A recovered closing tag can come after
 * the code that follows, so a swallowed component sits between the tag's ranges.
 * @param {any} compiler
 * @param {string} source
 * @param {string} needle
 * @param {(error: any) => any} [reported]
 */
function covers(compiler, source, needle, reported) {
	const { at, ranges } = hidden_ranges(compiler, source, needle, reported);
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

const UNCLOSED = [
	'export const A = () => <div>\n',
	'export const A = () => <div>;\n',
	'export const y = <div>\n',
	'export const y = <Missing>\n',
	'export const y = <a.b>\n',
	'export const A = () => <>\n',
	'export const y = <div><b>\n',
	'const Tag = 1;\nexport const y = <{Tag}>\n',
	'export const y = <Foo<string>>\n',
	'export const f = <T>(x: T) => x;\n',
	'export const y = <Missing>;\n',
];

describe.each(Object.entries({ react, preact, solid, vue }))('%s', (_, compiler) => {
	// An unclosed tag at module level swallows a `@{ … }` as a block inside it,
	// so its declaration stretches around the component that follows.
	it.each(UNCLOSED)('leaves the components after %j alone', (first) => {
		for (const rest of [
			TEMPLATE,
			TEMPLATE.trimEnd(),
			ARROW,
			TEMPLATE + ARROW.replace('const B', 'const C'),
		]) {
			expect(covers(compiler, first + rest, 'wrong: string'), first + rest).toBe(false);
		}
	});

	// The mapper runs the project's compiler. One from before a tag's error moved
	// onto the tag reports it at the end of the file, with nothing past `end`.
	it.each(UNCLOSED)('leaves the components after %j alone with such a compiler', (first) => {
		const source = first + TEMPLATE;
		const at_the_end = (/** @type {any} */ error) => ({
			code: error.code,
			pos: source.length,
			end: source.length,
			raisedAt: source.length,
		});
		expect(covers(compiler, source, 'wrong: string', at_the_end), source).toBe(false);
	});

	// Such a compiler's error still holds what it held, which is the function.
	it('holds an older shape of error at the token that ended the template', () => {
		const source = `export function A() {\n\tconst n: number = 'x';\n\treturn <div>{n};\n}\n`;
		const pos = source.lastIndexOf('}');
		const where_it_stopped = (/** @type {any} */ error) => ({
			code: error.code,
			pos,
			end: pos + 1,
			raisedAt: pos + 1,
		});
		expect(covers(compiler, source, 'n: number', where_it_stopped)).toBe(true);
	});

	// A `<>` the output drops has only an anchor, on the line of its siblings. Its
	// place depends on the columns before it, and at one length the source and the
	// generated code are the same length too, so try each.
	it.each([
		['Undefined1', '<b /><Undefined1 /><i />'],
		['missing', '<b />{missing}<i />'],
	])('leaves %s beside an unclosed fragment alone', (needle, children) => {
		for (const first of ['export const y =', 'export const A = () =>']) {
			for (let n = 0; n <= 12; n++) {
				const source = `${first} <div>{/*${'c'.repeat(n)}*/}<>${children}\n`;
				expect(covers(compiler, source, needle), source).toBe(false);
			}
		}
	});

	// The closing tag recovery adds has no mapping, so TypeScript's error on it,
	// such as TS2304 for a name that isn't a value, has no place in the file: a
	// directive of its own covers it (#1328).
	it.each([
		['a generic arrow', 'export const f = <T>(x: T) => x;\n', '</T>'],
		[
			'a generic arrow in a function',
			'export function g() {\n\treturn <T>(x: T) => x;\n}\n',
			'</T>',
		],
		['a tag at the end of the file', 'export const y = <Missing>;\n', '</Missing>'],
		['a member tag', 'export const y = <a.b>;\n', '</a.b>'],
		['two tags of one name', 'export const y = <Missing><Missing>;\n', '</Missing></Missing>'],
	])('covers the closing tag that recovery adds to %s', (_, source, closing) => {
		const { at, ranges } = hidden_ranges(compiler, source, closing);
		for (let offset = at; offset < at + closing.length; offset++) {
			expect(
				ranges.some(([start, end]) => start <= offset && offset < end),
				`${source} at ${offset}`,
			).toBe(true);
		}
	});

	// With nothing holding the tag, the directive is still there for its own code.
	it('covers the name of an unclosed tag at the end of the file', () => {
		expect(covers(compiler, 'export const y = <Missing>\n', 'Missing')).toBe(true);
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
