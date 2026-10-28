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
import { compile as compileServer } from '../src/index.js';
import { compile_to_volar_mappings as compileServerToVolarMappings } from '../src/index.js';
import { compile as compileDom } from '../src/dom.js';
import { compile_to_volar_mappings as compileDomToVolarMappings } from '../src/dom.js';
import { hono_dom_validation_work } from '../src/platform.js';
import * as honoServerRuntime from '../src/index.js';
import * as honoDomRuntime from '../src/dom.js';

runSharedSourceMappingTests({
	compile: compileServer,
	compile_to_volar_mappings: compileServerToVolarMappings,
	name: 'hono',
	rejectsComponentAwait: false,
});
runSharedTsxExpressionTsrxTests({ compile: compileServer, name: 'hono', classAttrName: 'class' });
runSharedCompileTests({ compile: compileServer, name: 'hono', classAttrName: 'class' });
runSharedCompileDiagnosticsTests({
	compile_to_volar_mappings: compileServerToVolarMappings,
	name: 'hono',
});
runSharedCodeBlockChildrenTests({ compile: compileServer, name: 'hono' });
runSharedHookBodyTests({
	compile: compileServer,
	compile_to_volar_mappings: compileServerToVolarMappings,
	name: 'hono',
});

runSharedSourceMappingTests({
	compile: compileDom,
	compile_to_volar_mappings: compileDomToVolarMappings,
	name: 'hono-dom',
	rejectsComponentAwait: true,
});
runSharedTsxExpressionTsrxTests({ compile: compileDom, name: 'hono-dom', classAttrName: 'class' });
runSharedCompileDiagnosticsTests({
	compile_to_volar_mappings: compileDomToVolarMappings,
	name: 'hono-dom',
});
runSharedCodeBlockChildrenTests({ compile: compileDom, name: 'hono-dom' });
runSharedClassFunctionComponentTests({
	compile: compileDom,
	compile_to_volar_mappings: compileDomToVolarMappings,
	name: 'hono-dom',
});
runSharedComponentParamsTests({
	compile: compileDom,
	compile_to_volar_mappings: compileDomToVolarMappings,
	name: 'hono-dom',
});
runSharedHookBodyTests({
	compile: compileDom,
	compile_to_volar_mappings: compileDomToVolarMappings,
	name: 'hono-dom',
});

describe('removed lazy destructuring', () => {
	it.each([
		['server', compileServer],
		['dom', compileDom],
	])('%s compiler rejects the removed lazy binding syntax', (_name, compile) => {
		for (const source of [
			'function App(&{ name }) { return <div>{name}</div>; }',
			'function App() { const &[count] = track(0); return <div>{count}</div>; }',
		]) {
			expect(() => compile(source, 'App.tsrx')).toThrow(SyntaxError);
		}
	});
});

