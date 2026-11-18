import { createRequire } from 'node:module';
import { compile } from '@tsrx/vue';
import { transformWithOxc } from 'vite';
import { describe, expect, it } from 'vitest';

// #259: `@tsrx/vue` reports a `yield` in a template (TSRX2034) by mirroring
// how vue-jsx-vapor compiles the output. This runs each probe through TSRX,
// then the installed vue-jsx-vapor compiler, then Vite's TypeScript strip, and
// checks that TSRX2034 appears exactly when the result fails to parse as a
// module. A vue-jsx-vapor release that compiles one of these differently fails
// here.

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
