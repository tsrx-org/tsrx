import { DIAGNOSTIC_CODES, TSRX_ERRORS } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import { compile, compile_to_volar_mappings } from '../src/index.js';

/**
 * A plain async function, not a component, that builds its output in a
 * `@{ … }` block.
 *
 * @param {string} output
 */
const block = (output) =>
	`export async function f(t: any, bag: any, Comp: any) {
	const out = @{
		${output}
	};
	return out;
}`;

/** @param {string} source */
const await_starts = (source) => [...source.matchAll(/\bawait\b/g)].map((match) => match.index);

// #1370: babel-preset-solid compiles an `await` as it compiles a `yield`
// (#259): it evaluates a dynamic template value in an effect, an inserted
// arrow or a prop getter, and creates an element nested in an expression in an
// immediately called arrow. An `await` there leaves its async function.
describe('an await in a template Solid evaluates in an effect, getter or callback (#1370)', () => {
	it.each([
		['a call in a child', block("<p>{await Promise.resolve('x')}</p>")],
		['a dynamic attribute value', block('<input title={await bag.title} />')],
		['a class value, which is always in an effect', block('<div class={await t} />')],
		['a host spread', block('<input {...(await t)} />')],
		['an element in a fragment', block('<><input title={await t} /></>')],
		['a dynamic component prop', block('<Comp title={await bag.title} />')],
		// A control-flow body is a component's children, passed in a getter.
		[
			'a static child in an @if body',
			block(`@if (t) {
			<p>{await t}</p>
		}`),
		],
		[
			'a static attribute in a @pending body',
			block(`@try {
			<p>a</p>
		} @pending {
			<p title={await t}>b</p>
		}`),
		],
		[
			"a call in a child at the module's top level",
			'export const el = <p>{await Promise.resolve(1)}</p>;',
		],
		[
			'an @if body in an element',
			block(`<div>
			@if (t) {
				<p title={await bag.title}>a</p>
			}
		</div>`),
		],
		[
			'an @switch case in an element',
			block(`<div>
			@switch (t) {
				@case 1: {
					<p>{await bag.text}</p>
				}
			}
		</div>`),
		],
		[
			'an attribute and a child, in source order',
			block('<p title={await bag.title}>{await bag.text}</p>'),
		],
	])('reports each await in %s', (_label, source) => {
		const awaits = await_starts(source);
		expect(() => compile(source, 'App.tsrx')).toThrow(
			expect.objectContaining({
				code: DIAGNOSTIC_CODES.TARGET_AWAIT_UNSUPPORTED,
				pos: awaits[0],
			}),
		);
		for (const { errors } of [
			compile(source, 'App.tsrx', { collect: true }),
			compile(source, 'App.tsrx', { collect: true, ssr: true }),
			compile_to_volar_mappings(source, 'App.tsrx'),
		]) {
			expect(errors.map((error) => [error.code, error.pos])).toEqual(
				awaits.map((start) => [DIAGNOSTIC_CODES.TARGET_AWAIT_UNSUPPORTED, start]),
			);
		}
	});

	it.each([
		['a static child', block('<p>{await t}</p>')],
		// A control-flow component in a fragment is created in place.
		[
			'a static @if test in a fragment',
			block(`<>
			@if (await t) {
				<p>a</p>
			}
		</>`),
		],
		[
			"a static child at the module's top level",
			'declare const t: Promise<string>;\nexport const el = <p>{await t}</p>;',
		],
		['a static attribute value', block('<input title={await t} />')],
		['an event handler', block('<button onClick={await bag.onClick} />')],
		['a ref', block('<div ref={await bag.ref} />')],
		['a branch the compiler folds away', block('<input title={false && (await bag.title)} />')],
		[
			'the setup statements before the output',
			block(`const title = await bag.title;
		<input title={title} />`),
		],
		['a nested async function', block('<button onClick={async () => { await bag.load(); }} />')],
	])('allows an await in %s', (_label, source) => {
		for (const { errors } of [
			compile(source, 'App.tsrx', { collect: true }),
			compile(source, 'App.tsrx', { collect: true, ssr: true }),
			compile_to_volar_mappings(source, 'App.tsrx'),
		]) {
			expect(errors).toEqual([]);
		}
	});

	it('says to await the value before the template', () => {
		const source = block("<p>{await Promise.resolve('x')}</p>");
		expect(compile(source, 'App.tsrx', { collect: true }).errors).toEqual([
			expect.objectContaining({
				...TSRX_ERRORS.TARGET_TEMPLATE_AWAIT_UNSUPPORTED('Solid'),
				pos: source.indexOf('await'),
			}),
		]);
	});

	// The SSR output merges a host spread's props in an arrow (#1291).
	it('reports an await beside a host spread in a server build only', () => {
		const source = block('<input {...bag} title={await t} />');
		expect(compile(source, 'App.tsrx', { collect: true }).errors).toEqual([]);
		expect(
			compile(source, 'App.tsrx', { collect: true, ssr: true }).errors.map((error) => [
				error.code,
				error.pos,
			]),
		).toEqual([[DIAGNOSTIC_CODES.TARGET_AWAIT_UNSUPPORTED, source.indexOf('await')]]);
	});
});
