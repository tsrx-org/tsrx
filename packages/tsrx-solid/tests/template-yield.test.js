import { DIAGNOSTIC_CODES } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import { compile, compile_to_volar_mappings } from '../src/index.js';

/** @param {string} output */
const returning = (output) =>
	`export function* f(bag: any, t: any, Comp: any) {\n\treturn ${output};\n}`;

/** @param {string} output */
const template = (output) => `export function* f(bag: any, t: any) @{\n\t${output}\n}`;

// #259: babel-preset-solid evaluates a dynamic template value (one with a
// member access, a call, a spread or `in`) in an effect, an inserted arrow or
// a prop getter, and creates an element nested in an expression in an
// immediately called arrow. A `yield` there leaves its generator.
describe('a yield in a template Solid evaluates in an effect, getter or callback (#259)', () => {
	it.each([
		['a dynamic attribute value', returning('<input title={yield bag.title} />')],
		['an attribute value, as yield*', returning('<input title={yield* bag.titles()} />')],
		['a class value, which is always in an effect', returning('<div class={yield t} />')],
		['an array ref', returning('<div ref={[yield t]} />')],
		['a dynamic child', returning('<p>{yield bag.text}</p>')],
		['a host spread', returning('<input {...(yield t)} />')],
		['an element in a ternary arm', returning('t ? <input title={yield t} /> : null')],
		['an element in a fragment', returning('<><input title={yield t} /></>')],
		['a dynamic component prop', returning('<Comp title={yield bag.title} />')],
		['a component with several children', returning('<Comp>a{yield t}</Comp>')],
		['an assignable component ref', returning('<Comp ref={(yield t).field} />')],
		[
			'an @switch case in an expression',
			returning("<p>{@switch (t) { @case 1: { <span title={yield 'title'} /> } }}</p>"),
		],
		['a dynamic @if test', template('<div>\n\t\t@if (yield bag.ok) { <p>a</p> }\n\t</div>')],
		[
			'a dynamic @for iterable',
			template('<ul>\n\t\t@for (const x of yield bag.items) { <li>{x}</li> }\n\t</ul>'),
		],
		[
			'a dynamic event handler beside a spread, which is a getter on the spread',
			returning('<button {...bag} onClick={yield bag.onClick} />'),
		],
		[
			"a <select>'s value, which is also assigned in a microtask",
			returning('<select value={yield t} />'),
		],
		[
			'a branch the compiler keeps, since it folds only to a string, number or boolean',
			returning('<input title={null && (yield bag.title)} />'),
		],
		[
			'a class object with a computed key, which is set whole',
			returning('<div class={{ [t]: yield t }} />'),
		],
		[
			'a style object with a computed key, which is set whole',
			returning('<div style={{ [t]: yield t }} />'),
		],
		[
			'an attribute and a child, in source order',
			returning('<p title={yield bag.title}>{yield bag.text}</p>'),
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

	it.each([
		['a static attribute value', returning('<input title={yield t} />')],
		['a literal attribute value', returning("<input title={yield 'title'} />")],
		['an event handler', returning('<button onClick={yield bag.onClick} />')],
		['a namespaced event handler', returning('<button on:click={yield bag.onClick} />')],
		['a ref', returning('<div ref={yield bag.ref} />')],
		['a class object', returning('<div class={{ active: yield t }} />')],
		['an element nested in the returned one', returning('<div><input title={yield t} /></div>')],
		['a static component prop', returning('<Comp title={yield t} />')],
		['a lone static component child', returning('<Comp>{yield t}</Comp>')],
		['a component in a ternary arm', returning('t ? <Comp title={yield t} /> : null')],
		[
			"a host spread beside a ref (#246's shape)",
			returning("t ? <input {...{}} ref={() => {}} title={yield 'title'} /> : null"),
		],
		['a static @if test', template('<div>\n\t\t@if (yield t) { <p>a</p> }\n\t</div>')],
		[
			'a static @for iterable',
			template('<ul>\n\t\t@for (const x of yield t) { <li>{x}</li> }\n\t</ul>'),
		],
		[
			'a class value beside a spread, which is a prop of the spread',
			returning('<div {...bag} class={yield t} />'),
		],
		['a static event handler beside a spread', returning('<button {...bag} onClick={yield t} />')],
		['a <select> value beside a spread', returning('<select {...bag} value={yield t} />')],
		[
			'an object whose other value the compiler folds into a literal',
			returning("<div title={{ a: yield t, b: 'x'.length }} />"),
		],
		[
			'a value with a tagged template inside it',
			'export function* f(t: any, tag: any) {\n\treturn <div title={`${yield t}` + tag`x`} />;\n}',
		],
		[
			'a branch that never runs, which the compiler folds away',
			returning('<input title={false && (yield bag.title)} />'),
		],
		['a child that folds into text', returning("<p>{'a' || (yield bag.text)}</p>")],
		[
			'a class object key beside a dynamic one, which is set on its own',
			returning('<div class={{ active: yield t, big: bag.big }} />'),
		],
		[
			'a class object key the compiler evaluates and drops',
			returning('<div class={{ active: null && (yield bag.active) }} />'),
		],
		[
			"a class array's object, which the compiler splits off",
			returning("<div class={['x', { a: yield t }]} />"),
		],
		[
			'a style object key beside a dynamic one, which is set on its own',
			returning('<div style={{ color: yield t, width: bag.width }} />'),
		],
		[
			'a sequence that folds into its last value',
			returning("<input title={(yield bag.title, 'a')} />"),
		],
		['a className, which is a plain attribute', returning('<div className={yield t} />')],
		[
			'an attribute a later one of its name replaces',
			returning('<div title={yield bag.title} title="kept" />'),
		],
		['a class value the compiler evaluates', returning('<div class={null && (yield t)} />')],
		[
			'a class object with a computed key the compiler evaluates',
			returning("<div class={{ [(yield t, 'active')]: true }} />"),
		],
	])('allows a yield in %s, which Solid evaluates in place', (_label, source) => {
		expect(compile(source, 'App.tsrx', { collect: true }).errors).toEqual([]);
		expect(compile_to_volar_mappings(source, 'App.tsrx').errors).toEqual([]);
	});
});

// #1291: a server build (`ssr: true`) also follows babel-preset-solid's SSR
// output, as vite-plugin-solid compiles it (`generate: 'ssr'`,
// `hydratable: true`). That output renders a host element with a spread
// through `ssrElement`, with its children in an arrow and, when it has other
// attributes, its props merged in an arrow. It also evaluates an attribute
// value with an element in it in an arrow, and groups neighbouring dynamic
// values, `textContent` included, in one arrow.
describe("a yield in a template Solid's SSR output evaluates in an arrow (#1291)", () => {
	it.each([
		[
			"a host spread beside an attribute (#1291's shape)",
			returning('<input {...bag} title={yield 1} />'),
		],
		[
			"a host spread beside a ref (#246's shape)",
			returning("<input {...{}} ref={() => {}} title={yield 'title'} />"),
		],
		['a child of a host element with a spread', returning('<div {...bag}>{yield t}</div>')],
		[
			'an element in a host element with a spread',
			returning('<div {...bag}><b title={yield t} /></div>'),
		],
		['a stateful property beside a spread', returning('<input {...bag} checked={yield t} />')],
		["a textarea's value beside a spread", returning('<textarea {...bag} value={yield t} />')],
		[
			'textContent beside a dynamic attribute',
			returning('<p title={bag.title} textContent={yield t} />'),
		],
		[
			"textContent after a sibling's dynamic attribute",
			returning('<div><p title={bag.title} /><p textContent={yield t} /></div>'),
		],
		[
			'textContent beside a short circuit on a parameter',
			returning('<div title={t || bag.title} textContent={yield t} />'),
		],
		['an attribute value with an element in it', returning('<input title={(yield t) && <b />} />')],
		[
			'two attributes beside a spread, in source order',
			returning('<input {...bag} title={yield t} data-a={yield t} />'),
		],
		[
			'a spread in the output of a @{ … } body',
			template("<input {...bag} title={yield 'title'} />"),
		],
	])('reports each yield in %s in a server build only', (_label, source) => {
		const yields = [...source.matchAll(/\byield\b/g)].map((match) => match.index);
		expect(() => compile(source, 'App.tsrx', { ssr: true })).toThrow(
			expect.objectContaining({
				code: DIAGNOSTIC_CODES.TARGET_TEMPLATE_YIELD_UNSUPPORTED,
				pos: yields[0],
			}),
		);
		const server = compile(source, 'App.tsrx', { collect: true, ssr: true });
		expect(server.errors.map((error) => [error.code, error.pos])).toEqual(
			yields.map((start) => [DIAGNOSTIC_CODES.TARGET_TEMPLATE_YIELD_UNSUPPORTED, start]),
		);

		// The client build and the editor keep the DOM output's rules, and the
		// output is the same.
		const client = compile(source, 'App.tsrx', { collect: true });
		expect(client.errors).toEqual([]);
		expect(compile(source, 'App.tsrx', { collect: true, ssr: false }).errors).toEqual([]);
		expect(compile_to_volar_mappings(source, 'App.tsrx').errors).toEqual([]);
		expect(server.code).toBe(client.code);
	});

	it.each([
		['a static attribute value', returning('<input title={yield t} />')],
		['an element nested in the returned one', returning('<div><input title={yield t} /></div>')],
		[
			'an event handler, which the SSR output leaves out',
			returning('<button onClick={yield t} />'),
		],
		['a ref', returning('<div ref={yield bag.ref} />')],
		['an event handler beside a spread', returning('<button {...bag} onClick={yield t} />')],
		['a prop: value beside a spread', returning('<input {...bag} prop:value={yield t} />')],
		[
			'a live value beside its default and a spread, which the SSR output leaves out',
			returning('<input {...bag} value={yield t} defaultValue="x" />'),
		],
		['textContent on its own', returning('<p textContent={yield t} />')],
		['textContent beside a static attribute', returning('<p title={t} textContent={yield t} />')],
		[
			'textContent after a live value, which the SSR output sets apart',
			returning('<div><input value={bag.value} /><p textContent={yield t} /></div>'),
		],
		[
			'textContent on an element with children, which the SSR output leaves out',
			returning('<div title={bag.title} textContent={yield t}>child</div>'),
		],
		["a textarea's value", returning('<textarea value={yield t} />')],
		[
			'a branch that never runs, which the compiler folds away',
			returning('<div {...bag} title={true || (yield t)} />'),
		],
		[
			'a branch a constant rules out',
			`const off = false;\n${returning('<div {...bag} title={off && (yield t)} />')}`,
		],
		[
			'textContent beside a value the compiler folds into a literal',
			returning("<div title={{ x: 'a'.length }} textContent={yield t} />"),
		],
		[
			'the first of two attributes of a name, which the SSR output leaves out',
			returning('<p title={[yield t, <b />]} title={bag.title} />'),
		],
		[
			'the @{ … } body before the output',
			template("const title = yield 'title';\n\t<input {...bag} title={title} />"),
		],
	])('allows a yield in %s in a server build too', (_label, source) => {
		expect(compile(source, 'App.tsrx', { collect: true, ssr: true }).errors).toEqual([]);
		expect(compile(source, 'App.tsrx', { collect: true }).errors).toEqual([]);
	});

	it.each([
		['a dynamic attribute value', returning('<input title={yield bag.title} />')],
		['an element in a ternary arm', returning('t ? <input title={yield t} /> : null')],
		['a class value', returning('<div class={yield t} />')],
	])(
		'reports each yield in %s, which the DOM output moves, in a server build too',
		(_label, source) => {
			const yields = [...source.matchAll(/\byield\b/g)].map((match) => match.index);
			for (const options of [{ collect: true }, { collect: true, ssr: true }]) {
				expect(
					compile(source, 'App.tsrx', options).errors.map((error) => [error.code, error.pos]),
				).toEqual(
					yields.map((start) => [DIAGNOSTIC_CODES.TARGET_TEMPLATE_YIELD_UNSUPPORTED, start]),
				);
			}
		},
	);
});
