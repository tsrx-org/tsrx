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
	[
		'a dynamic event handler beside a spread',
		returning('<button {...bag} onClick={yield bag.onClick} />'),
	],
	['a dynamic value beside a spread', returning('<input {...bag} title={yield bag.title} />')],
	["a <select>'s value", returning('<select value={yield t} />')],
	["a <select>'s prop:value", returning('<select prop:value={yield t} />')],
	['a branch kept since it folds to null', returning('<input title={null && (yield bag.x)} />')],
	['a boolean child, which stays a child', returning('<p>{false && (yield bag.x)}</p>')],
	['a value whose whole is a tagged template', returning('<div title={Comp`${yield t}`} />')],
	['a member tag inside a value', returning('<div title={(yield t) + bag.tag`x`} />')],
	['an object with a member value', returning('<div title={{ a: yield t, b: bag.x }} />')],
	['a dynamic class object key', returning('<div class={{ active: yield bag.active }} />')],
	['a class object with a computed key', returning('<div class={{ [t]: yield t }} />')],
	['a class object key with a space', returning("<div class={{ 'a b': yield t }} />")],
	[
		'a class array whose object repeats a static class',
		returning("<div class={['a', { a: yield t }]} />"),
	],
	['a class array led by a dynamic value', returning('<div class={[bag.x, { a: yield t }]} />')],
	['a style object with a computed key', returning('<div style={{ [t]: yield t }} />')],
	['a style object with a spread', returning('<div style={{ ...bag, color: yield t }} />')],
	['a style object with a dynamic computed key', returning('<div style={{ [bag.k]: yield t }} />')],
	['the last of two attributes of a name', returning('<div title="a" title={yield bag.x} />')],
	[
		"a textarea's children beside a literal value",
		returning('<textarea value="x">{yield bag.t}</textarea>'),
	],
	[
		"a textarea's children beside a literal default",
		returning('<textarea defaultValue="x">{yield bag.t}</textarea>'),
	],
	[
		"a textarea's children beside a bare value",
		returning('<textarea value>{yield bag.t}</textarea>'),
	],
	[
		"a textarea's element child beside a literal value",
		returning('<textarea value="x"><b title={yield bag.t} /></textarea>'),
	],
	[
		"a textarea's children beside a dynamic value",
		returning('<textarea value={bag.v}>{yield bag.t}</textarea>'),
	],
	[
		"a textarea's children beside a null value",
		returning('<textarea value={null}>{yield bag.t}</textarea>'),
	],
	[
		'a children attribute on an element with children',
		returning('<div children={yield bag.t}>x</div>'),
	],
	['a children attribute on a void element', returning('<input children={yield bag.t} />')],
	['a class object with a method', returning('<div class={{ a: yield t, b() { return 1; } }} />')],
	[
		'a class object with a method first',
		returning('<div class={{ b() { return 1; }, a: yield t }} />'),
	],
	[
		'a class object with a getter',
		returning('<div class={{ a: yield t, get b() { return 1; } }} />'),
	],
	[
		'a class array whose object has a method',
		returning("<div class={['s', { a: yield t, b() { return 1; } }]} />"),
	],
	['event data the compiler does not delegate', returning('<div onScroll={[bag.h, yield t]} />')],
	[
		'an event handler in an array the compiler does not delegate',
		returning('<div onScroll={[yield t, bag.d]} />'),
	],
	['a lone event handler in an array', returning('<div onScroll={[yield t]} />')],
	['a third element of an event array', returning('<div onScroll={[bag.h, bag.d, yield t]} />')],
	['delegated event data', returning('<div onClick={[bag.h, yield t]} />')],
	['namespaced event data', returning('<div on:click={[bag.h, yield t]} />')],
	['event data under a type assertion', returning('<div onScroll={[bag.h, yield t] as any} />')],
	['event data before a spread', returning('<div onScroll={[bag.h, yield t, ...bag.e]} />')],
	['event data before a hole', returning('<div onScroll={[bag.h, yield t, ,]} />')],
	['spread event data', returning('<div onScroll={[bag.h, ...(yield t)]} />')],
	[
		'an event handler in an array before a spread',
		returning('<div onScroll={[yield t, bag.d, ...bag.e]} />'),
	],
	['a child of a void element', returning('<input>{yield bag.t}</input>')],
	['a child of a nested void element', returning('<div><input>{yield bag.t}</input></div>')],
	['an element in a void element', returning('<br><b title={yield bag.t} /></br>')],
	["a child of an upper-case INPUT, which isn't void", returning('<INPUT>{yield bag.t}</INPUT>')],
	['a child of a noscript', returning('<noscript>{yield bag.t}</noscript>')],
	['an element in a noscript', returning('<noscript><b title={yield bag.t} /></noscript>')],
	['an attribute of a noscript', returning('<noscript title={yield bag.t} />')],
	['a child of an upper-case NOSCRIPT', returning('<NOSCRIPT>{yield bag.t}</NOSCRIPT>')],
	['a dynamic children attribute on its own', returning('<div children={yield bag.t} />')],
	[
		'a children attribute beside a spread and children',
		returning('<div {...bag} children={yield bag.t}>x</div>'),
	],
	[
		'a stateful value the compiler renames before it drops duplicates',
		returning('<input value={yield bag.value} value="kept" />'),
	],
	[
		"a textarea's value after one the compiler folds into its content",
		returning('<textarea value="first" value={yield bag.value} defaultValue="fallback" />'),
	],
	[
		'a dynamic style key kept since it folds to null',
		returning('<div style={{ color: null && (yield bag.x) }} />'),
	],
	[
		'a className object with a member value',
		returning('<div className={{ a: yield t, b: bag.b }} />'),
	],
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
	['a class value beside a spread', returning('<div {...bag} class={yield t} />')],
	['a style value beside a spread', returning('<div {...bag} style={yield t} />')],
	['a static event handler beside a spread', returning('<button {...bag} onClick={yield t} />')],
	['a <select> value beside a spread', returning('<select {...bag} value={yield t} />')],
	["a textarea's value", returning('<textarea value={yield t} />')],
	['an object whose other value folds', returning("<div title={{ a: yield t, b: 'x'.length }} />")],
	[
		'an object whose nested value folds',
		returning("<div title={{ a: yield t, b: { c: 'x'[0] } }} />"),
	],
	['a tagged template inside a value', returning('<div title={`${yield t}` + Comp`x`} />')],
	['a branch the compiler folds away', returning('<input title={false && (yield bag.x)} />')],
	['a dead branch after true', returning('<input title={true || (yield bag.x)} />')],
	['a dead conditional branch', returning("<input title={1 ? 'a' : (yield bag.x)} />")],
	['a child that folds into text', returning("<p>{'a' || (yield bag.x)}</p>")],
	[
		'a class object key beside a dynamic one',
		returning('<div class={{ active: yield t, big: bag.big }} />'),
	],
	['a class object key that drops', returning('<div class={{ active: null && (yield bag.x) }} />')],
	["a class array's split object", returning("<div class={['x', { a: yield t }]} />")],
	[
		"a class array's split object with a tagged template",
		returning("<div class={['x', { a: (yield t) + Comp`x` }]} />"),
	],
	[
		'a style object key beside a dynamic one',
		returning('<div style={{ color: yield t, width: bag.w }} />'),
	],
	[
		'a style object key that folds into the style',
		returning("<div style={{ color: 'a' || (yield bag.x) }} />"),
	],
	['a sequence that folds into its last value', returning("<input title={(yield bag.x, 'a')} />")],
	['a className', returning('<div className={yield t} />')],
	[
		'an attribute a later one of its name replaces',
		returning('<div class={{ [yield t]: true }} class="kept" />'),
	],
	[
		'a value whose type the compiler evaluates',
		returning('<div title={typeof class extends (yield bag.x) {}} />'),
	],
	[
		'a className object with a tagged template value',
		returning('<div className={{ a: Comp`${yield t}` }} />'),
	],
	['a class value the compiler evaluates', returning('<div class={null && (yield t)} />')],
	['a style value the compiler evaluates', returning('<div style={null && (yield t)} />')],
	[
		'a class object with a computed key it evaluates',
		returning("<div class={{ [(yield t, 'active')]: true }} />"),
	],
	[
		'a style object with a computed key it evaluates',
		returning("<div style={{ [(yield t, 'color')]: 'red' }} />"),
	],
	[
		'a class object key holding an array it evaluates',
		returning('<div class={{ active: [(yield bag.x, 1)] }} />'),
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
