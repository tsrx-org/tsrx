import { TS_ERRORS } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import {
	runSharedClassFunctionComponentTests,
	runSharedCodeBlockChildrenTests,
	runSharedCompileDiagnosticsTests,
	runSharedCompileTests,
	runSharedComponentParamsTests,
	runSharedHookBodyTests,
	runSharedTsxExpressionTsrxTests,
} from '@tsrx/core/test-harness/compile';
import { runSharedSourceMappingTests } from '@tsrx/core/test-harness/source-mappings';
import { compile, compile_to_volar_mappings } from '../src/index.js';

runSharedSourceMappingTests({
	compile,
	compile_to_volar_mappings,
	name: 'vue',
	rejectsComponentAwait: true,
});

describe('@tsrx/vue direct runtime imports', () => {
	it('emits target runtime package imports for error boundaries and refs', () => {
		const { code } = compile(
			`function Child(props) @{
				<input {...props} />
			}

			function App() @{
				@try {
					<Child />
				} @catch (error) {
					<p>{error.message}</p>
				}
			}`,
			'App.tsrx',
			{ runtimeImports: 'direct' },
		);

		expect(code).toContain("from '@tsrx/vue-runtime/error-boundary'");
		expect(code).toContain("from '@tsrx/vue-runtime/ref'");
		expect(code).not.toMatch(/from '@tsrx\/vue\//);
	});
});
runSharedTsxExpressionTsrxTests({ compile, name: 'vue', classAttrName: 'class' });
runSharedCompileTests({ compile, name: 'vue', classAttrName: 'class' });
runSharedCompileDiagnosticsTests({ compile_to_volar_mappings, name: 'vue' });
runSharedCodeBlockChildrenTests({ compile, name: 'vue' });
runSharedClassFunctionComponentTests({ compile, compile_to_volar_mappings, name: 'vue' });
runSharedComponentParamsTests({ compile, compile_to_volar_mappings, name: 'vue' });
runSharedHookBodyTests({ compile, compile_to_volar_mappings, name: 'vue' });

describe('@tsrx/vue basic', () => {
	it('merges defineVaporComponent into existing vue imports', () => {
		const { code } = compile(
			`import { ref } from 'vue';

			function App() @{
				const count = ref(0);
				<button>{count.value}</button>
			}`,
			'App.tsrx',
		);

		expect(code).toContain("import { ref } from 'vue';");
		expect(code).toContain("import { defineVaporComponent } from 'vue-jsx-vapor';");
		expect(code.match(/defineVaporComponent/g)).toHaveLength(2);
	});

	it('wraps arrow components that contain nested functions', () => {
		const { code } = compile(
			`const Handler = ({ label, onPick }) => <button onClick={() => onPick(label)}>{label}</button>;
			const List = ({ items }) => {
				return <ul>{items.map((item) => <li>{item}</li>)}</ul>;
			};
			const parts = { Item: ({ label }) => <b onClick={() => label}>{label}</b> };`,
			'App.tsrx',
		);

		expect(code).toContain('const Handler = defineVaporComponent(({ label, onPick }) =>');
		expect(code).toContain('const List = defineVaporComponent(({ items }) =>');
		expect(code).toContain('Item: defineVaporComponent(({ label }) =>');
	});

	it('wraps a default-exported component that contains a nested function', () => {
		const { code } = compile(
			`export default function App() @{
				const pick = () => 1;
				<button onClick={pick}>x</button>
			}`,
			'App.tsrx',
		);

		// The declaration also binds `App` in the module, so keep that binding.
		expect(code).toContain('const App = defineVaporComponent(function App()');
		expect(code).toContain('export default App;');
		expect(code).not.toContain('export default const');
	});

	it('wraps components that return JSX through a local variable', () => {
		const { code } = compile(
			`function Card({ title }: { title: string }) {
				const element = <div class="card" title={title} />;
				return element;
			}

			function Badge({ on }: { on: boolean }) {
				let element;
				if (on) element = <b />;
				else element = <i />;
				return element;
			}

			function Factory() {
				const value = { a: 1 };
				return value;
			}`,
			'App.tsrx',
		);

		expect(code).toContain('const Card = defineVaporComponent(function Card(');
		expect(code).toContain('const Badge = defineVaporComponent(function Badge(');
		expect(code).toContain('function Factory() {');
		expect(code).not.toContain('defineVaporComponent(function Factory');
	});

	it('wraps a returned local binding that holds JSX anywhere, like a returned expression', () => {
		const { code } = compile(
			`function Columns() {
				return [{ header: <b>Name</b> }];
			}

			function Config() {
				const config = { icon: <i />, label: 'x' };
				return config;
			}`,
			'App.tsrx',
		);

		// The direct return was already wrapped; the local binding follows the same rule.
		expect(code).toContain('const Columns = defineVaporComponent(function Columns(');
		expect(code).toContain('const Config = defineVaporComponent(function Config(');
	});

	it('moves a wrapped component above the first statement that reads it', () => {
		const { code } = compile(
			`export { Inner };
			type InnerType = typeof Inner;

			export function App() @{
				<Inner label="app" />
			}

			export const registry = { inner: Inner };
			const LABEL = 'label';

			export function Inner({ label = 'fixed' }: { label?: string }) @{
				<span>{label}{LABEL}</span>
			}

			function make() {
				return <Nested />;
				function Nested() {
					return <i />;
				}
			}`,
			'App.tsrx',
		);

		const inner = code.indexOf('export const Inner = defineVaporComponent');
		expect(inner).toBeGreaterThan(-1);
		expect(inner).toBeLessThan(code.indexOf('export const registry'));
		// Reads that run later (exports, types, function bodies) keep the source order.
		expect(code.indexOf('export { Inner }')).toBeLessThan(inner);
		expect(code.indexOf('type InnerType')).toBeLessThan(inner);
		expect(code.indexOf('export const App')).toBeLessThan(inner);
		expect(code.indexOf('const Nested = defineVaporComponent')).toBeLessThan(
			code.indexOf('return <Nested />'),
		);
	});

	it('does not move a component for reads that do not run while the module loads', () => {
		const { code } = compile(
			`class Holder {
				comp = Inner;
				method() {
					return Inner;
				}
			}
			const DEBUG = false;
			if (DEBUG) console.log(Inner);
			const ready = DEBUG && Inner;
			{
				const Inner = 'shadow';
				console.log(Inner);
			}
			try {
				run();
			} catch (Inner) {
				console.log(Inner);
			}
			const PREFIX = 'p';
			export function Inner({ label = PREFIX }: { label?: string }) @{
				<span>{label}</span>
			}`,
			'App.tsrx',
		);

		expect(code.indexOf('export const Inner = defineVaporComponent')).toBeGreaterThan(
			code.indexOf("const PREFIX = 'p'"),
		);
	});

	it('counts a read in a branch whose condition a nested scope redeclares', () => {
		const { code } = compile(
			`const DEBUG = false;
			{
				const DEBUG = true;
				if (DEBUG) console.log(Inner);
			}
			export function Inner() @{
				<i />
			}`,
			'App.tsrx',
		);

		expect(code.indexOf('export const Inner = defineVaporComponent')).toBeLessThan(
			code.indexOf('const DEBUG = true'),
		);
	});

	it('moves a component past a read in a static class field or a reachable branch', () => {
		const { code } = compile(
			`class Holder {
				static comp = Inner;
			}
			if (window.debug) console.log(Inner);
			export function Inner({ label = 'x' }: { label?: string }) @{
				<span>{label}</span>
			}`,
			'App.tsrx',
		);

		expect(code.indexOf('export const Inner = defineVaporComponent')).toBeLessThan(
			code.indexOf('class Holder'),
		);
	});

	it('reports a read above a component whose prop default reads a binding it would move past', () => {
		for (const [source, read_line] of [
			[
				`export const registry = { inner: Inner };
const PREFIX = 'p';
export function Inner({ label = PREFIX }: { label?: string }) @{
	<span>{label}</span>
}`,
				1,
			],
			[
				`class Holder {
	static comp = Inner;
}
var PREFIX = 'p';
export function Inner({ label = PREFIX }: { label?: string }) @{
	<span>{label}</span>
}`,
				2,
			],
			[
				`const registry = { card: Card };
const DEFAULT = 'x';
function Card({ title = DEFAULT }: { title?: string }) {
	const el = <div>{title}</div>;
	return el;
}`,
				1,
			],
			// Assigned, updated or mutated in the statements it would move past.
			[
				`let size = 1;
const registry = { card: Card };
size = 2;
function Card({ s = size }: { s?: number }) {
	const el = <div>{s}</div>;
	return el;
}`,
				2,
			],
			[
				`let size = 1;
const registry = { card: Card };
size++;
export function Card({ s = size }: { s?: number }) @{
	<div>{s}</div>
}`,
				2,
			],
			[
				`const cfg = { size: 1 };
const registry = { card: Card };
cfg.size = 2;
export function Card({ s = cfg }: { s?: { size: number } }) @{
	<div>{s.size}</div>
}`,
				2,
			],
		]) {
			/** @type {any} */
			let thrown = null;
			try {
				compile(source, 'App.tsrx');
			} catch (error) {
				thrown = error;
			}
			const name = source.includes('Card') ? 'Card' : 'Inner';
			expect(thrown, source).toBeInstanceOf(Error);
			expect(thrown.code).toBe('TSRX2028');
			expect(thrown.message).toContain(`'${name}' is read here before its declaration.`);
			expect(thrown.message).toContain(`Move the declaration of '${name}' above this read.`);
			expect(thrown.loc.start.line).toBe(read_line);
		}

		const { errors } = compile_to_volar_mappings(
			`export const registry = { inner: Inner };
const PREFIX = 'p';
export function Inner({ label = PREFIX }: { label?: string }) @{
	<span>{label}</span>
}`,
			'App.tsrx',
		);
		expect(errors.map((error) => error.code)).toEqual(['TSRX2028']);
	});

	it('accepts the destructured prop defaults vue-jsx-vapor keeps', () => {
		for (const fallback of [
			"'x'",
			'1',
			'true',
			'null',
			'undefined',
			'SIZE',
			'[]',
			'{ a: 1 }',
			'() => 1',
			'function () { return 1; }',
			'(2 as number)',
			'SIZE!',
		]) {
			const source = `const SIZE = 2;
export function Card({ s = ${fallback} }: { s?: unknown }) @{
	<div>{String(s)}</div>
}`;
			expect(() => compile(source, 'App.tsrx'), fallback).not.toThrow();
		}
	});

	it('reports a destructured prop default vue-jsx-vapor drops', () => {
		for (const fallback of [
			'cfg.size',
			'Math.max(3, 4)',
			'`t`',
			'-1',
			'SIZE + 1',
			'/x/',
			'10n',
			'SIZE ? 1 : 2',
			'(SIZE satisfies number)',
		]) {
			for (const source of [
				`const cfg = { size: 1 };
const SIZE = 2;
export function Card({ s = ${fallback} }: { s?: unknown }) @{
	<div>{String(s)}</div>
}`,
				// A component main left unwrapped, newly wrapped here.
				`const cfg = { size: 1 };
const SIZE = 2;
function Card({ s = ${fallback} }: { s?: unknown }) {
	const el = <div>{String(s)}</div>;
	return el;
}`,
			]) {
				/** @type {any} */
				let thrown = null;
				try {
					compile(source, 'App.tsrx');
				} catch (error) {
					thrown = error;
				}
				expect(thrown, `${fallback}\n${source}`).toBeInstanceOf(Error);
				expect(thrown.code).toBe('TSRX2029');
				expect(thrown.message).toContain("Vue TSRX cannot keep this default for 's'");
				expect(thrown.message).toContain('read the prop where you use it instead');
				expect(thrown.loc.start.line).toBe(3);
			}
		}

		const { errors } = compile_to_volar_mappings(
			`const cfg = { size: 1 };
export function Card({ s = cfg.size }: { s?: number }) @{
	<div>{s}</div>
}`,
			'App.tsrx',
		);
		expect(errors.map((error) => error.code)).toEqual(['TSRX2029']);
		expect(errors[0].message).toContain(
			'for example `{props.s === undefined ? cfg.size : props.s}`, or derive it in a `computed`.',
		);

		const renamed = compile_to_volar_mappings(
			`const cfg = { size: 1 };
export function Card({ s: size = cfg.size }: { s?: number }) @{
	<div>{size}</div>
}`,
			'App.tsrx',
		);
		expect(renamed.errors[0].message).toContain(
			'for example `{props.s === undefined ? cfg.size : props.s}`',
		);
	});

	it('reports a destructured prop key vue-jsx-vapor reads as another prop or leaves out', () => {
		for (const [params, key, message, example] of [
			// vue-jsx-vapor reads a computed name as the prop with that name.
			[
				'{ [k]: v = cfg.size }',
				'k',
				"reads `[k]` as the prop 'k'",
				'{props[k] === undefined ? cfg.size : props[k]}',
			],
			[
				'{ [k]: v = 3 }',
				'k',
				"reads `[k]` as the prop 'k'",
				'{props[k] === undefined ? 3 : props[k]}',
			],
			['{ [k]: v }', 'k', "reads `[k]` as the prop 'k'", '{props[k]}'],
			['{ t, [k]: v }', 'k', "reads `[k]` as the prop 'k'", '{props[k]}'],
			['{ [k]: { a: v } }', 'k', "reads `[k]` as the prop 'k'", null],
			['{ t: { [k]: v } }', 'k', "reads `[k]` as the prop 'k'", '{props.t?.[k]}'],
			['{ t: [{ [k]: v }] }', 'k', "reads `[k]` as the prop 'k'", '{props.t?.[0]?.[k]}'],
			// It leaves out any other key. With no key it reads, the component gets no
			// prop options, so Vue passes it no props.
			["{ ['s']: v = 3 }", "'s'", "the prop at `['s']`", '{props.s === undefined ? 3 : props.s}'],
			["{ ['s']: v, t }", "'s'", "the prop at `['s']`", '{props.s}'],
			["{ 's': v }", "'s'", "the prop at `'s'`", '{props.s}'],
			[
				"{ 'a-b': v = 1, t }",
				"'a-b'",
				"the prop at `'a-b'`",
				'{props.aB === undefined ? 1 : props.aB}',
			],
			['{ [1]: v }', '1', 'the prop at `[1]`', '{props[1]}'],
			['{ [`s`]: v, ...rest }', '`s`', 'the prop at `[`s`]`', '{props.s}'],
			['{ [obj.k]: v }', 'obj.k', 'the prop at `[obj.k]`', '{props[obj.k]}'],
			["{ [k + '']: v }", "k + ''", "the prop at `[k + '']`", "{props[k + '']}"],
			["{ t: { 's': v } }", "'s'", "the prop at `'s'`", '{props.t?.s}'],
			["{ t: { 'a-b': v } }", "'a-b'", "the prop at `'a-b'`", '{props.t?.["a-b"]}'],
		]) {
			const source = `const cfg = { size: 1 };
const k = 's';
const obj = { k: 's' };
export function Card(${params}: any) @{
	<div>{String(v)}</div>
}`;
			/** @type {any} */
			let thrown = null;
			try {
				compile(source, 'App.tsrx');
			} catch (error) {
				thrown = error;
			}
			expect(thrown, params).toBeInstanceOf(Error);
			expect(thrown.code, params).toBe('TSRX2031');
			expect(thrown.message, params).toContain(message);
			expect(thrown.message, params).toContain('read the prop where you use it instead');
			if (example) expect(thrown.message, params).toContain(`for example \`${example}\``);
			else expect(thrown.message, params).not.toContain('for example');
			expect(thrown.loc.start, params).toEqual({
				line: 4,
				column: 'export function Card('.length + params.indexOf(key),
			});

			const { errors } = compile_to_volar_mappings(source, 'App.tsrx');
			expect(
				errors.map((error) => error.code),
				params,
			).toEqual(['TSRX2031']);
		}

		// A key that spans lines is shown on one line.
		const { errors } = compile_to_volar_mappings(
			`const k = 's';
export function Card({ t, [k +
	'']: v }: any) @{
	<div>{String(v)}</div>
}`,
			'App.tsrx',
		);
		expect(errors.map((error) => error.message)).toEqual([
			expect.stringContaining("the prop at `[k + '']`"),
		]);
	});

	it('reports a default inside a destructured prop, which vue-jsx-vapor applies only to a missing prop', () => {
		for (const [params, fallback, path, example] of [
			[
				'{ s: { a: v = cfg.size } }',
				'cfg.size',
				's.a',
				'{props.s?.a === undefined ? cfg.size : props.s?.a}',
			],
			['{ s: { a: v = 3 } }', '3', 's.a', '{props.s?.a === undefined ? 3 : props.s?.a}'],
			['{ s: [v = 1] }', '1', 's[0]', '{props.s?.[0] === undefined ? 1 : props.s?.[0]}'],
			['{ s: { t: { a } = {} } }', '{}', 's.t', null],
		]) {
			const source = `const cfg = { size: 1 };
export function Card(${params}: any) @{
	<div>{String(v)}</div>
}`;
			const { errors } = compile_to_volar_mappings(source, 'App.tsrx');
			expect(
				errors.map((error) => error.code),
				params,
			).toEqual(['TSRX2029']);
			expect(errors[0].message, params).toContain(
				`cannot keep this default for '${path}': vue-jsx-vapor applies a default inside a destructured prop only when the whole prop is missing`,
			);
			if (example) expect(errors[0].message, params).toContain(`for example \`${example}\``);
			else expect(errors[0].message, params).not.toContain('for example');
			expect(errors[0].loc.start, params).toEqual({
				line: 2,
				column: 'export function Card('.length + params.indexOf(fallback),
			});
		}
	});

	it('reports a props parameter with a default, which vue-jsx-vapor skips', () => {
		for (const [param, fallback] of [
			['{ s: v }: { s?: number } = {}', '{}'],
			['props: { s?: number } = { s: 1 }', '{ s: 1 }'],
		]) {
			const { errors } = compile_to_volar_mappings(
				`export function Card(${param}) @{
	<div>{String(v)}</div>
}`,
				'App.tsrx',
			);
			expect(
				errors.map((error) => error.code),
				param,
			).toEqual(['TSRX2031']);
			expect(errors[0].message, param).toContain(
				`cannot read a props parameter with a default: vue-jsx-vapor skips it, so this component gets no props. Remove \`= ${fallback}\`; Vue always passes a props object.`,
			);
			expect(errors[0].loc.start, param).toEqual({
				line: 1,
				column: 'export function Card('.length + param.lastIndexOf(fallback),
			});
		}
	});

	it("reports a rest element inside a prop that vue-jsx-vapor doesn't give the rest of it", () => {
		for (const [params, rests, path] of [
			// The last rest element of the pattern gets the component's attrs.
			['{ t: { a, ...r } }', ['...r'], 't'],
			['{ t: [a, ...r] }', ['...r'], 't'],
			// An array's rest element gets the whole array.
			['{ t: [a, ...r], ...rest }', ['...r'], 't'],
			// Any other gets the rest as it was at setup.
			['{ t: { a, ...r }, ...rest }', ['...r'], 't'],
			['{ t: [{ a, ...r }], ...rest }', ['...r'], 't[0]'],
			['{ t: { a, ...r }, u: { b, ...q } }', ['...r', '...q'], null],
		]) {
			const { errors } = compile_to_volar_mappings(
				`export function Card(${params}: any) @{
	<div>{String(a)}</div>
}`,
				'App.tsrx',
			);
			expect(
				errors.map((error) => error.code),
				params,
			).toEqual(rests.map(() => 'TSRX2031'));
			if (path) {
				expect(errors[0].message, params).toContain(
					`cannot read this rest element inside '${path}': vue-jsx-vapor doesn't keep it as the rest of '${path}'.`,
				);
			}
			expect(
				errors.map((error) => error.loc.start),
				params,
			).toEqual(
				rests.map((rest) => ({
					line: 1,
					column: 'export function Card('.length + params.indexOf(rest),
				})),
			);
		}
	});

	it('accepts destructured props vue-jsx-vapor reads as written', () => {
		for (const params of [
			'{ s: v, t = 1 }',
			'{ s: [v, w] }',
			'{ s: { a: v } }',
			// A prop's own default, which vue-jsx-vapor keeps for an object literal.
			'{ s: { a: v } = {} }',
			// The pattern's own rest element gets the attrs, which are the props it
			// doesn't declare.
			'{ s: v, ...rest }',
			'{ ...rest }',
		]) {
			const source = `export function Card(${params}: any) @{
	<div>{String(v)}</div>
}`;
			expect(() => compile(source, 'App.tsrx'), params).not.toThrow();
		}
	});

	it('rejects the removed `&{ ... }` lazy destructuring syntax', () => {
		expect(() =>
			compile(
				`function Child(&{ count }: { count: number }) @{
					<pre>{count}</pre>
				}`,
				'App.tsrx',
			),
		).toThrow();
	});

	it('keeps return-value branches in component callback props as plain conditionals', () => {
		const { code } = compile(
			`function Test() @{
				<Page
					params={{
						menuAlt: (isAdmin) => {
							if (isAdmin) {
								return ['Delete', 'Edit'];
							}
						},
						direct: () => {
							return ['View'];
						},
						bySwitch: (role) => {
							switch (role) {
								case 'admin':
									return ['Edit'];
								default:
									return ['View'];
							}
						},
						byForOf: (items) => {
							for (const item of items) {
								if (item.active) {
									return [item.label];
								}
							}

							return ['Empty'];
						},
						byTry: (load) => {
							try {
								return [load()];
							} catch (error) {
								return ['Error'];
							}
						},
					}}
				/>
			}`,
			'App.tsrx',
		);

		expect(code).toContain('menuAlt: (isAdmin) => {');
		expect(code).toContain('if (isAdmin)');
		expect(code).toContain("return ['Delete', 'Edit'];");
		expect(code).toContain('direct: () => {');
		expect(code).toContain("return ['View'];");
		expect(code).toContain('bySwitch: (role) => {');
		expect(code).toContain('switch (role)');
		expect(code).toContain('byForOf: (items) => {');
		expect(code).toContain('for (const item of items)');
		expect(code).toContain("return ['Empty'];");
		expect(code).toContain('byTry: (load) => {');
		expect(code).toContain("return ['Error'];");
	});

	it('keeps expression child arrays in fragment and JSX callback props', () => {
		const { code } = compile(
			`function Child(props) @{
					<section />
				}

			function App() @{
					<Child
							fragment={() => <>{[<>Delete</>, <>Edit</>]}</>}
							native={() => <>{[<>Delete</>, <>Edit</>]}</>}
				/>
			}`,
			'App.tsrx',
		);

		expect(code).toMatch(/fragment={\(\) => {\s+return <>{\[<>Delete<\/>, <>Edit<\/>\]}<\/>;/);
		expect(code).toMatch(/native={\(\) => {\s+return <>{\[<>Delete<\/>, <>Edit<\/>\]}<\/>;/);
	});

	it('emits scoped CSS and applies the scope hash to host elements', () => {
		const { code, css, cssHash } = compile(
			`function App() @{
				<>
					<div class="card">{'Hi'}</div>

					<style>
						.card {
							color: red;
						}
					</style>
				</>
			}`,
			'App.tsrx',
		);

		expect(css).not.toBe('');
		expect(code).toContain(`class="card ${cssHash}"`);
		expect(css).toContain(`.card.${cssHash}`);
		expect(css).toContain('color: red;');
	});

	it('applies scoped css hashes and keeps type selectors for dynamic tags', () => {
		const { code, css, cssHash } = compile(
			`export function App() @{
				const Tag = 'section';
				<>
					<{Tag} class="host">{'hello'}</{Tag}>

					<style>
						div {
							color: red;
						}
						.host {
							color: blue;
						}
					</style>
				</>
			}`,
			'App.tsrx',
		);

		// The tag resolves at runtime, so it could be any element: type
		// selectors must survive pruning and the element's class gets the hash.
		expect(code).toContain(`class="host ${cssHash}"`);
		expect(css).toContain(`div.${cssHash}`);
		expect(css).toContain(`.host.${cssHash}`);
	});

	it('lowers dynamic tag syntax to a scoped component alias', () => {
		const { code } = compile(
			`function App() @{
				const Tag = 'section';
				<{Tag} class="host">{'hello'}</{Tag}>
			}`,
			'App.tsrx',
		);

		expect(code).toContain('const TsrxDynamic_1 = Tag;');
		expect(code).toContain(`<TsrxDynamic_1 class="host">{'hello'}</TsrxDynamic_1>`);
		expect(code).not.toContain('@tsrx/vue/dynamic');
	});

	it('declares dynamic tag aliases inside the owning control-flow scope', () => {
		const { code } = compile(
			`function App({ items }) @{
				@for (const item of items) {
					<{item.tag} class="row">{item.label}</{item.tag}>
				}
			}`,
			'App.tsrx',
		);

		const callback_start = code.indexOf('(item) =>');
		const declaration = code.indexOf('const TsrxDynamic_1 = item.tag;');
		expect(callback_start).toBeGreaterThan(-1);
		expect(declaration).toBeGreaterThan(callback_start);
	});

	it('keeps the Dynamic component shape in type-only output for dynamic tags', () => {
		const { code } = compile_to_volar_mappings(
			`function App() @{
				const Tag = 'section';
				<{Tag} class="host">{'hello'}</{Tag}>
			}`,
			'App.tsrx',
			{ loose: true },
		);

		expect(code).toContain(`import { Dynamic as TsrxDynamic } from '@tsrx/vue/dynamic';`);
		expect(code).toContain(`<TsrxDynamic is={Tag} class="host"`);
	});

	it('lowers reference-free dynamic tags in type-only output instead of hoisting them raw', () => {
		const { code } = compile_to_volar_mappings(
			`function Test() @{
				<{'div'} class="hello">{'Content'}</{'div'}>
			}`,
			'App.tsrx',
			{ loose: true },
		);

		expect(code).toContain(`<TsrxDynamic is={'div'} class="hello"`);
		expect(code).not.toContain('<{');
	});

	it('ref={fn} on a DOM element compiles to ref={fn}', () => {
		const { code } = compile(
			`function App() @{
				function capture(node: HTMLDivElement) {}
				<div ref={capture}>{'x'}</div>
			}`,
			'App.tsrx',
		);

		expect(code).toMatch(/ref=\{capture\}/);
	});

	it('keeps Vue host ref expressions clean in Volar TSX while disabling prop verification', () => {
		const source = `function App() @{
			<div ref={(node: HTMLDivElement) => {}}>{'x'}</div>
		}`;
		const result = compile_to_volar_mappings(source, 'App.tsrx');
		const generated_ref_offset = result.code.indexOf('ref=');
		const ref_mapping = result.mappings.find(
			(mapping) =>
				mapping.generatedOffsets[0] === generated_ref_offset &&
				mapping.generatedLengths[0] === 'ref'.length,
		);

		expect(result.code).toContain('ref={(node: HTMLDivElement) => {}}');
		expect(result.code).not.toContain('as any');
		expect(ref_mapping?.data.verification).toBe(false);
	});

	it('keeps named component ref props direct in Volar TSX for completions', () => {
		const source = `import { ref } from 'vue';

		function NamedForwardInput(props: { type: string; input_ref?: any }) @{
			<input type={props.type} ref={props.input_ref} />
		}

		const named_vue_ref_object = ref<HTMLInputElement | null>(null);

		function App() @{
			<NamedForwardInput type="text" input_ref={named_vue_ref_object} />
		}`;
		const result = compile_to_volar_mappings(source, 'App.tsrx');
		const source_prop_offset = source.indexOf('input_ref={named_vue_ref_object');
		const generated_prop_offset = result.code.indexOf('input_ref={named_vue_ref_object');
		const prop_mapping = result.mappings.find(
			(mapping) =>
				mapping.sourceOffsets[0] === source_prop_offset &&
				mapping.generatedOffsets[0] === generated_prop_offset &&
				mapping.generatedLengths[0] === 'input_ref'.length,
		);

		expect(result.code).toContain(
			'<NamedForwardInput type="text" input_ref={named_vue_ref_object} />',
		);
		expect(result.code).not.toContain('create_ref_prop');
		expect(prop_mapping?.data.completion).toBe(true);
		expect(prop_mapping?.data.verification).toBe(true);
	});

	it('maps Vue function components to the generated function in Volar TSX', () => {
		const source = `import { ref } from 'vue';

		function App() @{
			const count = ref(0);
			<button>{count.value}</button>
		}`;
		const result = compile_to_volar_mappings(source, 'App.tsrx');
		const source_function_offset = source.indexOf('function');
		const source_name_offset = source.indexOf('App');
		const generated_function_keyword_offset = result.code.indexOf('function App');
		const generated_function_name_offset = generated_function_keyword_offset + 'function '.length;
		const generated_define_offset = result.code.indexOf('defineVaporComponent(function App');
		const generated_outer_name_offset = result.code.indexOf('const App') + 'const '.length;
		const find_generated_mapping = (offset) =>
			result.mappings.find(
				(mapping) =>
					mapping.generatedOffsets[0] <= offset &&
					offset < mapping.generatedOffsets[0] + mapping.generatedLengths[0],
			);
		const name_mappings = result.mappings.filter(
			(mapping) =>
				mapping.sourceOffsets[0] === source_name_offset && mapping.lengths[0] === 'App'.length,
		);
		const function_keyword_mapping = result.mappings.find(
			(mapping) =>
				mapping.sourceOffsets[0] === source_function_offset &&
				mapping.lengths[0] === 'function'.length,
		);

		expect(name_mappings).toHaveLength(1);
		expect(name_mappings[0].generatedOffsets[0]).toBe(generated_function_name_offset);
		expect(function_keyword_mapping?.generatedOffsets[0]).toBe(generated_function_keyword_offset);
		expect(find_generated_mapping(generated_define_offset)).toBeUndefined();
		expect(find_generated_mapping(generated_outer_name_offset)).toBeUndefined();
	});

	it('allows ref={...} on composite components as normal Vue JSX', () => {
		const { code } = compile(
			`function Child(props) @{
					<input {...props} />
				}

				function App() @{
					function inputRef(node: HTMLInputElement | null) {}
					<Child ref={inputRef} />
				}`,
			'App.tsrx',
		);

		expect(code).toContain('ref={inputRef}');
	});

	it('preserves explicit mergeRefs calls', () => {
		const { code } = compile(
			`import { mergeRefs } from '@tsrx/vue/ref';

			function App() @{
				function a(node: HTMLInputElement | null) {}
				function b(node: HTMLInputElement | null) {}
				function c(node: HTMLInputElement | null) {}
				<input ref={mergeRefs(a, b, c)} />
			}`,
			'App.tsrx',
		);

		expect(code).toContain('ref={mergeRefs(a, b, c)}');
		expect(code).not.toContain('__mergeRefs');
	});

	it('allows named ref props through components and normalizes host spreads', () => {
		const { code } = compile(
			`function Child(props) @{
				<input {...props} />
			}

			function App() @{
				let input;
				<Child input_ref={input} />
			}`,
			'App.tsrx',
		);

		expect(code).toContain("from '@tsrx/vue/ref'");
		expect(code).toContain('{...{ input_ref: input }}');
		expect(code).toContain(
			'let Child__spread_props1 = __normalize_spread_props_for_ref_attr(props);',
		);
		expect(code).toContain('{...Child__spread_props1}');
		expect(code).toContain('ref={Child__spread_props1?.ref}');
		expect(code.match(/__normalize_spread_props_for_ref_attr\(/g)).toHaveLength(1);
	});

	it('keeps component ref-like props ordinary without host spreads', () => {
		const { code } = compile(
			`function Child(props) @{
				<span>{'child'}</span>
			}

			function App() @{
				let input;
				<Child input_ref={input} />
			}`,
			'App.tsrx',
		);

		expect(code).not.toContain("from '@tsrx/vue/ref'");
		expect(code).toContain('{...{ input_ref: input }}');
		expect(code).not.toContain('normalize_spread_props');
	});

	it('normalizes multiple host spreads once while merging one explicit ref', () => {
		const { code } = compile(
			`function App() @{
			const first = {};
			const second = {};
			function cb(_node) {}
			<input {...first} {...second} ref={cb} />
		}`,
			'App.tsrx',
		);

		expect(code).toContain(
			'let App__spread_props1 = __normalize_spread_props_for_ref_attr(first);',
		);
		expect(code).toContain(
			'let App__spread_props2 = __normalize_spread_props_for_ref_attr(second);',
		);
		expect(code).toContain('{...App__spread_props1}');
		expect(code).toContain('{...App__spread_props2}');
		expect(code).toContain(
			'ref={__mergeRefs(App__spread_props1?.ref, App__spread_props2?.ref, cb)}',
		);
		expect(code.match(/__normalize_spread_props_for_ref_attr\(/g)).toHaveLength(2);
		expect(code).not.toContain('create_ref_prop');
		expect(code).not.toContain('__normalize_spread_props(first, cb)');
		expect(code).not.toContain('__normalize_spread_props(second, cb)');
	});

	it('rejects multiple ref={...} attributes on the same element', () => {
		expect(() =>
			compile(
				`function App() @{
					function a(node: HTMLInputElement | null) {}
					function b(node: HTMLInputElement | null) {}
					<input ref={a} ref={b} />
				}`,
				'App.tsrx',
			),
		).toThrow(/multiple `ref=\{\.\.\.\}` attributes/);
	});

	it('rejects multiple ref={...} on the same composite component', () => {
		expect(() =>
			compile(
				`function Child(props) @{
					<input {...props} />
				}

				function App() @{
					function a(node: HTMLInputElement | null) {}
					function b(node: HTMLInputElement | null) {}
					<Child ref={a} ref={b} />
				}`,
				'App.tsrx',
			),
		).toThrow(/multiple `ref=\{\.\.\.\}` attributes/);
	});

	it('preserves host innerHTML props', () => {
		const { code } = compile(
			`function App() @{
				const markup = '<strong>safe enough</strong>';
				<div class="target" innerHTML={markup} />
			}`,
			'App.tsrx',
		);

		expect(code).toContain('innerHTML={markup}');
	});

	it('rejects removed {html expr} syntax', () => {
		expect(() =>
			compile(
				`function App() @{
					const markup = '<strong>safe enough</strong>';
					<div>{html markup}</div>
				}`,
				'App.tsrx',
			),
		).toThrow();
	});

	it('compiles a simple if block in component bodies', () => {
		const { code } = compile(
			`function App({ visible }) @{
				@if (visible) {
					<div>{'Visible'}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain("const App__static1 = <div>{'Visible'}</div>;");
		expect(code).toContain('return visible ? App__static1 : null;');
		expect(code).not.toContain('not yet supported in Vue TSRX');
	});

	it('compiles if/else chains in component bodies', () => {
		const { code } = compile(
			`function App({ visible }) @{
				@if (visible) {
					<div>{'Visible'}</div>
				} @else {
					<div>{'Hidden'}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain("<div>{'Visible'}</div>");
		expect(code).toContain("<div>{'Hidden'}</div>");
		expect(code).toMatch(/return visible \? App__static\d+ : App__static\d+;/);
	});

	it('rejects return statements inside template @if branches', () => {
		expect(() =>
			compile(
				`function App() @{
					const count = 0;

					<>
						@if (count > 2) {
							return;
						}

						<button>{count}</button>
					</>
				}`,
				'App.tsrx',
			),
		).toThrow(/Return statements are not allowed inside TSRX template @if blocks/);
	});

	it('allows component-body guard returns before TSRX output', () => {
		const { code } = compile(
			`import { ref } from 'vue';

			function App() {
				const skip = ref(false);
				if (skip.value) {
					return null;
				}

				const count = ref(0);
				return <button>{count.value}</button>;
			}`,
			'App.tsrx',
		);

		expect(code).toContain('if (skip.value) {');
		expect(code).toContain('return null;');
		expect(code).toContain('const count = ref(0);');
		expect(code).toContain('<button>{count.value}</button>');
	});

	it('compiles for...of statements in component bodies', () => {
		const { code } = compile(
			`function App({ items }) @{
				@for (const item of items) {
					<div>{item}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('<VaporFor in={items}>{(item) => <div>{item}</div>}</VaporFor>');
		expect(code).toContain("import { defineVaporComponent, VaporFor } from 'vue-jsx-vapor';");
		expect(code).not.toContain('not yet supported in Vue TSRX');
	});

	it('compiles keyed for...of statements in component bodies', () => {
		const { code } = compile(
			`function App({ items }: { items: { id: string, text: string }[] }) @{
				@for (const item of items; key item.id) {
					<div>{item.text}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('<VaporFor in={items} getKey={(item) => item.id}>');
		expect(code).toContain('item.value.text');
	});

	it('does not rewrite shadowed loop params inside nested keyed slot functions', () => {
		const { code } = compile(
			`function App({ items, getNew, use }: { items: { id: string, text: string }[], getNew: () => unknown, use: (item: unknown) => void }) @{
				@for (const item of items; key item.id) {
					<button onClick={() => {
						const item = getNew();
						use(item);
					}}>{item.text}</button>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('const item = getNew();');
		expect(code).toContain('use(item);');
		expect(code).toContain('item.value.text');
		expect(code).not.toContain('use(item.value)');
	});

	it('compiles indexed keyed for...of statements in component bodies', () => {
		const { code } = compile(
			`function App({ items }: { items: { id: string, text: string }[] }) @{
				@for (const item of items; index i; key item.id) {
					<div>{i}{item.text}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('<VaporFor in={items} getKey={(item, i) => item.id}>');
		expect(code).toContain('{(item, i) => <div>');
		expect(code).toContain('{i.value}');
		expect(code).toContain('item.value.text');
	});

	it('keeps explicit loop keys on single static for...of templates', () => {
		const { code } = compile(
			`function App({ items }: { items: string[] }) @{
				@for (const item of items; index i; key i) {
					<div>{'test'}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('<VaporFor in={items} getKey={(item, i) => i}>');
		expect(code).toContain("{(item, i) => <div>{'test'}</div>}");
		expect(code).toContain("<div>{'test'}</div>");
		expect(code).not.toContain('<div key={i}>');
		expect(code).not.toContain('<Fragment');
	});

	it('keeps implicit index keys on multi-child for...of templates', () => {
		const { code } = compile(
			`function App({ items }: { items: string[] }) @{
				@for (const item of items; index i) {
					<>
						<div>{'one'}</div>
						<div>{'two'}</div>
					</>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('<VaporFor in={items} getKey={(item, i) => i}>');
		expect(code).toContain('{(item, i) => <>');
		expect(code).toContain("<div>{'one'}</div>");
		expect(code).toContain("<div>{'two'}</div>");
		expect(code).not.toContain('<Fragment');
	});

	it('falls back without injecting VaporFor for keyed destructuring patterns it cannot rewrite', () => {
		const { code } = compile(
			`function App({ items, keyName }: { items: Array<Record<string, string>>, keyName: string }) @{
				@for (const { [keyName]: label } of items) {
					<div key={label}>{label}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('.map(({ [keyName]: label }) => {');
		expect(code).toContain('<div key={label}>{label}</div>');
		expect(code).not.toContain('VaporFor');
	});

	it('compiles switch statements in component bodies', () => {
		const { code } = compile(
			`function App({ value }) @{
				@switch (value) {
					@case 'a': {
						<div>{'A'}</div>
					}
					@default: {
						<div>{'Fallback'}</div>
					}
				}
				}`,
			'App.tsrx',
		);

		expect(code).toContain('switch (value) {');
		expect(code).toContain("<div>{'A'}</div>");
		expect(code).toContain("<div>{'Fallback'}</div>");
		expect(code).toContain("return <div>{'A'}</div>;");
		expect(code).toContain("return <div>{'Fallback'}</div>;");
		expect(code).not.toContain('not yet supported in Vue TSRX');
	});

	it('compiles switch statements with inline case statements before JSX', () => {
		const { code } = compile(
			`function App({ value }) @{
					@switch (value) {
						@case 'a': {
							const label = 'A';
							<div>{label}</div>
						}
						@default: {
							<div>{'Fallback'}</div>
						}
					}
				}`,
			'App.tsrx',
		);

		expect(code).toContain('switch (value) {');
		expect(code).toContain("const label = 'A';");
		expect(code).toContain('return <div>{label}</div>;');
	});

	it('compiles try/catch into a Vue error boundary wrapper', () => {
		const { code } = compile(
			`function ThrowingChild() @{
				<div>{'might throw'}</div>
			}

			function App() @{
				@try {
					<ThrowingChild />
				} @catch (error) {
					<div>{error.message}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('TsrxErrorBoundary');
		expect(code).toContain("from '@tsrx/vue/error-boundary'");
		expect(code).toContain('fallback={');
		expect(code).toContain('error.message');
		expect(code).not.toContain('not yet supported in Vue TSRX');
		expect(code).not.toContain('Suspense');
	});

	it('does not generate a catch fallback component without @pending', () => {
		const { code } = compile(
			`export function App() @{
				@try {
					<span>{'Loaded'}</span>
				} @catch (error) {
					<span>{'Failed'}</span>
				}
			}`,
			'App.tsrx',
		);

		expect(code).not.toContain('StatementBodyHook');
		expect(code.match(/<span>\{'Failed'\}<\/span>/g)).toHaveLength(1);
		expect(code).toContain('<TsrxErrorBoundary fallback={(error, _reset) =>');
	});

	it('compiles try/pending into a Vue Suspense slot boundary', () => {
		const { code } = compile(
			`function App() @{
				@try {
					<div>{'Async content'}</div>
				} @pending {
					<div>{'Loading...'}</div>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('Suspense');
		expect(code).toContain("from 'vue'");
		expect(code).toContain('v-slots=');
		expect(code).toContain('default: () =>');
		expect(code).toContain('fallback: () =>');
		expect(code).toContain("{'Loading...'}");
		expect(code).not.toContain('fallback={');
		expect(code).not.toContain('TsrxErrorBoundary');
	});

	it('compiles try/pending/catch into an error boundary around Suspense', () => {
		const { code } = compile(
			`function App() @{
				const suffix = '!';

				@try {
					<div>{'Async content'}</div>
				} @pending {
					<div>{'Loading...'}</div>
				} @catch (error, reset) {
					<button onClick={reset}>{error.message}{suffix}</button>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain('TsrxErrorBoundary');
		expect(code).toContain("from '@tsrx/vue/error-boundary'");
		expect(code).toContain('Suspense');
		expect(code).toContain("from 'vue'");
		expect(code).toContain('v-slots=');
		expect(code).toContain('content={() => <Suspense');
		expect(code).toContain('default: () =>');
		expect(code).toContain('content={() =>');
		expect(code).toContain('error.message');
		expect(code.match(/error\.message/g)).toHaveLength(1);
		expect(code).toContain('StatementBodyHook');
		expect(code).toContain('suffix={suffix}');

		const error_boundary_index = code.indexOf('<TsrxErrorBoundary');
		const suspense_index = code.indexOf('<Suspense');
		expect(error_boundary_index).toBeLessThan(suspense_index);
	});

	it('lowers a try/pending/catch catch body only into its fallback component', () => {
		const { code } = compile(
			`export function App() @{
				@try {
					<span>{'Loaded'}</span>
				} @pending {
					<span>{'Loading'}</span>
				} @catch (error) {
					<span>{'Failed'}</span>
				}
			}`,
			'App.tsrx',
		);

		expect(code.match(/<span>\{'Failed'\}<\/span>/g)).toHaveLength(1);
		expect(code).toMatch(
			/const App__StatementBodyHook1 = defineVaporComponent\(function App__StatementBodyHook1\(\) \{\n\treturn App__static\d+;/,
		);
		expect(code).toContain('fallback={(error, _reset) => {');
		expect(code.match(/return <App__StatementBodyHook1 \/>;/g)).toHaveLength(2);
	});

	it('keeps try/pending/catch Suspense lowering valid in type-only output', () => {
		const source = `import { defineVaporAsyncComponent } from 'vue';

			function AsyncResolvedChild(props: { value: string }) @{
				<p class="async-resolved">{props.value}</p>
			}

			function App(props: { promise: Promise<typeof AsyncResolvedChild> }) @{
				const suffix = '!';
				const AsyncChild = defineVaporAsyncComponent(() => props.promise);

				@try {
					<AsyncChild value="hello" />
				} @pending {
					<p class="async-pending">{'loading...'}</p>
				} @catch (err) {
					<p class="async-caught">{(err as Error).message}{suffix}</p>
				}
			}`;
		const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

		expect(errors).toHaveLength(0);
		expect(code).toContain('TsrxErrorBoundary');
		expect(code).toContain('Suspense');
		expect(code).toContain('fallback={(err, _reset) =>');
		expect(code).toContain('default: () => (() => {');
		expect(code).toContain('return <AsyncChild value="hello" />;');
		expect(code).not.toContain('catch(_error)');
		expect(code).not.toContain('return ((err, _reset) =>');
		expect(code).not.toContain('err: any');
		expect(code).not.toContain('suffix: typeof');
		expect(code).not.toContain('StatementBodyHook');
		expect(code).not.toContain('let App__StatementBodyHook1');
		expect(code).not.toContain('_tsrx_StatementBodyHook1_err = err');

		const catch_param_offset = source.indexOf('catch (err)') + 'catch ('.length;
		expect(
			mappings.some((mapping) => {
				const start = mapping.sourceOffsets[0];
				const end = start + mapping.lengths[0];
				return start <= catch_param_offset && catch_param_offset < end;
			}),
		).toBe(true);
	});

	it('rejects finally clauses in component @try templates', () => {
		expect(() =>
			compile(
				`function App() @{
					@try {
						<div>{'content'}</div>
					} @catch (error) {
						<div>{error.message}</div>
					} finally {
						log(error)
					}
				}`,
				'App.tsrx',
			),
		).toThrow(expect.objectContaining({ code: TS_ERRORS.UNEXPECTED_TOKEN.code }));
	});

	it('rejects await in component bodies', () => {
		expect(() =>
			compile(
				`async function App() @{
						const data = await fetchData();
						<div>{data}</div>
					}`,
				'App.tsrx',
			),
		).toThrow(/`await` is not yet supported in Vue TSRX components\./);
	});

	it('allows await in nested async functions inside component bodies', () => {
		expect(() =>
			compile(
				`function App() @{
					const load = async () => await fetchData();
					<button onClick={load}>{'Load'}</button>
				}`,
				'App.tsrx',
			),
		).not.toThrow();
	});
});
