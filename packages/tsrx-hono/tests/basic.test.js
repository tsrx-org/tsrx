import { describe, expect, it } from 'vitest';
import {
	runSharedClassFunctionComponentTests,
	runSharedCodeBlockChildrenTests,
	runSharedCompileDiagnosticsTests,
	runSharedCompileTests,
	runSharedComponentParamsTests,
	runSharedSwitchHelperHoistingTests,
	runSharedTsxExpressionTsrxTests,
} from '@tsrx/core/test-harness/compile';
import { runSharedSourceMappingTests } from '@tsrx/core/test-harness/source-mappings';
import { compile as compileServer } from '../src/index.js';
import { compile_to_volar_mappings as compileServerToVolarMappings } from '../src/index.js';
import { compile as compileDom } from '../src/dom.js';
import { compile_to_volar_mappings as compileDomToVolarMappings } from '../src/dom.js';
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
runSharedSwitchHelperHoistingTests({
	compile: compileDom,
	compile_to_volar_mappings: compileDomToVolarMappings,
	name: 'hono-dom',
	clientHelperShape: 'module-function',
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
		).toThrow(/does not provide a reset callback/);
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

	it('uses the DOM JSX runtime and stable helper components for hook branches', () => {
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
		expect(code).toMatch(/function App__StatementBodyHook\d+\(/);
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
