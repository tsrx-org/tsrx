import { DIAGNOSTIC_CODES } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import { compile, compile_to_volar_mappings } from '../src/index.js';

/** @param {string} output */
const returning = (output) =>
	`export function* f(bag: any, t: any, Comp: any) {\n\treturn ${output};\n}`;

/** @param {string} output */
const template = (output) => `export function* f(bag: any, t: any) @{\n\t${output}\n}`;

// #259: vue-jsx-vapor creates each element in an immediately called arrow and
// evaluates its values in render effects and prop getters, so a `yield`
// anywhere in a template leaves its generator.
describe('a yield in a Vue template (#259)', () => {
	it.each([
		['a static attribute value', returning('<input title={yield t} />')],
		['a dynamic attribute value', returning('<input title={yield bag.title} />')],
		['an attribute value, as yield*', returning('<input title={yield* bag.titles()} />')],
		['an event handler', returning('<button onClick={yield t} />')],
		['a ref', returning('<div ref={yield t} />')],
		['a child', returning('<p>{yield t}</p>')],
		['a component prop', returning('<Comp title={yield t} />')],
		['a component spread', returning('<Comp {...(yield t)} />')],
		['an @if test', template('<div>\n\t\t@if (yield t) { <p>a</p> }\n\t</div>')],
		['an @for iterable', template('<ul>\n\t\t@for (const x of yield t) { <li>{x}</li> }\n\t</ul>')],
		[
			"a host spread beside a ref (#246's shape)",
			returning("t ? <input {...{}} ref={() => {}} title={yield 'title'} /> : null"),
		],
		[
			'an attribute and a child, in source order',
			returning('<p title={yield t}>{yield bag.text}</p>'),
		],
	])('reports each yield in %s', (_label, source) => {
		const yields = [...source.matchAll(/\byield\b/g)].map((match) => match.index);
		expect(() => compile(source, 'App.tsrx')).toThrow(
			expect.objectContaining({
				code: DIAGNOSTIC_CODES.TARGET_TEMPLATE_YIELD_UNSUPPORTED,
				pos: yields[0],
			}),
		);
		for (const { errors } of [
			compile(source, 'App.tsrx', { collect: true }),
			compile_to_volar_mappings(source, 'App.tsrx'),
		]) {
			expect(errors.map((error) => [error.code, error.pos])).toEqual(
				yields.map((start) => [DIAGNOSTIC_CODES.TARGET_TEMPLATE_YIELD_UNSUPPORTED, start]),
			);
		}
	});

	// TSRX evaluates a host spread into a variable before the element.
	it('allows a yield in a host spread, which TSRX evaluates before the element', () => {
		const source = returning('<input {...(yield t)} />');
		expect(compile(source, 'App.tsrx', { collect: true }).errors).toEqual([]);
		expect(compile_to_volar_mappings(source, 'App.tsrx').errors).toEqual([]);
	});
});
