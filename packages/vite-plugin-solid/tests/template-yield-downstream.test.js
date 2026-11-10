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
//
// #1291: with `ssr: true`, as `@tsrx/vite-plugin-solid` compiles a server
// build, TSRX2034 must appear exactly when the server build (SSR output) or
// its client build (DOM output) fails, since either fails the app.

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
	[
		'a child of a void element in a ternary arm',
		returning('t ? <input>{yield bag.t}</input> : null'),
	],
	[
		'a child of a noscript in a ternary arm',
		returning('t ? <noscript>{yield bag.t}</noscript> : null'),
	],
	[
		"a textarea's replaced child in a ternary arm",
		returning('t ? <textarea value="x">{yield bag.t}</textarea> : null'),
	],
	[
		'a dropped third event element in a ternary arm',
		returning('t ? <div onScroll={[bag.h, bag.d, yield bag.x]} /> : null'),
	],
	['event data in a ternary arm', returning('t ? <div onScroll={[bag.h, yield bag.x]} /> : null')],
	[
		'a replaced attribute in a fragment',
		returning('<><input title={yield bag.t} title={bag.u} /></>'),
	],
	[
		'a dropped children attribute in a component child',
		returning('<Comp><div children={yield bag.t}>x</div></Comp>'),
	],
	[
		"a void element's child in a dynamic child",
		returning('<div>{t ? <input>{yield bag.t}</input> : null}</div>'),
	],
	['a children attribute on a noscript', returning('<noscript children={yield bag.t} />')],
	[
		"a children attribute beside a textarea's literal value",
		returning('<textarea value="x" children={yield bag.t} />'),
	],
	[
		"a children attribute beside a textarea's number value",
		returning('<textarea value={1} children={yield bag.t} />'),
	],
	[
		"a children attribute beside a textarea's dynamic value",
		returning('<textarea value={bag.v} children={yield bag.t} />'),
	],
	[
		"a component's children prop beside children",
		returning('<Comp children={yield bag.t}>x</Comp>'),
	],
	[
		"a component's static children prop beside children",
		returning('<Comp children={yield t}>x</Comp>'),
	],
	[
		"a component's children prop beside children, in an arrow",
		returning('t ? <div><Comp children={yield t}>x</Comp></div> : null'),
	],
	["a component's children prop on its own", returning('<Comp children={yield bag.t} />')],
	[
		"a component's children prop beside a spread and children",
		returning('<Comp {...bag} children={yield bag.t}>x</Comp>'),
	],
	[
		"a delegated event array's tail in an arrow",
		returning('t ? <button onClick={[bag.h, bag.d, yield bag.x]} /> : null'),
	],
	[
		'delegated event data in an arrow',
		returning('t ? <button onClick={[bag.h, yield bag.x]} /> : null'),
	],
	[
		'a lone delegated handler in an array, in an arrow',
		returning('t ? <button onClick={[yield bag.x]} /> : null'),
	],
	["an element's $key", returning('<div $key={yield bag.k} />')],
	["an element's $key in an arrow", returning('t ? <div $key={yield t} /> : null')],
	["an element's $key beside a spread", returning('<div {...bag} $key={yield bag.k} />')],
	["an element's second $key", returning('<div $key={bag.k} $key={yield bag.k} />')],
	["a component's $key", returning('<Comp $key={yield bag.k} />')],
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
 * Shapes aimed at the SSR output: a host spread beside other attributes or
 * with children, `textContent` beside dynamic values, and an element in an
 * attribute value. The server-build check also runs every probe above.
 *
 * @type {Array<[string, string]>}
 */
