import { createRequire } from 'node:module';
import { TSRX_ERRORS } from '@tsrx/core';
import { compile } from '@tsrx/vue';
import { transformWithOxc } from 'vite';
import { describe, expect, it } from 'vitest';

// #259: `@tsrx/vue` reports a `yield` in a template (TSRX2034) by mirroring
// how vue-jsx-vapor compiles the output. This runs each probe through TSRX,
// then the installed vue-jsx-vapor compiler, then Vite's TypeScript strip, and
// checks that TSRX2034 appears exactly when the result fails to parse as a
// module. A vue-jsx-vapor release that compiles one of these differently fails
// here.
//
// #1370: the same holds for an `await` in a plain async function's template,
// reported as TSRX2021.

const require = createRequire(import.meta.url);
const { transform: vapor } = createRequire(require.resolve('vue-jsx-vapor'))(
	'@vue-jsx-vapor/compiler-rs',
);
const { parse } = createRequire(require.resolve('@tsrx/core'))('acorn');

/** @param {string} output */
const returning = (output) =>
	`export function* f(bag: any, t: any, Comp: any) {\n\treturn ${output};\n}`;

/** @param {string} output */
const template = (output) => `export function* f(bag: any, t: any) @{\n\t${output}\n}`;

/** @type {Array<[string, string]>} */
const PROBES = [
	// Reported: vapor creates each element in an arrow and its values in effects.
	['a static attribute value', returning('<input title={yield t} />')],
	['a dynamic attribute value', returning('<input title={yield bag.title} />')],
	['an attribute value, as yield*', returning('<input title={yield* bag.titles()} />')],
	['an event handler', returning('<button onClick={yield t} />')],
	['a ref', returning('<div ref={yield t} />')],
	['a child', returning('<p>{yield t}</p>')],
	['a fragment child', returning('<>{yield t}</>')],
	['an element in a ternary arm', returning('t ? <input title={yield t} /> : null')],
	['a component prop', returning('<Comp title={yield t} />')],
	['a component spread', returning('<Comp {...(yield t)} />')],
	['a component child', returning('<Comp>{yield t}</Comp>')],
	['an @if test', template('<div>\n\t\t@if (yield t) { <p>a</p> }\n\t</div>')],
	['an @if body', template('@if (t) {\n\t\t<p>{yield t}</p>\n\t}')],
	[
		'an @switch case',
		template('@switch (t) {\n\t\t@case 1: {\n\t\t\t<p>{yield t}</p>\n\t\t}\n\t}'),
	],
	['an @if test in a fragment', template('<>\n\t\t@if (yield t) {\n\t\t\t<p>a</p>\n\t\t}\n\t</>')],
	['an @for iterable', template('<ul>\n\t\t@for (const x of yield t) { <li>{x}</li> }\n\t</ul>')],
	[
		"a host spread beside a ref (#246's shape)",
		returning("t ? <input {...{}} ref={() => {}} title={yield 'title'} /> : null"),
	],
	['a returned element behind `as`', returning('(<input title={yield t} />) as any')],
	// Exempt: TSRX keeps the value out of the template.
	['a host spread', returning('<input {...(yield t)} />')],
	[
		'the @{ … } body before the output',
		template('const title = yield t;\n\t<input title={title} />'),
	],
	[
		'a nested generator',
		returning('<input title={[...(function* () { yield bag.t; })()].join()} />'),
	],
];

/**
 * A probe with each `yield` as an `await`, in an async function. A function
 * that returns its output, or has a `@{ … }` body, is a component, and a Vue
 * component can't await at all, so the function declares its output first.
 *
 * @param {Array<[string, string]>} probes
 * @returns {Array<[string, string]>}
 */
const as_await = (probes) =>
	probes
		.filter(([, source]) => !source.includes('yield*'))
		.map(([label, source]) => [
			label,
			source
				.replaceAll('function*', 'async function')
				.replace(/\byield\b/g, 'await')
				.replace(/\) @\{\n([\s\S]*)\n\}$/, ') {\n\tconst el = @{\n$1\n\t};\n\treturn el;\n}')
				.replace(/\breturn ((?!el;)[\s\S]*?);(\n\t*\})/g, 'const el = $1;\n\treturn el;$2'),
		]);

/** @param {string} output */
const block = (output) =>
	`export async function f(t: any, items: Set<string>, rows: Set<Set<string>>) {\n\tconst out = @{\n\t\t${output}\n\t};\n\treturn out;\n}`;

