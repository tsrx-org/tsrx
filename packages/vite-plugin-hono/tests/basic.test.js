import { describe, expect, it } from 'vitest';
import { resolveHonoTarget } from '@tsrx/hono/target';
import { tsrxHono } from '../src/index.js';

const CSS_QUERY = '?tsrx-css&lang.css';

function create_context(environment = {}) {
	return { environment };
}

describe('@tsrx/vite-plugin-hono', () => {
	it.each([
		['server', undefined],
		['dom', 'dom'],
	])('uses the %s target descriptor', async (_name, mode) => {
		const target = resolveHonoTarget(mode);
		const plugin = tsrxHono(mode === undefined ? undefined : { mode });
		const result = await plugin.transform.call(
			create_context(),
			`export function App() @{ <main>{'Hello'}</main> }`,
			'/virtual/App.tsrx',
		);

		expect(result.code).toContain(`${target.jsxImportSource}/jsx-runtime`);
		const other = resolveHonoTarget(mode === 'dom' ? 'server' : 'dom');
		expect(result.code).not.toContain(`${other.jsxImportSource}/jsx-runtime`);
	});

	it('rejects an invalid mode before transforming source', () => {
		expect(() => tsrxHono({ mode: /** @type {any} */ ('client') })).toThrow(
			/Invalid Hono target mode/,
		);
	});

	it('only transforms .tsrx files', async () => {
		const plugin = tsrxHono();

		expect(
			await plugin.transform.call(
				create_context(),
				`export function App() @{ <main /> }`,
				'/virtual/App.tsx',
			),
		).toBeNull();
	});

	it('maps the final JSX output back to the original TSRX source', async () => {
		const plugin = tsrxHono({ mode: 'dom' });
		const id = '/virtual/App.tsrx';
		const source = `export function App() @{
			const greeting = 'Hello';
			<main>{greeting}</main>
		}`;

		const result = await plugin.transform.call(create_context(), source, id);

		expect(result.map.sources).toEqual([id]);
		expect(result.map.sourcesContent).toEqual([source]);
	});

	it('adds, changes, and removes an owned virtual stylesheet', async () => {
		const plugin = tsrxHono({ mode: 'dom' });
		const id = '/virtual/App.tsrx';
		const css_id = `\0${id}${CSS_QUERY}`;
		const css_module = { id: css_id };
		const invalidated = [];
		const environment = {
			moduleGraph: {
				getModuleById(module_id) {
					return module_id === css_id ? css_module : undefined;
				},
				invalidateModule(module) {
					invalidated.push(module);
				},
			},
		};
		const context = create_context(environment);
		const styled = (color) => `export function App() @{
			<><style>main { color: ${color}; }</style><main /></>
		}`;

		const transformed = await plugin.transform.call(context, styled('red'), id);
		expect(transformed.code).toContain(id + CSS_QUERY);
		expect(plugin.resolveId.call(context, id + CSS_QUERY)).toBe(css_id);
		expect(plugin.load.call(context, css_id)).toContain('color: red;');

		const modules = [{ id }];
		const updated = await plugin.hotUpdate.call(context, {
			file: id,
			modules,
			read: async () => styled('blue'),
		});
		expect(plugin.load.call(context, css_id)).toContain('color: blue;');
		expect(invalidated).toEqual([css_module]);
		expect(updated).toEqual([...modules, css_module]);

		await plugin.hotUpdate.call(context, {
			file: id,
			modules,
			read: async () => `export function App() @{ <main /> }`,
		});
		expect(plugin.load.call(context, css_id)).toBe('');
	});

	it('isolates the same source ID between named Vite environments', async () => {
		const plugin = tsrxHono();
		const id = '/virtual/App.tsrx';
		const css_id = `\0${id}${CSS_QUERY}`;
		const client = create_context({ name: 'client' });
		const ssr = create_context({ name: 'ssr' });
		const styled = (color) =>
			`export function App() @{ <><style>main { color: ${color}; }</style><main /></> }`;

		await plugin.transform.call(client, styled('red'), id);
		await plugin.transform.call(ssr, styled('blue'), id);

		expect(plugin.load.call(client, css_id)).toContain('color: red;');
		expect(plugin.load.call(ssr, css_id)).toContain('color: blue;');

		plugin.buildStart.call(ssr);
		expect(plugin.load.call(ssr, css_id)).toBeNull();
		expect(plugin.load.call(client, css_id)).toContain('color: red;');
	});

	it('does not publish CSS from a superseded hot update', async () => {
		const plugin = tsrxHono({ mode: 'dom' });
		const id = '/virtual/App.tsrx';
		const css_id = `\0${id}${CSS_QUERY}`;
		const css_module = { id: css_id };
		const invalidated = [];
		const environment = {
			moduleGraph: {
				getModuleById(module_id) {
					return module_id === css_id ? css_module : undefined;
				},
				invalidateModule(module) {
					invalidated.push(module);
				},
			},
		};
		const context = create_context(environment);
		const styled = (color) =>
			`export function App() @{ <><style>main { color: ${color}; }</style><main /></> }`;

		await plugin.transform.call(context, styled('initial'), id);
		let release_first_read;
		const first = plugin.hotUpdate.call(context, {
			file: id,
			modules: [{ id }],
			read: () =>
				new Promise((resolve) => {
					release_first_read = () => resolve(styled('red'));
				}),
		});
		const second_modules = [{ id, revision: 2 }];
		const second = await plugin.hotUpdate.call(context, {
			file: id,
			modules: second_modules,
			read: async () => styled('blue'),
		});
		release_first_read();
		const stale = await first;

		expect(second).toEqual([...second_modules, css_module]);
		expect(stale).toEqual([]);
		expect(plugin.load.call(context, css_id)).toContain('color: blue;');
		expect(invalidated).toEqual([css_module]);
	});

	it('releases stylesheet ownership when a source file is deleted', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const id = '/virtual/App.tsrx';
		const css_id = `\0${id}${CSS_QUERY}`;
		await plugin.transform.call(
			context,
			`export function App() @{ <><style>main { color: red; }</style><main /></> }`,
			id,
		);

		plugin.watchChange.call(context, id, { event: 'delete' });

		expect(plugin.resolveId.call(context, id + CSS_QUERY)).toBeNull();
		expect(plugin.load.call(context, css_id)).toBeNull();
	});

	it('does not claim virtual CSS owned by another plugin', () => {
		const plugin = tsrxHono();
		const context = create_context();

		expect(plugin.resolveId.call(context, '/other/App.tsrx' + CSS_QUERY)).toBeNull();
		expect(plugin.load.call(context, '\0/other/App.tsrx' + CSS_QUERY)).toBeNull();
	});
});