const SERVER_PROBES = [
	// A textarea's value is rendered as its content.
	[
		"a textarea's value before a prop:value",
		'export function* f(bag: any, t: any) {\n\treturn <textarea value={yield bag.t} prop:value="x" />;\n}',
	],
	[
		"a textarea's defaultValue before a prop:defaultValue",
		'export function* f(bag: any, t: any) {\n\treturn <textarea defaultValue={yield bag.t} prop:defaultValue="x" />;\n}',
	],
	[
		"a textarea's static value before a prop:value",
		'export function* f(bag: any, t: any) {\n\treturn <textarea value={yield t} prop:value="x" />;\n}',
	],
	[
		"a textarea's dynamic value",
		'export function* f(bag: any, t: any) {\n\treturn <textarea value={yield bag.t} />;\n}',
	],
	[
		"a textarea's static value",
		'export function* f(bag: any, t: any) {\n\treturn <textarea value={yield t} />;\n}',
	],
	[
		"a textarea's value with an element in it",
		'export function* f(bag: any, t: any) {\n\treturn <textarea value={[yield t, <b />]} />;\n}',
	],
	[
		"a textarea's value beside a dynamic attribute",
		'export function* f(bag: any, t: any) {\n\treturn <textarea title={bag.x} value={yield t} />;\n}',
	],
	// A content property with no value doesn't fill the slot; one of the same
	// name still replaces an earlier one.
	[
		'spread parent: textContent then valueless textContent',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p textContent={yield t} textContent /></div>;\n}',
	],
	[
		'spread parent: textContent then valueless innerHTML',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p textContent={yield t} innerHTML /></div>;\n}',
	],
	[
		'spread parent: textContent then valueless innerText',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p textContent={yield t} innerText /></div>;\n}',
	],
	[
		'spread parent: textContent then valueless children',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p textContent={yield t} children /></div>;\n}',
	],
	[
		'spread parent: innerHTML then valueless textContent',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p innerHTML={yield t} textContent /></div>;\n}',
	],
	[
		'spread parent: innerHTML then valueless innerHTML',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p innerHTML={yield t} innerHTML /></div>;\n}',
	],
	[
		'spread parent: innerHTML then valueless innerText',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p innerHTML={yield t} innerText /></div>;\n}',
	],
	[
		'spread parent: innerHTML then valueless children',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p innerHTML={yield t} children /></div>;\n}',
	],
	[
		'spread parent: innerText then valueless textContent',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p innerText={yield t} textContent /></div>;\n}',
	],
	[
		'spread parent: innerText then valueless innerHTML',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p innerText={yield t} innerHTML /></div>;\n}',
	],
	[
		'spread parent: innerText then valueless innerText',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p innerText={yield t} innerText /></div>;\n}',
	],
	[
		'spread parent: innerText then valueless children',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p innerText={yield t} children /></div>;\n}',
	],
	[
		'spread parent: children then valueless textContent',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p children={yield t} textContent /></div>;\n}',
	],
	[
		'spread parent: children then valueless innerHTML',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p children={yield t} innerHTML /></div>;\n}',
	],
	[
		'spread parent: children then valueless innerText',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p children={yield t} innerText /></div>;\n}',
	],
	[
		'spread parent: children then valueless children',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p children={yield t} children /></div>;\n}',
	],
	[
		'grouping: textContent then valueless innerHTML',
		'export function* f(bag: any, t: any) {\n\treturn <p title={bag.x} textContent={yield t} innerHTML />;\n}',
	],
	[
		'spread parent: textContent then innerHTML literal',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p textContent={yield t} innerHTML="x" /></div>;\n}',
	],
	[
		'spread parent: title then valueless title',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p title={yield t} title /></div>;\n}',
	],
	[
		'root: dyn title then valueless title',
		'export function* f(bag: any, t: any) {\n\treturn <p title={yield bag.t} title />;\n}',
	],
	// One content slot: the last content property fills it.
	[
		"a textContent a later innerHTML replaces, in a spread's children",
		returning('<div {...bag}><p textContent={yield t} innerHTML="x" /></div>'),
	],
	[
		"a children attribute a later innerText replaces, in a spread's children",
		returning('<div {...bag}><p children={yield t} innerText="x" /></div>'),
	],
	[
		"an innerHTML a later textContent replaces, in a spread's children",
		returning('<div {...bag}><p innerHTML={yield t} textContent="x" /></div>'),
	],
	[
		"a dynamic innerHTML after a textContent, in a spread's children",
		returning('<div {...bag}><p textContent="x" innerHTML={yield bag.t} /></div>'),
	],
	// Where the SSR output's names, drops and arrows differ from the DOM output's.
	[
		'a value before a prop:value',
		'export function* f(bag: any, t: any) {\n\treturn <input value={yield bag.t} prop:value="x" />;\n}',
	],
	[
		'a checked before a prop:checked',
		'export function* f(bag: any, t: any) {\n\treturn <input checked={yield bag.t} prop:checked={true} />;\n}',
	],
	[
		'a defaultValue before a prop:defaultValue',
		'export function* f(bag: any, t: any) {\n\treturn <input defaultValue={yield bag.t} prop:defaultValue="x" />;\n}',
	],
	[
		"a select's static value before a prop:value",
		'export function* f(bag: any, t: any) {\n\treturn <select value={yield t} prop:value="x" />;\n}',
	],
	[
		'a static value before a prop:value',
		'export function* f(bag: any, t: any) {\n\treturn <input value={yield t} prop:value="x" />;\n}',
	],
	[
		"an event handler in a noscript's dynamic child",
		'export function* f(bag: any, t: any) {\n\treturn <noscript>{bag.x && <button onClick={yield t} />}</noscript>;\n}',
	],
	[
		'an event handler in an element in a host element with a spread',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><button onClick={yield t} /></div>;\n}',
	],
	[
		'a prop: value in an element in a host element with a spread',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><input prop:value={yield t} /></div>;\n}',
	],
	[
		'a dropped textContent in an element in a host element with a spread',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><p textContent={yield t}>x</p></div>;\n}',
	],
	[
		'a ref in an element in a host element with a spread',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag}><b ref={yield t} /></div>;\n}',
	],
	[
		"a $key in a textarea's replaced child",
		'export function* f(bag: any, t: any) {\n\treturn <textarea value={bag.v}>{<div $key={bag.x && (yield t)} />}</textarea>;\n}',
	],
	[
		"a textarea's replaced dynamic child",
		'export function* f(bag: any, t: any) {\n\treturn <textarea value={bag.v}>{yield bag.t}</textarea>;\n}',
	],
	[
		"a textarea's replaced static child",
		'export function* f(bag: any, t: any) {\n\treturn <textarea value={bag.v}>{yield t}</textarea>;\n}',
	],
	[
		'an event handler in a ternary child',
		'export function* f(bag: any, t: any) {\n\treturn <div>{bag.x ? <button onClick={yield t} /> : null}</div>;\n}',
	],
	[
		'an array ref in a ternary child',
		'export function* f(bag: any, t: any) {\n\treturn <div>{bag.x ? <b ref={[yield t]} /> : null}</div>;\n}',
	],
	[
		'a textContent a later one replaces',
		'export function* f(bag: any, t: any) {\n\treturn <p textContent={yield bag.t} textContent="x" />;\n}',
	],
	[
		'a textContent that replaces a static one',
		'export function* f(bag: any, t: any) {\n\treturn <p textContent="x" textContent={yield bag.t} />;\n}',
	],
	[
		'an element in a textContent array',
		'export function* f(bag: any, t: any) {\n\treturn <p textContent={[yield t, <b />]} />;\n}',
	],
	[
		'a dynamic textContent on its own',
		'export function* f(bag: any, t: any) {\n\treturn <p textContent={yield bag.t} />;\n}',
	],
	[
		'a dynamic innerHTML',
		'export function* f(bag: any, t: any) {\n\treturn <p innerHTML={yield bag.t} />;\n}',
	],
	[
		'a dynamic children attribute on its own',
		'export function* f(bag: any, t: any) {\n\treturn <div children={yield bag.t} />;\n}',
	],
	[
		'a dynamic children attribute on a noscript',
		'export function* f(bag: any, t: any) {\n\treturn <noscript children={yield bag.t} />;\n}',
	],
	// `$key`, a `<noscript>`'s children and parameter properties, where the
	// SSR output differs from the DOM's or babel's scope from the declarations.
	[
		'a first $key beside a later $key, which the SSR output renames',
		'export function* f(bag: any, t: any) {\n\treturn <div $key={yield bag.x} $key="second" />;\n}',
	],
	[
		'a first $key beside a later _key',
		'export function* f(bag: any, t: any) {\n\treturn <div $key={yield bag.x} _key="second" />;\n}',
	],
	[
		'textContent beside a $key a later _key replaces',
		returning('<p $key={bag.k} _key="x" textContent={yield t} />'),
	],
	['textContent beside a dynamic $key', returning('<p $key={bag.k} textContent={yield t} />')],
	[
		'a _key before a $key',
		'export function* f(bag: any, t: any) {\n\treturn <div _key={yield bag.x} $key="k" />;\n}',
	],
	[
		'a second $key',
		'export function* f(bag: any, t: any) {\n\treturn <div $key="k" $key={yield bag.x} />;\n}',
	],
	[
		'a dynamic $key, which the SSR output renders',
		'export function* f(bag: any, t: any) {\n\treturn <div $key={yield bag.x} />;\n}',
	],
	['a static $key', 'export function* f(bag: any, t: any) {\n\treturn <div $key={yield t} />;\n}'],
	[
		'a $key beside a spread',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag} $key={yield bag.x} />;\n}',
	],
	[
		'a static $key beside a spread',
		'export function* f(bag: any, t: any) {\n\treturn <div {...bag} $key={yield t} />;\n}',
	],
	[
		'a static $key in a ternary arm',
		'export function* f(bag: any, t: any) {\n\treturn t ? <div $key={yield t} /> : null;\n}',
	],
	[
		'a dynamic $key in a ternary arm',
		'export function* f(bag: any, t: any) {\n\treturn t ? <div $key={yield bag.x} /> : null;\n}',
	],
	[
		"a noscript's dynamic child, which the SSR output renders",
		'export function* f(bag: any, t: any) {\n\treturn <noscript>{yield bag.t}</noscript>;\n}',
	],
	[
		"a noscript's static child in a ternary arm",
		'export function* f(bag: any, t: any) {\n\treturn t ? <noscript>{yield t}</noscript> : null;\n}',
	],
	[
		"a noscript's dynamic child in a ternary arm",
		'export function* f(bag: any, t: any) {\n\treturn t ? <noscript>{yield bag.t}</noscript> : null;\n}',
	],
	[
		'textContent beside String(1) and a parameter property named String',
		'class C {\n\tconstructor(public String: any) {\n\t\tfunction* f(t: any) {\n\t\t\treturn <div title={String(1)} textContent={yield t} />;\n\t\t}\n\t}\n}',
	],
	[
		'textContent beside String(1) and a readonly parameter property named String',
		'class C {\n\tconstructor(private readonly String: any = 1) {\n\t\tfunction* f(t: any) {\n\t\t\treturn <div title={String(1)} textContent={yield t} />;\n\t\t}\n\t}\n}',
	],
	[
		'textContent beside String(1) and a constructor parameter named String',
		'class C {\n\tconstructor(String: any) {\n\t\tfunction* f(t: any) {\n\t\t\treturn <div title={String(1)} textContent={yield t} />;\n\t\t}\n\t}\n}',
	],
	[
		'textContent beside String(1) and a type import named String',
		"import type { String } from 'x';\nexport function* f(t: any) {\n\treturn <div title={String(1)} textContent={yield t} />;\n}",
	],
	// TypeScript declarations babel's scope does or doesn't bind.
	[
		'textContent beside String(1) and `namespace String {}`',
		'namespace String {}\nexport function* f(t: any) {\n\treturn <div title={String(1)} textContent={yield t} />;\n}',
	],
	[
		'textContent beside String(1) and `enum String { A }`',
		'enum String { A }\nexport function* f(t: any) {\n\treturn <div title={String(1)} textContent={yield t} />;\n}',
	],
	[
		'textContent beside String(1) and `declare class String {}`',
		'declare class String {}\nexport function* f(t: any) {\n\treturn <div title={String(1)} textContent={yield t} />;\n}',
	],
	[
		'textContent beside String(1) and `declare function String(): string;`',
		'declare function String(): string;\nexport function* f(t: any) {\n\treturn <div title={String(1)} textContent={yield t} />;\n}',
	],
	[
		'textContent beside String(1) and `import String = Foo.Bar;`',
		'import String = Foo.Bar;\nexport function* f(t: any) {\n\treturn <div title={String(1)} textContent={yield t} />;\n}',
	],
	// Values the SSR check counts as maybe folded, beside `yield`s the DOM
	// output moves.
	[
		'a branch a constant decides, which the SSR check counts as maybe folded',
		'const on = true;\nexport function* f(bag: any) {\n\treturn <input title={on && (yield bag.t)} />;\n}',
	],
	[
		'a ternary arm a constant decides',
		'const off = false;\nexport function* f(bag: any) {\n\treturn <input title={off ? 0 : (yield bag.title)} />;\n}',
	],
	[
		'a child guarded by a destructured value',
		'export function* f(bag: any) {\n\tconst { off } = bag;\n\treturn <div>{off && (yield bag.t)}</div>;\n}',
	],
	[
		'a child guarded by a let',
		'export function* f(bag: any) {\n\tlet off = false;\n\treturn <div>{off && (yield bag.t)}</div>;\n}',
	],
	[
		'a child guarded by a constant',
		'const off = false;\nexport function* f(bag: any) {\n\treturn <div>{off && (yield bag.t)}</div>;\n}',
	],
	// Reported in a server build: the SSR output moves the value into an arrow.
	[
		"a host spread beside an attribute (#1291's shape)",
		returning('<input {...bag} title={yield 1} />'),
	],
	[
		"a host spread beside a ref (#246's shape), returned",
		returning("<input {...{}} ref={() => {}} title={yield 'title'} />"),
	],
	['an attribute before a host spread', returning('<input title={yield t} {...bag} />')],
	['a host spread beside a static attribute', returning('<input {...(yield t)} title="x" />')],
	['a child of a host element with a spread', returning('<div {...bag}>{yield t}</div>')],
	[
		'an element in a host element with a spread',
		returning('<div {...bag}><b title={yield t} /></div>'),
	],
	['a children prop beside a spread', returning('<div {...bag} children={yield t} />')],
	['textContent beside a spread', returning('<p {...bag} textContent={yield t} />')],
	['a stateful property beside a spread', returning('<input {...bag} checked={yield t} />')],
	["a textarea's value beside a spread", returning('<textarea {...bag} value={yield t} />')],
	['a host spread in an element', returning('<div><input {...bag} title={yield t} /></div>')],
	[
		'textContent beside a dynamic attribute',
		returning('<p title={bag.title} textContent={yield t} />'),
	],
	[
		"textContent after a sibling's dynamic attribute",
		returning('<div><p title={bag.title} /><p textContent={yield t} /></div>'),
	],
	[
		"textContent before a sibling's dynamic class",
		returning('<div><p textContent={yield t} /><p class={bag.c} /></div>'),
	],
	['an attribute value with an element in it', returning('<input title={(yield t) && <b />} />')],
	['an attribute value with a fragment in it', returning('<input title={[yield t, <>x</>]} />')],
	['a spread in the output of a @{ … } body', template("<input {...bag} title={yield 'title'} />")],
	[
		'textContent beside a short circuit that reads a member',
		returning('<div title={bag.x || 1} textContent={yield t} />'),
	],
	[
		'textContent beside a short circuit on a parameter',
		returning('<div title={t || bag.x} textContent={yield t} />'),
	],
	[
		'textContent beside the type of a member',
		returning('<div title={typeof bag.x} textContent={yield t} />'),
	],
	[
		'textContent beside a call to an imported binding named like a global',
		`import Number = require('./number');\n${returning('<div title={Number(1)} textContent={yield t} />')}`,
	],
	[
		'textContent beside a reassigned binding',
		`export function* f(bag: any, t: any) {\n\tlet on = true;\n\ton = bag.on;\n\treturn <div title={on && bag.x} textContent={yield t} />;\n}`,
	],
	[
		'a branch a reassigned binding leaves open',
		`let on = false;\non = true;\n${returning('<div {...bag} title={on && (yield t)} />')}`,
	],
	// The compiler folds only to a string, number or boolean.
	[
		'a short circuit to null beside a spread',
		returning('<div {...bag} title={null && (yield t)} />'),
	],
	['a boolean child of a spread', returning('<div {...bag}>{true || (yield t)}</div>')],
	[
		'the last of two attributes of a name',
		returning('<p title={bag.x} title={[yield t, <b />]} />'),
	],
	[
		'textContent after the last of two attributes of a name',
		returning('<div><p title="s" title={bag.x} /><p textContent={yield t} /></div>'),
	],
	[
		'textContent beside a call a local binding shadows',
		`export function* f(bag: any, t: any) {\n\tconst String = (x: any) => x;\n\treturn <div title={String(1)} textContent={yield t} />;\n}`,
	],
	[
		'textContent beside a short circuit a literal leaves open',
		returning('<div title={false || bag.x} textContent={yield t} />'),
	],
	[
		'textContent beside a conditional a literal test sends to a member',
		returning("<div title={0 ? 'a' : bag.x} textContent={yield t} />"),
	],
	// Exempt: both outputs evaluate the value in place, or leave it out.
	['an event handler beside a spread', returning('<button {...bag} onClick={yield t} />')],
	['a prop: value beside a spread', returning('<input {...bag} prop:value={yield t} />')],
	[
		'a live value beside its default and a spread',
		returning('<input {...bag} value={yield t} defaultValue="x" />'),
	],
	[
		"a textarea's children beside its value and a spread",
		returning('<textarea {...bag} value={bag.value}>{yield t}</textarea>'),
	],
	['textContent on its own', returning('<p textContent={yield t} />')],
	['textContent beside a static attribute', returning('<p title={t} textContent={yield t} />')],
	[
		'textContent after a live value',
		returning('<div><input value={bag.value} /><p textContent={yield t} /></div>'),
	],
	[
		'textContent after a host spread',
		returning('<div title={bag.title}><p {...bag} /><p textContent={yield t} /></div>'),
	],
	[
		'textContent after an expression child',
		returning('<div><p title={bag.title} />{true}<p textContent={yield t} /></div>'),
	],
	[
		'textContent on an element with children',
		returning('<div title={bag.title} textContent={yield t}>child</div>'),
	],
	["a textarea's value", returning('<textarea value={yield t} />')],
	[
		'an attribute value with an empty fragment in it',
		returning('<input title={[yield t, <></>]} />'),
	],
	[
		'the first of two attributes of a name',
		returning('<p title={[yield t, <b />]} title={bag.x} />'),
	],
	[
		'textContent after the first of two attributes of a name',
		returning('<div><p title={bag.x} title="s" /><p textContent={yield t} /></div>'),
	],
	// The compiler folds a value it can evaluate into a literal first.
	[
		'textContent beside a member of a literal',
		returning("<div title={{ x: 'a'.length }} textContent={yield t} />"),
	],
	[
		'textContent beside a folded call',
		returning('<div title={String(1)} textContent={yield t} />'),
	],
	[
		'textContent beside a folded short circuit',
		returning('<div title={true || bag.x} textContent={yield t} />'),
	],
	// A folded value takes a `yield` in a branch that never runs with it.
	['a folded value beside a spread', returning('<div {...bag} title={true || (yield t)} />')],
	['a folded child of a spread', returning('<div {...bag}>{true ? "x" : (yield t)}</div>')],
	['a folded value with an element in it', returning('<div title={true || [yield t, <b />]} />')],
	[
		'a folded array beside a spread',
		returning('<div {...bag} title={[1] + (true || (yield t))} />'),
	],
	[
		'a branch a module constant rules out',
		`const off = false;\n${returning('<div {...bag} title={off && (yield t)} />')}`,
	],
	[
		'a branch a module var rules out',
		`var off = false;\n${returning('<div {...bag} title={off && (yield t)} />')}`,
	],
	[
		'textContent beside a constant whose name is declared twice',
		`const on = true;\nfunction g(on: any) {\n\treturn on;\n}\n${returning('<div title={on || bag.x} textContent={yield t} />')}`,
	],
	[
		'a branch a local constant rules out',
		`export function* f(bag: any, t: any) {\n\tconst off = false;\n\treturn <div {...bag} title={off && (yield t)} />;\n}`,
	],
	// The SSR output writes a falsy textContent into the template as text.
	[
		'textContent after a false one',
		returning('<div><p textContent={false} /><p textContent={yield t} /></div>'),
	],
	[
		'textContent after an undefined one',
		returning('<div><p textContent={undefined} /><p textContent={yield t} /></div>'),
	],
	// A name declared elsewhere in the module doesn't shadow one here.
	[
		'a global call whose name is a parameter elsewhere',
		`function g(String: any) {\n\treturn String;\n}\n${returning('<div title={String(1)} textContent={yield t} />')}`,
	],
	[
		'a global call whose name a namespace body declares',
		`namespace N {\n\tconst String = (x: any) => x;\n}\n${returning('<div title={String(1)} textContent={yield t} />')}`,
	],
	[
		'a global call whose name is only declared',
		`declare const String: any;\n${returning('<div title={String(1)} textContent={yield t} />')}`,
	],
	[
		"a global call in a parameter's default, beside the body's var of that name",
		`function outer(\n\tg = function* (bag: any, t: any) {\n\t\treturn <div title={String(1)} textContent={yield t} />;\n\t},\n) {\n\tvar String = (x: any) => x;\n\treturn g;\n}`,
	],
	[
		'a constant whose name a loop elsewhere reassigns',
		`function g() {\n\tfor (let i = 0; i < 1; i++) {}\n}\nconst i = 2;\n${returning('<div title={String(i)} textContent={yield t} />')}`,
	],
];