/** @type {Array<[string, string]>} */
const AWAIT_PROBES = [
	...as_await(PROBES),
	// Reported: TSRX awaits a closure it generates, inside the element.
	[
		'an awaiting @for in an element',
		block(
			'<ul>\n\t\t\t@for (const x of items) {\n\t\t\t\tconst v = await t;\n\t\t\t\t<li>{v}</li>\n\t\t\t}\n\t\t</ul>',
		),
	],
	[
		'an awaiting @for in a fragment',
		block(
			'<>\n\t\t\t@for (const x of items) {\n\t\t\t\tconst v = await t;\n\t\t\t\t<li>{v}</li>\n\t\t\t}\n\t\t</>',
		),
	],
	[
		'an inner @for that awaits, in an element of the outer one',
		block(
			'@for (const row of rows) {\n\t\t\tconst size = row.size;\n\t\t\t<ul data-size={size}>\n\t\t\t\t@for (const x of row) {\n\t\t\t\t\tconst v = await t;\n\t\t\t\t\t<li>{v}</li>\n\t\t\t\t}\n\t\t\t</ul>\n\t\t}',
		),
	],
	[
		'an inner @for that awaits, in the element of a VaporFor row',
		block(
			'@for (const row of rows) {\n\t\t\t<ul>\n\t\t\t\t@for (const x of row) {\n\t\t\t\t\tconst v = await t;\n\t\t\t\t\t<li>{v}</li>\n\t\t\t\t}\n\t\t\t</ul>\n\t\t}',
		),
	],
	[
		'an @if body with setup statements in an element',
		block(
			'<div>\n\t\t\t@if (t) {\n\t\t\t\tconst v = await t;\n\t\t\t\t<p>{v}</p>\n\t\t\t}\n\t\t</div>',
		),
	],
	[
		'an @switch case in an element',
		block(
			'<div>\n\t\t\t@switch (t) {\n\t\t\t\t@case 1: {\n\t\t\t\t\t<p>{await t}</p>\n\t\t\t\t}\n\t\t\t}\n\t\t</div>',
		),
	],
	[
		'a @try body',
		block('@try {\n\t\t\t<p>{await t}</p>\n\t\t} @catch (e) {\n\t\t\t<p>e</p>\n\t\t}'),
	],
	[
		'a @pending body',
		block('@try {\n\t\t\t<p>a</p>\n\t\t} @pending {\n\t\t\t<p>{await t}</p>\n\t\t}'),
	],
	// A module's top level can await.
	["a child at the module's top level", 'export const el = <p>{await Promise.resolve(1)}</p>;'],
	// Exempt: TSRX awaits the loop in the async function itself.
	[
		'an awaiting @for as the only output',
		block('@for (const x of items) {\n\t\t\tconst v = await t;\n\t\t\t<li>{v}</li>\n\t\t}'),
	],
];

/**
 * @param {string} code
 * @returns {Promise<boolean>}
 */
async function builds(code) {
	try {
		const compiled = vapor(code, { filename: 'probe.tsx' }).code;
		// The compiler returns no code for a source it can't read.
		if (!compiled) return false;
		const { code: js } = await transformWithOxc(compiled, 'probe.ts');
		parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
		return true;
	} catch {
		return false;
	}
}

describe('TSRX2034 matches what vue-jsx-vapor compiles (#259)', () => {
	it.each(PROBES)('%s', async (_label, source) => {
		const { code, errors } = compile(source, 'Probe.tsrx', { collect: true });
		const reported = errors.some((error) => error.code === 'TSRX2034');
		expect(errors.filter((error) => error.code !== 'TSRX2034')).toEqual([]);
		expect({ reported, builds: await builds(code) }).toEqual({ reported, builds: !reported });
	});
});

describe('TSRX2021 matches what vue-jsx-vapor compiles for an await in a template (#1370)', () => {
	// TSRX2021 for an `await` in a template, or in a callback the target calls,
	// but not the one for an `await` in a component.
	const messages = [
		TSRX_ERRORS.TARGET_TEMPLATE_AWAIT_UNSUPPORTED('Vue').message,
		TSRX_ERRORS.TARGET_AWAIT_UNSUPPORTED('Vue').message,
	];
	it.each(AWAIT_PROBES)('%s', async (_label, source) => {
		const { code, errors } = compile(source, 'Probe.tsrx', { collect: true });
		const reported = errors.length > 0;
		expect(errors.filter((error) => !messages.includes(error.message))).toEqual([]);
		expect({ reported, builds: await builds(code) }).toEqual({ reported, builds: !reported });
	});
});
