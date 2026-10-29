import { createRequire } from 'node:module';
import { compile } from '@tsrx/solid';
import { transformWithOxc } from 'vite';
import { describe, expect, it } from 'vitest';

// #259: `@tsrx/solid` reports a `yield` in a template value (TSRX2034) by
// mirroring how babel-preset-solid compiles the output. This runs each probe
// through TSRX, then the installed babel-preset-solid the way vite-plugin-solid
// calls it, then Vite's TypeScript strip, and checks that TSRX2034 appears
// exactly when the result fails to parse as a module. A babel-preset-solid
// release that compiles one of these differently fails here.

const require = createRequire(import.meta.url);
const solid_require = createRequire(require.resolve('vite-plugin-solid'));
const { transformAsync } = solid_require('@babel/core');
const solid_preset = solid_require('babel-preset-solid');
const { parse } = createRequire(require.resolve('@tsrx/core'))('acorn');

/** @param {string} output */
const returning = (output) =>
	`export function* f(bag: any, t: any, Comp: any) {\n\treturn ${output};\n}`;

/** @param {string} output */
const template = (output) => `export function* f(bag: any, t: any) @{\n\t${output}\n}`;

/** @type {Array<[string, string]>} */
const PROBES = [
	// Reported: the compiler moves the value into an effect, getter or arrow.
	['a dynamic attribute value', returning('<input title={yield bag.title} />')],
	['a call in an attribute value', returning('<input title={yield bag.title()} />')],
	['an attribute value, as yield*', returning('<input title={yield* bag.titles()} />')],
	['a class value', returning('<div class={yield t} />')],
	['a style value', returning('<div style={yield t} />')],
	['a class object with a dynamic value', returning('<div class={{ a: yield bag.a }} />')],
	['an array ref', returning('<div ref={[yield t]} />')],
	['a dynamic use: directive', returning('<div use:dir={yield bag.value} />')],
	['a dynamic child', returning('<p>{yield bag.text}</p>')],
	['a host spread', returning('<input {...(yield t)} />')],
	['an element in a ternary arm', returning('t ? <input title={yield t} /> : null')],
	['an element in a fragment', returning('<><input title={yield t} /></>')],
	['an element in a child expression', returning('<div>{<input title={yield t} />}</div>')],
	['a dynamic component prop', returning('<Comp title={yield bag.title} />')],
	['a dynamic component spread', returning('<Comp {...(yield bag.props)} />')],
	['a component with several children', returning('<Comp>a{yield t}</Comp>')],
	['a component with an element child', returning('<Comp><b />{yield t}</Comp>')],
	['a lone dynamic component child', returning('<Comp>{yield bag.text}</Comp>')],
	['an assignable component ref', returning('<Comp ref={(yield t).field} />')],
	['an element in a component prop', returning('<Comp a={<b title={yield t} />} />')],
	[
		'an @switch case in an expression',
		returning("<p>{@switch (t) { @case 1: { <span title={yield 'title'} /> } }}</p>"),
	],
	['a dynamic @if test', template('<div>\n\t\t@if (yield bag.ok) { <p>a</p> }\n\t</div>')],
	['an @if body', template('<div>\n\t\t@if (t) { <p title={yield bag.t}>a</p> }\n\t</div>')],
	[
		'a dynamic @for iterable',
		template('<ul>\n\t\t@for (const x of yield bag.items) { <li>{x}</li> }\n\t</ul>'),
	],
	[
		'an element assigned to a variable',
		`export function* f(t: any) {\n\tlet el;\n\tel = <input title={yield t} />;\n\treturn el;\n}`,
	],
	['an attribute named like an event, but not one', returning('<details open={yield bag.open} />')],
	// vite-plugin-solid hands babel the TypeScript as written, so a wrapper
	// hides the element or value from the compiler's checks.
	['a returned element behind `as`', returning('(<input title={yield t} />) as any')],
	['a returned element behind `satisfies`', returning('(<input title={yield t} />) satisfies any')],
	['a returned element behind `!`', returning('(<input title={yield t} />)!')],
	[
		'a declared element behind `as`',
		`export function* f(t: any) {\n\tconst el = (<input title={yield t} />) as any;\n\treturn el;\n}`,
	],
	['a class object behind `as`', returning('<div class={{ active: yield t } as any} />')],
	['a component ref behind `as`', returning('<Comp ref={(yield t).field as any} />')],
	['a component with a ref call', returning('<Comp title={yield t} ref={bag.make()} />')],
	// Exempt: the compiler evaluates the value in place.
	['a static attribute value', returning('<input title={yield t} />')],
	['a literal attribute value', returning("<input title={yield 'title'} />")],
	['an event handler', returning('<button onClick={yield bag.onClick} />')],
	['a namespaced event handler', returning('<button on:click={yield bag.onClick} />')],
	['a ref', returning('<div ref={yield bag.ref} />')],
	['a class object', returning('<div class={{ active: yield t }} />')],
	['a static use: directive', returning('<div use:dir={yield t} />')],
	['a static child', returning('<p>{yield t}</p>')],
	['an element nested in the returned one', returning('<div><input title={yield t} /></div>')],
	[
		'an element declared as a whole',
		`export function* f(t: any) {\n\tconst el = <input title={yield t} />;\n\treturn el;\n}`,
	],
	[
		'an attribute starting with `on`, which Solid treats as an event',
		returning('<input one={yield bag.x} />'),
	],
	[
		'an element in a fragment in the returned one',
		returning('<div><><input title={yield t} /></></div>'),
	],
	['an array ref behind `as`', returning('<div ref={[yield t] as any} />')],
	['a component ref the compiler drops', returning('<Comp ref={(yield t)?.field} />')],
	['a component array ref', returning('<Comp ref={[yield t] as any} />')],
	['a static component prop', returning('<Comp title={yield t} />')],
	['a lone static component child', returning('<Comp>{yield t}</Comp>')],
	['a component in a ternary arm', returning('t ? <Comp title={yield t} /> : null')],
	['a component that drops its ref', returning('<Comp ref={yield t} />')],
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
	const compiled = await transformAsync(code, {
		filename: 'probe.tsx',
		presets: [[solid_preset, { generate: 'dom', hydratable: false }]],
		parserOpts: { plugins: ['jsx', 'decorators', 'typescript'] },
		babelrc: false,
		configFile: false,
	});
	try {
		const { code: js } = await transformWithOxc(/** @type {string} */ (compiled?.code), 'probe.ts');
		parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
		return true;
	} catch {
		return false;
	}
}

describe('TSRX2034 matches what babel-preset-solid compiles (#259)', () => {
	it.each(PROBES)('%s', async (_label, source) => {
		const { code, errors } = compile(source, 'Probe.tsrx', { collect: true });
		const reported = errors.some((error) => error.code === 'TSRX2034');
		expect(errors.filter((error) => error.code !== 'TSRX2034')).toEqual([]);
		expect({ reported, builds: await builds(code) }).toEqual({ reported, builds: !reported });
	});
});