/**
 * @param {string} code
 * @param {{ generate: 'dom' | 'ssr', hydratable: boolean }} [options]
 * @returns {Promise<boolean>}
 */
async function builds(code, options = { generate: 'dom', hydratable: false }) {
	const compiled = await transformAsync(code, {
		filename: 'probe.tsx',
		presets: [[solid_preset, options]],
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

describe('in a server build, TSRX2034 matches what babel-preset-solid compiles for it or its client (#1291)', () => {
	it.each([...PROBES, ...SERVER_PROBES])('%s', async (_label, source) => {
		const { code, errors } = compile(source, 'Probe.tsrx', { collect: true, ssr: true });
		const reported = errors.some((error) => error.code === 'TSRX2034');
		// Every `yield` a client build reports is reported here too.
		const client = compile(source, 'Probe.tsrx', { collect: true }).errors;
		expect(errors.map((error) => error.pos)).toEqual(
			expect.arrayContaining(client.map((error) => error.pos)),
		);
		expect(errors.filter((error) => error.code !== 'TSRX2034')).toEqual([]);
		// vite-plugin-solid's `ssr` option compiles both builds as hydratable.
		const fails =
			!(await builds(code, { generate: 'ssr', hydratable: true })) ||
			!(await builds(code, { generate: 'dom', hydratable: true }));
		expect({ reported, fails }).toEqual({ reported, fails: reported });
	});
});
