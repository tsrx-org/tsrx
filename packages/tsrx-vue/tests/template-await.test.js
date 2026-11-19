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
	`export async function f(load: () => Promise<string>, items: Set<string>, rows: Set<Set<string>>) {
	const out = @{
		${output}
	};
	return out;
}`;

// #1370: vue-jsx-vapor creates each element in an immediately called arrow and
// evaluates its values in render effects and prop getters, so an `await`
// anywhere in an element or fragment leaves its async function.
describe('an await in a Vue template (#1370)', () => {
	it.each([
		['a child', block('<p>{await load()}</p>')],
		['an attribute value', block('<p title={await load()} />')],
		['a nested element', block('<div><p>{await load()}</p></div>')],
		['a fragment child', block('<>{await load()}</>')],
		['a component prop', block('<Comp title={await load()} />')],
		[
			'a host spread in an @if body in an element',
			block(`<div>
			@if (items.size) {
				<input {...(await load())} />
			}
		</div>`),
		],
		[
			'an attribute and a child, in source order',
			block('<p title={await load()}>{await load()}</p>'),
		],
		[
			'an @if body in an element',
			block(`<div>
			@if (items.size) {
				<p>{await load()}</p>
			}
		</div>`),
		],
		[
			'the setup statements of an @if body in an element',
			block(`<div>
			@if (items.size) {
				const text = await load();
				<p>{text}</p>
			}
		</div>`),
		],
		[
			'an @switch case in an element',
			block(`<div>
			@switch (items.size) {
				@case 1: {
					<p>{await load()}</p>
				}
			}
		</div>`),
		],
		[
			'an awaiting @for body in an element',
			block(`<ul>
			@for (const item of items) {
				const text = await load();
				<li>{text}</li>
			}
		</ul>`),
		],
		[
			'an awaiting @for body in a fragment',
			block(`<>
			@for (const item of items) {
				const text = await load();
				<li>{text}</li>
			}
		</>`),
		],
		[
			'an awaiting @for body with two awaits',
			block(`<ul>
			@for (const item of items) {
				const a = await load();
				const b = await load();
				<li>{a}{b}</li>
			}
		</ul>`),
		],
		[
			'an inner @for that awaits, in an element of the outer one',
			block(`@for (const row of rows) {
			const size = row.size;
			<ul data-size={size}>
				@for (const item of row) {
					const text = await load();
					<li>{text}</li>
				}
			</ul>
		}`),
		],
		[
			'an inner @for that awaits, in the element of a VaporFor row',
			block(`@for (const row of rows) {
			<ul>
				@for (const item of row) {
					const text = await load();
					<li>{text}</li>
				}
			</ul>
		}`),
		],
		["a child at the module's top level", 'export const el = <p>{await Promise.resolve(1)}</p>;'],
		[
			'plain JSX in an async function',
			'export async function f(t: Promise<string>) {\n\tconst el = <p>{await t}</p>;\n\treturn el;\n}',
		],
	])('reports each await in %s', (_label, source) => {
		const awaits = [...source.matchAll(/\bawait\b/g)].map((match) => match.index);
		expect(() => compile(source, 'App.tsrx')).toThrow(
			expect.objectContaining({
				code: DIAGNOSTIC_CODES.TARGET_AWAIT_UNSUPPORTED,
				pos: awaits[0],
			}),
		);
		for (const { errors } of [
			compile(source, 'App.tsrx', { collect: true }),
			compile_to_volar_mappings(source, 'App.tsrx'),
		]) {
			expect(errors.map((error) => [error.code, error.pos])).toEqual(
				awaits.map((start) => [DIAGNOSTIC_CODES.TARGET_AWAIT_UNSUPPORTED, start]),
			);
		}
	});

	it.each([
		[
			'an awaiting @for that is the only output',
			block(`@for (const item of items) {
			const text = await load();
			<li>{text}</li>
		}`),
		],
		[
			'the setup statements before the output',
			block(`const text = await load();
		<p>{text}</p>`),
		],
		['a nested async function', block('<button onClick={async () => { await load(); }} />')],
	])('allows an await in %s', (_label, source) => {
		expect(compile(source, 'App.tsrx', { collect: true }).errors).toEqual([]);
		expect(compile_to_volar_mappings(source, 'App.tsrx').errors).toEqual([]);
	});

	// A host spread is bound in place, so the render effect reads it again when
	// it changes (#1108). One that awaits can't be read there, so it keeps its
	// setup declaration, as one that yields does, and a spread beside it is
	// still bound in place.
	it('binds a host spread that awaits before the element, and any other in place', () => {
		const source = block('<div><input {...(await load())} /><input {...items} /></div>');
		const { code, errors } = compile(source, 'App.tsrx', { collect: true });
		expect(errors).toEqual([]);
		expect(compile_to_volar_mappings(source, 'App.tsrx').errors).toEqual([]);
		expect(code).toContain(
			'let _tsrx_spread_props_1 = __normalize_spread_props_for_ref_attr(await load());',
		);
		expect(code).toContain('<input {..._tsrx_spread_props_1} ref={_tsrx_spread_props_1?.ref} />');
		expect(code).toContain(
			'<input {...(_tsrx_spread_props_2 = __normalize_spread_props_for_ref_attr(items))} ref={_tsrx_spread_props_2?.ref} />',
		);
	});

	it('says to await the value before the template', () => {
		const source = block('<p>{await load()}</p>');
		expect(compile(source, 'App.tsrx', { collect: true }).errors).toEqual([
			expect.objectContaining({
				...TSRX_ERRORS.TARGET_TEMPLATE_AWAIT_UNSUPPORTED('Vue'),
				pos: source.indexOf('await'),
			}),
		]);
		expect(TSRX_ERRORS.TARGET_TEMPLATE_AWAIT_UNSUPPORTED('Vue').message).toContain(
			'Await the value before the template',
		);
	});

	// A component can't await at all, which TSRX reports on its own.
	it('reports an await in a component template once', () => {
		const source = `export async function App(props: { load: () => Promise<string> }) @{
	<p>{await props.load()}</p>
}`;
		expect(
			compile(source, 'App.tsrx', { collect: true }).errors.map((error) => [
				error.message,
				error.pos,
			]),
		).toEqual([['Vue TSRX components do not support `await`.', source.indexOf('await')]]);
	});
});