describe('@tsrx/hono server compiler', () => {
	it('does not expose the compiler-only Dynamic helper at runtime', () => {
		expect(honoServerRuntime).not.toHaveProperty('Dynamic');
		expect(honoDomRuntime).not.toHaveProperty('Dynamic');
	});

	it('emits Hono server JSX helpers and preserves async components', () => {
		const { code } = compileServer(
			`export async function App({ items }) @{
				@try {
					@for (const item of items) {
						<div class="item">{item}</div>
					}
				} @pending {
					<p>Loading</p>
				} @catch (error) {
					<p>{error.message}</p>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain("from 'hono/jsx'");
		expect(code).toContain("from '@tsrx/hono/error-boundary'");
		expect(code).toContain("from '@tsrx/hono/runtime/iterable'");
		expect(code).toContain('export async function App');
		expect(code).toContain('<Suspense');
		expect(code).toContain('<TsrxErrorBoundary');
		expect(code).toContain('<TsrxErrorBoundary fallbackRender={');
		expect(code).not.toContain('_reset');
		expect(code).toContain('class="item"');
	});

	it('does not rewrite class and lowers dynamic tags without a runtime Dynamic import', () => {
		const { code } = compileServer(
			`export function App({ Tag }) @{
				<{Tag} class="dynamic">{'content'}</{Tag}>
			}`,
			'App.tsrx',
		);

		expect(code).toContain('const TsrxDynamic_1 = Tag;');
		expect(code).toContain('class="dynamic"');
		expect(code).not.toContain("from '@tsrx/hono/dynamic'");
	});

	it('allows top-level await for server components', () => {
		expect(() =>
			compileServer(
				`export async function App() @{
					const value = await load();
					<div>{value}</div>
				}`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('rejects the unsupported Hono reset callback shape', () => {
		expect(() =>
			compileServer(
				`export function App() @{
					@try {
						<div />
					} @catch (error, reset) {
						<p>{error.message}</p>
					}
				}`,
				'App.tsrx',
			),
		).toThrow(
			expect.objectContaining({
				code: 'TSRX2026',
				message: expect.stringMatching(/does not provide a reset callback/),
			}),
		);
	});

	it('keeps Hono-specific adapters available in direct runtime mode', () => {
		const { code } = compileServer(
			`export function App() @{
				@try {
					<div />
				} @catch (error) {
					<p>{error.message}</p>
				}
			}`,
			'App.tsrx',
			{ runtimeImports: 'direct' },
		);

		expect(code).toContain("from '@tsrx/hono/error-boundary'");
	});
});

describe('@tsrx/hono DOM compiler', () => {
	it('specializes compile-time platform flags before DOM lowering', () => {
		const { code } = compileDom(
			`if (import.meta.env.platform.web) {
				const selected_web = 'selected_web';
			} else {
				const selected_native = 'selected_native';
			}`,
			'Platform.tsrx',
			{ platform: 'web' },
		);

		expect(code).toContain('selected_web');
		expect(code).not.toContain('selected_native');
		expect(code).not.toContain('import.meta.env.platform');
	});

	it('provides platform flag types in DOM editor output', () => {
		const result = compileDomToVolarMappings(
			`export const web: true = import.meta.env.platform.web;
			export const ios: false = import.meta.env.platform.ios;
			export const android: false = import.meta.env.platform.android;`,
			'Platform.tsrx',
			{ platform: 'web' },
		);

		expect(result.errors).toEqual([]);
		expect(result.code).toContain('readonly web: true');
		expect(result.code).toContain('readonly ios: false');
		expect(result.code).toContain('readonly android: false');
	});

	it.each([
		'const UI = { App: async () => <div /> }; const view = <UI.App />;',
		'const UI = { nested: { App: async () => <div /> } }; const view = <UI.nested.App />;',
	])('rejects locally resolved async component values: %s', (source) => {
		expect(() => compileDom(source, 'App.tsrx')).toThrow(/does not support async components/);
		expect(() => compileServer(source, 'App.tsrx')).not.toThrow();
	});
	it.each([
		'const UI = { App: async () => <div />, App: () => <span /> }; <UI.App />;',
		'const UI = { App: async () => <div />, ...overrides }; <UI.App />;',
		'const UI = { App: async () => <div />, [key]: () => <span /> }; <UI.App />;',
		'const UI = { App: async () => <div />, get App() { return () => <span />; } }; <UI.App />;',
		'const UI = { nested: { App: async () => <div />, App: () => <span /> } }; <UI.nested.App />;',
	])('does not diagnose an overwritten or uncertain object member: %s', (source) => {
		expect(() => compileDom(source, 'App.tsrx')).not.toThrow();
		expect(compileDomToVolarMappings(source, 'App.tsrx').errors).toEqual([]);
	});

	it.each([
		'const UI = { App: () => <span />, App: async () => <div /> }; <UI.App />;',
		'const UI = { ...overrides, App: async () => <div /> }; <UI.App />;',
		'const UI = { [key]: () => <span />, App: async () => <div /> }; <UI.App />;',
	])('diagnoses a final known async object member: %s', (source) => {
		expect(() => compileDom(source, 'App.tsrx')).toThrow(/does not support async components/);
	});

	it.each([
		'const registry = UI; registry.App = () => <span />; <UI.App />;',
		'const registry = UI as any; registry["App"] = () => <span />; <UI.App />;',
		'let registry; registry = UI; registry.App = () => <span />; <UI.App />;',
		'const first = UI; const second = first; second.App = () => <span />; <UI.App />;',
		'const registry = UI; registry.App = () => <span />; const view = UI; <view.App />;',
		'const registry = flag ? UI : fallback; registry.App = () => <span />; <UI.App />;',
		'const registry = UI.nested; registry.App = () => <span />; <UI.nested.App />;',
		'const { nested } = UI; nested.App = () => <span />; <UI.nested.App />;',
		'Object.assign(UI, { App: () => <span /> }); <UI.App />;',
		'Object.assign(UI.nested, { App: () => <span /> }); <UI.nested.App />;',
		'const registry = UI; Object.assign(registry, { App: () => <span /> }); <UI.App />;',
		'Object.defineProperty(UI, "App", { value: () => <span /> }); <UI.App />;',
		'Reflect.set(UI, "App", () => <span />); <UI.App />;',
		'let registry; registry ??= UI; registry.App = () => <span />; <UI.App />;',
		'let registry = load(); registry ||= UI; registry.App = () => <span />; <UI.App />;',
		'let registry = {}; registry = load(); registry ||= UI; registry.App = () => <span />; <UI.App />;',
		'for (let registry of [{}]) { registry &&= UI; registry.App = () => <span />; } <UI.App />;',
		'for (let registry in { key: 1 }) { registry &&= UI; registry.App = () => <span />; } <UI.App />;',
		'for (let registry = {}; registry; registry = null) { registry &&= UI; registry.App = () => <span />; } <UI.App />;',
		'function List() @{ <ul>@for (let registry of [{}]) { registry &&= UI; registry.App = () => <span />; <li /> }</ul> } <UI.App />;',
	])('does not diagnose a member overwritten through an alias or writer call: %s', (update) => {
		const source = `const UI = { App: async () => <div />, nested: { App: async () => <div /> } };
			${update}`;
		expect(() => compileDom(source, 'App.tsrx')).not.toThrow();
		expect(compileDom(source, 'App.tsrx', { collect: true }).errors).toEqual([]);
		expect(compileDomToVolarMappings(source, 'App.tsrx').errors).toEqual([]);
	});

	it.each([
		'const registry = UI; <registry.App />;',
		'const copy = { ...UI }; copy.App = () => <span />; <UI.App />;',
		'Object.assign({}, UI, { App: () => <span /> }); <UI.App />;',
		'const Other = { App: () => <span /> }; Object.assign(Other, UI); <UI.App />;',
		'let registry = UI; registry = { App: () => <span /> }; <UI.App />;',
		'const { ...copy } = UI; copy.App = () => <span />; <UI.App />;',
		'let copy; ({ ...copy } = UI); copy.App = () => <span />; <UI.App />;',
		'let registry = { App: () => <span /> }; registry ||= UI; registry.App = () => <span />; <UI.App />;',
		'let registry = { App: () => <span /> }; registry ??= UI; registry.App = () => <span />; <UI.App />;',
		'let registry; registry &&= UI; Object.assign(registry, { App: () => <span /> }); <UI.App />;',
	])('still diagnoses an async member that no write can replace: %s', (update) => {
		const source = `const UI = { App: async () => <div /> };
			${update}`;
		const async_error = expect.objectContaining({
			message: expect.stringContaining('does not support async components'),
		});
		expect(() => compileDom(source, 'App.tsrx')).toThrow(/does not support async components/);
		expect(compileDom(source, 'App.tsrx', { collect: true }).errors).toEqual([async_error]);
		expect(compileDomToVolarMappings(source, 'App.tsrx').errors).toEqual([async_error]);
	});

	it.each([
		'function patch(target: { App: () => any }) { target.App = () => <span />; } patch(UI); <UI.App />;',
		'const box = { ui: UI }; box.ui.App = () => <span />; <UI.App />;',
		'const list = [UI]; list[0].App = () => <span />; <UI.App />;',
		'patch(UI.nested); <UI.nested.App />;',
		'patch({ ui: UI }); <UI.App />;',
		'patch(...[UI]); <UI.App />;',
		'patch(UI[key]); <UI.nested.App />;',
		'new Patcher(UI); <UI.App />;',
		'patch`${UI}`; <UI.App />;',
		'UI.init(); <UI.App />;',
		'[UI].forEach((registry) => { registry.App = () => <span />; }); <UI.App />;',
		'for (const registry of [UI]) registry.App = () => <span />; <UI.App />;',
		'function List() @{ <ul>@for (const registry of [UI]) { registry.App = () => <span />; <li /> }</ul> } <UI.App />;',
		'const holder = {}; holder.ui = UI; holder.ui.App = () => <span />; <UI.App />;',
		'globalThis.registry = UI; <UI.App />;',
		'cache.set("ui", UI); <UI.App />;',
		'Reflect.set(holder, "ui", UI); <UI.App />;',
		'Object.assign(holder, { ui: UI }); <UI.App />;',
		'class Box { ui = UI; } <UI.App />;',
		'const view = <Patch registry={UI} />; <UI.App />;',
		'function patch(target = UI) { target.App = () => <span />; } patch(); <UI.App />;',
		'const { registry = UI } = {}; registry.App = () => <span />; <UI.App />;',
		'const registry = (load(), UI); registry.App = () => <span />; <UI.App />;',
		'const get = () => UI; get().App = () => <span />; <UI.App />;',
		'function get() { return UI; } get().App = () => <span />; <UI.App />;',
		'(flag ? UI : other).App = () => <span />; <UI.App />;',
		'[UI][0].App = () => <span />; <UI.App />;',
		'const console = { log: patch }; console.log(UI); <UI.App />;',
		'const registry = UI; patch(registry); <UI.App />;',
		'const { nested } = UI; patch(nested); <UI.nested.App />;',
		'const box = { ui: UI }; patch(box.ui); <UI.App />;',
		'const view = <div ref={UI} />; <UI.App />;',
		'const [, registry] = [other, UI]; patch(registry); <UI.App />;',
		'const [, registry] = [...others, UI]; patch(registry); <UI.App />;',
		'const Reg = { App: async () => <div />, init() { this.App = () => <span />; } }; Reg.init(); <Reg.App />;',
		'Object.values(UI)[1].App = () => <span />; <UI.nested.App />;',
		'Object.entries(UI).forEach(([, value]) => { value.App = () => <span />; }); <UI.nested.App />;',
		'Object.getOwnPropertyDescriptor(UI, "nested").value.App = () => <span />; <UI.nested.App />;',
		'const frozen = Object.freeze(UI); frozen.nested.App = () => <span />; <UI.nested.App />;',
		'JSON.stringify(UI, (key, value) => { if (value?.App) value.App = () => <span />; return value; }); <UI.App />;',
		'JSON.stringify(UI, replacer); <UI.App />;',
	])('does not diagnose a registry that escapes to code the check cannot follow: %s', (update) => {
		const source = `const UI = { App: async () => <div />, nested: { App: async () => <div /> } };
			${update}`;
		expect(() => compileDom(source, 'App.tsrx')).not.toThrow();
		expect(compileDom(source, 'App.tsrx', { collect: true }).errors).toEqual([]);
		expect(compileDomToVolarMappings(source, 'App.tsrx').errors).toEqual([]);
	});

	it.each([
		'console.log(UI, UI.App); <UI.App />;',
		'JSON.stringify(UI); Object.keys(UI); Array.isArray(UI); String(UI); <UI.App />;',
		'JSON.stringify(UI, null, 2); JSON.stringify(UI, ["App"]); JSON.stringify(UI, undefined); <UI.App />;',
		'Object.keys({ ui: UI }); <UI.App />;',
		'if (UI.App && typeof UI === "object" && "App" in UI) {} <UI.App />;',
		'const label = `${UI}`; <UI.App />;',
		'memo(UI.App); <UI.App />;',
		'patch(UI[key]); <UI.App />;',
		'UI.App.toString(); UI.hasOwnProperty("App"); <UI.App />;',
		'const view = <Card render={UI.App} />; <UI.App />;',
		'const box = { ui: UI }; <box.ui.App />;',
		'const list = [UI]; console.log(list); <UI.App />;',
		'patch({ ...UI }); <UI.App />;',
		'export { UI }; <UI.App />;',
		'const Page = async () => <div />; register(Page); <Page />;',
		'const Page = UI.App; register(Page); <Page />;',
		'const { App } = UI; register(App); <App />;',
		'const registry = UI; memo(registry.App); <UI.App />;',
		'const items = UI.items; items.map((item) => item.name); <UI.App />;',
		'const box = { ui: UI }; patch(box.label); <UI.App />;',
		'const view = <div title={UI.title} style={{ color: UI.color }}>{UI}</div>; <UI.App />;',
		'function List() @{ <ul>@for (const item of UI.items) { <li>{item.name}</li> }</ul> } <UI.App />;',
		'UI.App.displayName = "App"; <UI.App />;',
		'const Page = async () => <div />; Page.displayName = "Page"; <Page />;',
		'const Page = async () => <div />; Object.assign(Page, { displayName: "Page" }); <Page />;',
		'export const result = UI.App(); <UI.App />;',
		'const [, registry] = [UI, other]; patch(registry); <UI.App />;',
		'Object.freeze(UI); Object.values(UI); Object.entries(UI); Reflect.getPrototypeOf(UI); <UI.App />;',
	])('still diagnoses an async member that is only read or copied: %s', (update) => {
		const source = `const UI = { App: async () => <div /> };
			${update}`;
		const async_error = expect.objectContaining({
			message: expect.stringContaining('does not support async components'),
		});
		expect(() => compileDom(source, 'App.tsrx')).toThrow(/does not support async components/);
		expect(compileDom(source, 'App.tsrx', { collect: true }).errors).toEqual([async_error]);
		expect(compileDomToVolarMappings(source, 'App.tsrx').errors).toEqual([async_error]);
	});

	it('keeps every path the registry itself exposes, however many', () => {
		// Only paths passed on through aliases are merged past a limit.
		const calls = Array.from({ length: 20 }, (_, index) => `patch(UI.k${index});`).join(' ');
		const source = `const UI: any = { nested: { App: async () => <div /> } };
			${calls}
			<UI.nested.App />;`;
		expect(() => compileDom(source, 'App.tsrx')).toThrow(/does not support async components/);
	});

	/**
	 * The check's work for one DOM compile, counted rather than timed.
	 * @param {string} source
	 */
	function count_validation_work(source) {
		hono_dom_validation_work.resolution_steps = 0;
		hono_dom_validation_work.exposure_updates = 0;
		expect(compileDom(source, 'App.tsrx', { collect: true }).errors).toHaveLength(1);
		return { ...hono_dom_validation_work };
	}

	it('bounds the work when aliases are reassigned from each other', () => {
		// Each reassignment adds a member path per element to the other alias, so
		// unbounded paths multiply with every round: without the bound, two
		// elements of the second form don't finish.
		expect(
			count_validation_work(`const UI: any = { App: async () => <div /> };
let a: any = UI;
let b: any = UI;
a = [b.a.a, b.b.b];
b = [a.a.a, a.b.b];
sink(a.x.x);
<UI.App />;`).exposure_updates,
		).toBeLessThan(100);
		/** @param {number} count */
		const source = (count) => {
			const members = ['a.a', 'b.b', 'c.c', 'd.d'].slice(0, count);
			return `const UI: any = { App: async () => <div /> };
let a: any = UI;
let b: any = UI;
a = { ${members.map((member, index) => `[k${index}]: b.${member}`).join(', ')} };
b = { ${members.map((member, index) => `[k${index}]: a.${member}`).join(', ')} };
sink(a.x.x);
<UI.App />;`;
		};
		expect(count_validation_work(source(4)).exposure_updates).toBeLessThan(
			10 * count_validation_work(source(1)).exposure_updates,
		);
	});

	it('resolves method calls through a long alias chain in linear work', () => {
		// Each call checks whether its callee is an arrow function; resolving
		// every one from scratch through the chain took quadratic work.
		/** @param {number} count */
		const source = (count) => {
			const aliases = Array.from({ length: count }, (_, index) =>
				index ? `const a${index} = a${index - 1};` : 'const a0 = UI;',
			);
			const calls = Array.from({ length: count }, (_, index) => `a${index}.App();`);
			return `const UI = { App: async () => <div /> };
${aliases.join('\n')}
${calls.join('\n')}
<UI.App />;`;
		};
		expect(count_validation_work(source(1000)).resolution_steps).toBeLessThan(
			15 * count_validation_work(source(100)).resolution_steps,
		);
	});

	it('does not cache a resolution the cycle guard cut short', () => {
		// Resolving `<A.x />` reaches `A.y` while `A` is still being resolved.
		expect(() =>
			compileDom(
				`const A = { x: B, y: async () => <div /> };
var B = A.y;
false && <A.x />;
<A.y />;`,
				'App.tsrx',
			),
		).toThrow(/does not support async components/);
	});

	it('rejects an async component referenced by a dynamic tag', () => {
		expect(() =>
			compileDom('const App = async () => <div />; const view = <{App} />;', 'App.tsrx'),
		).toThrow(/Hono JSX DOM does not support async components/);
		expect(() =>
			compileServer('const App = async () => <div />; const view = <{App} />;', 'App.tsrx'),
		).not.toThrow();
	});
	it('resolves static member references in dynamic tags', () => {
		expect(() =>
			compileDom(
				`const UI = { App: async () => <div /> };
				const view = <{UI.App} />;`,
				'App.tsrx',
			),
		).toThrow(/Hono JSX DOM does not support async components/);
	});
	it('allows sync dynamic tags', () => {
		expect(() =>
			compileDom('const App = () => <div />; const view = <{App} />;', 'App.tsrx'),
		).not.toThrow();
	});
	it('does not infer a dynamic computed value', () => {
		expect(() =>
			compileDom(
				`const UI = { Async: async () => <div />, Sync: () => <span /> };
				const key = 'Async';
				const App = UI[key];
				const view = <{App} />;`,
				'App.tsrx',
			),
		).not.toThrow();
	});
	it('does not confuse shadowed object members with async helpers', () => {
		expect(() =>
			compileDom(
				`
			const UI = { App: async () => <div /> };
			function render() {
				const UI = { App: () => <div /> };
				return <UI.App />;
			}
		`,
				'App.tsrx',
			),
		).not.toThrow();
	});
	it.each([
		`let App = () => <div />;
			const view = <App />;
			App = async () => <span />;`,
		`let App = async () => <div />;
			App = () => <span />;
			const view = <App />;`,
	])('does not infer values across mutable assignment order: %s', (source) => {
		expect(() => compileDom(source, 'App.tsrx')).not.toThrow();
	});
	it('does not resolve a computed member with a dynamic key', () => {
		expect(() =>
			compileDom(
				`const UI = { name: async () => <div />, Other: () => <span /> };
				const name = 'name';
				const App = UI[name];
				<App />;`,
				'App.tsrx',
			),
		).not.toThrow();
	});
	it('resolves a string-literal computed member without evaluating expressions', () => {
		expect(() =>
			compileDom(
				`const UI = { App: async () => <div /> };
				const App = UI['App'];
				<App />;`,
				'App.tsrx',
			),
		).toThrow(/does not support async components/);
	});
	it('resolves string-literal computed object properties', () => {
		expect(() =>
			compileDom(
				`const UI = { ['App']: async () => <div /> };
				const view = <UI.App />;`,
				'App.tsrx',
			),
		).toThrow(/does not support async components/);
	});
	it('resolves string-literal computed destructured properties', () => {
		expect(() =>
			compileDom(
				`const UI = { App: async () => <div /> };
				const { ['App']: Card } = UI;
				<Card />;`,
				'App.tsrx',
			),
		).toThrow(/does not support async components/);
	});
	it('validates the component binding of a named async function expression', () => {
		expect(() =>
			compileDom(
				'const App = async function loadView() { return <div />; }; export { App }; <App />;',
				'App.tsrx',
			),
		).toThrow(/does not support async components/);
	});
	it('does not hoist mutable Hono DOM nodes to module scope', () => {
		const { code } = compileDom(
			`export function App() @{
				<div>{'static'}</div>
			}`,
			'App.tsrx',
		);

		expect(code).not.toContain('const App__static1 =');
		expect(code).toContain("return <div>{'static'}</div>;");
	});

	it('uses the DOM JSX runtime and keeps hook branches inline', () => {
		const { code } = compileDom(
			`import { useState } from 'hono/jsx/dom';

			export function App({ visible }) @{
				@if (visible) {
					const [count] = useState(0);
					<button class="button">{count}</button>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain("from 'hono/jsx/dom'");
		expect(code).toContain('class="button"');
		expect(code).toContain('const [count] = useState(0);');
		expect(code).not.toContain('StatementBodyHook');
	});

	it('uses the Hono DOM ref runtime for multiple refs', () => {
		const { code } = compileDom(
			`export function App(props) @{
				let first;
				<input {...props} ref={first} />
			}`,
			'App.tsrx',
			{ collect: true },
		);

		expect(code).toContain("from '@tsrx/hono/ref'");
		expect(code).toContain('__mergeRefs');
	});

	it('rejects async DOM components and points users to use plus Suspense', () => {
		expect(() =>
			compileDom(
				`export async function App() @{
					const value = await load();
					<div>{value}</div>
				}
				<App />`,
				'App.tsrx',
			),
		).toThrow(/Hono JSX DOM does not support async components/);
	});

	it('rejects async DOM components even without an await expression', () => {
		expect(() =>
			compileDom(
				`export async function App() {
					return <div />;
				}
				<App />`,
				'App.tsrx',
			),
		).toThrow(/Hono JSX DOM does not support async components/);
	});

	it('does not duplicate the async diagnostic when await has a precise diagnostic', () => {
		const result = compileDomToVolarMappings(
			`export async function App() {
				const value = await load();
				return <div>{value}</div>;
			}`,
			'App.tsrx',
		);
		expect(
			result.errors.filter((error) => error.message.includes('Hono JSX DOM does not support')),
		).toHaveLength(1);
	});

	it('continues validating later async components after an await diagnostic', () => {
		const result = compileDomToVolarMappings(
			`async function First() {
				const value = await load();
				return <div>{value}</div>;
			}
			async function Second() {
				return <span />;
			}
			function App() {
				return <><First /><Second /></>;
			}
			<App />`,
			'App.tsrx',
		);

		expect(
			result.errors.some((error) =>
				error.message.includes('Hono JSX DOM does not support async components.'),
			),
		).toBe(true);
	});

	it('uses core await detection for for-await components and keeps later diagnostics', () => {
		const result = compileDomToVolarMappings(
			`async function First(items) {
				for await (const item of items) {
					console.log(item);
				}
				return <div />;
			}
			async function Second() {
				return <span />;
			}
			function App() {
				return <><First /><Second /></>;
			}
			<App />`,
			'App.tsrx',
		);

		expect(
			result.errors.filter((error) =>
				error.message.includes('Hono JSX DOM does not support async components.'),
			),
		).toHaveLength(1);
		expect(
			result.errors.some((error) =>
				error.message.includes('Hono JSX DOM does not support top-level `await`'),
			),
		).toBe(true);
	});

	it('uses TSRX await detection for statement-container components', () => {
		const result = compileDomToVolarMappings(
			`async function First(items) @{
				for await (const item of items) {
					console.log(item);
				}
				<div />
			}
			async function Second() {
				return <span />;
			}
			function App() {
				return <><First items={[]} /><Second /></>;
			}
			<App />`,
			'App.tsrx',
		);

		expect(
			result.errors.filter((error) =>
				error.message.includes('Hono JSX DOM does not support async components.'),
			),
		).toHaveLength(1);
		expect(
			result.errors.some((error) =>
				error.message.includes('Hono JSX DOM does not support top-level `await`'),
			),
		).toBe(true);
	});

	it('does not infer default exports as DOM component references', () => {
		expect(() =>
			compileDom(
				`export default async function App() @{
					<div />
				}`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not reject async helpers that are not rendered as components', () => {
		expect(() =>
			compileDom(
				`async function makePreview() {
					return <dialog />;
				}

				export function App() @{
					<button onClick={() => { void makePreview(); }}>{'Open'}</button>
				}`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not confuse a shadowed async helper with an exported component', () => {
		expect(() =>
			compileDom(
				`export function App() @{ <div /> }

				export function createLoader() {
					const App = async function loadView() {
						return <div />;
					};
					return App;
				}`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not infer an async component from a default export alias', () => {
		expect(() =>
			compileDom(
				`async function loadView() {
					return <div />;
				}

				export { loadView as default };`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not infer a string-literal default export alias', () => {
		expect(() =>
			compileDom(
				`async function loadView() {
					return <div />;
				}

				export { loadView as 'default' };`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('resolves DOM component references through lexical scopes', () => {
		expect(() =>
			compileDom(
				`async function Card() {
					return fetch('/data');
				}

				export function App() @{
					const Card = () => <div>{'sync card'}</div>;
					<Card />
				}`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not use an unexported uppercase helper name as proof of a component', () => {
		expect(() =>
			compileDom(
				`async function PreviewData() {
					return <dialog />;
				}

				export function App() @{
					<button onClick={() => { void PreviewData(); }}>{'Open'}</button>
				}`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not reject async loaders nested in a default-exported component', () => {
		expect(() =>
			compileDom(
				`export default function App() @{
					async function loadPreview() {
						return 'preview';
					}

					const preview = use(loadPreview());
					<Suspense fallback={<div>{'Loading'}</div>}>
						<div>{preview}</div>
					</Suspense>
				}`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('rejects async DOM components that return JSX through a promise', () => {
		expect(() =>
			compileDom(
				`export async function App() {
					return Promise.resolve(<div />);
				}
				<App />`,
				'App.tsrx',
			),
		).toThrow(/Hono JSX DOM does not support async components/);
	});

	it('rejects async local components rendered through JSX', () => {
		expect(() =>
			compileDom(
				`async function Card() {
					return <div />;
				}

				export function App() @{ <Card /> }`,
				'App.tsrx',
			),
		).toThrow(/Hono JSX DOM does not support async components/);
	});

	it.each([
		'const App = (async () => <div />) satisfies Component; <App />;',
		'const App = (async () => <div />) as Component; <App />;',
		'const App = (async () => <div />)!; <App />;',
	])('rejects async components through transparent wrappers: %s', (source) => {
		expect(() => compileDom(source, 'App.tsrx')).toThrow(
			/Hono JSX DOM does not support async components/,
		);
	});

	it('reports wrapped async components through Volar mappings too', () => {
		const result = compileDomToVolarMappings(
			'const App = (async () => <div />) satisfies Component; <App />;',
			'App.tsrx',
		);
		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					message: expect.stringContaining('does not support async components'),
				}),
			]),
		);
	});

	it.each([
		`const Components = { AsyncCard: async () => <div /> };
			const { AsyncCard: Card } = Components;
			<Card />;`,
		`const Components = { nested: { AsyncCard: async () => <div /> } };
			const { nested: { AsyncCard: Card } } = Components;
			<Card />;`,
	])('rejects destructured async component values: %s', (source) => {
		expect(() => compileDom(source, 'App.tsrx')).toThrow(
			/Hono JSX DOM does not support async components/,
		);
	});

	it('does not infer Promise-returning components without type information', () => {
		expect(() =>
			compileDom(
				`function App() {
					return Promise.resolve(<div />);
				}
				<App />`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not treat a local Promise binding as proof of an async component', () => {
		expect(() =>
			compileDom(
				`const Promise = { resolve(value) { return value; } };
				function App() {
					return Promise.resolve(<div />);
				}
				<App />`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not claim to infer arbitrary Promise-returning components', () => {
		expect(() =>
			compileDom(
				`function App() {
					return fetch('/component');
				}
				<App />`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not infer components from hand-written JSX factory calls', () => {
		expect(() =>
			compileDom(
				`function jsx(value) { return value; }
				async function Parser() { return 123; }
				jsx(Parser);`,
				'App.tsrx',
			),
		).not.toThrow();

		expect(() =>
			compileDom(
				`import { jsx as h } from 'hono/jsx/dom';
				async function Card() { return <div />; }
				h(Card, {});`,
				'App.tsrx',
			),
		).not.toThrow();

		expect(() =>
			compileDom(
				`import * as HonoDOM from 'hono/jsx/dom';
				async function Card() { return <div />; }
				HonoDOM.jsx(Card, {});`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it('does not treat an unused exported async helper as a component', () => {
		expect(() =>
			compileDom(
				`export async function FetchUser() {
					return fetch('/user');
				}
				export function App() { return <div />; }`,
				'App.tsrx',
			),
		).not.toThrow();
	});

	it.each([
		'const App = flag ? async () => <div /> : () => <span />; <App />;',
		'const App = flag && (async () => <div />); <App />;',
		'let App; App ??= async () => <div />; <App />;',
	])('does not infer local control-flow or assignment values: %s', (source) => {
		expect(() => compileDom(source, 'App.tsrx')).not.toThrow();
	});

	it('uses the DOM ErrorBoundary adapter', () => {
		const { code } = compileDom(
			`export function App() @{
				@try {
					<div />
				} @catch (error) {
					<p>{error.message}</p>
				}
			}`,
			'App.tsrx',
		);

		expect(code).toContain("from '@tsrx/hono/dom/error-boundary'");
		expect(code).toContain('fallbackRender={');
	});
});
