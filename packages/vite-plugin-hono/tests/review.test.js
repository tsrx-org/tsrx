import { describe, expect, it } from 'vitest';
import { jsx, Suspense } from 'hono/jsx';
import { renderToReadableStream } from 'hono/jsx/streaming';
import { TsrxErrorBoundary } from '@tsrx/hono/error-boundary';
import { tsrxHono } from '../src/index.js';

function create_context(module_graph = {}) {
	return {
		environment: {
			moduleGraph: {
				getModuleById() {
					return undefined;
				},
				invalidateModule() {},
				...module_graph,
			},
		},
	};
}

describe('Hono integration boundaries', () => {
	it('does not read deleted CSS owners during hotUpdate', async () => {
		const plugin = tsrxHono();
		const modules = [{ id: '/virtual/Deleted.tsrx' }];
		const result = await plugin.hotUpdate.call(
			{ environment: {} },
			{
				type: 'delete',
				file: '/virtual/Deleted.tsrx',
				modules,
				read() {
					throw new Error('deleted file must not be read');
				},
			},
		);
		expect(result).toBe(modules);
	});
	it('escapes untrusted strings inside Hono Suspense', async () => {
		const stream = renderToReadableStream(
			jsx(Suspense, {
				children: '<img src=x onerror=alert(1)>',
			}),
		);
		const html = await new Response(stream).text();
		expect(html).toContain('&lt;img');
		expect(html).not.toContain('<img');
	});
	it('escapes untrusted strings returned by the server error fallback', async () => {
		const text = '<img src=x onerror=alert(1)>';
		const Broken = () => {
			throw new Error('failed');
		};
		const stream = renderToReadableStream(
			jsx(TsrxErrorBoundary, {
				fallbackRender: () => text,
				children: jsx(Broken, {}),
			}),
		);
		const html = await new Response(stream).text();
		expect(html).toContain('&lt;img');
		expect(html).not.toContain('<img');
	});

	it('leaves other plugins virtual CSS untouched', () => {
		const plugin = tsrxHono();
		const context = create_context();
		for (const id of [
			'/other/App.tsrx?tsrx-css&lang.css',
			'/other/file.js?tsrx-css&lang.css',
			'/other/App.tsrx?tsrx-css&lang.css&raw',
		]) {
			expect(plugin.resolveId.call(context, id)).toBeNull();
			expect(plugin.load.call(context, '\0' + id)).toBeNull();
		}
	});

	it('clears removed CSS without losing the loaded virtual module', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const id = '/virtual/Styled.tsrx';
		await plugin.transform.call(
			context,
			'export function App() @{ <><style>p { color: red; }</style><p /></> }',
			id,
		);
		const css_id = plugin.resolveId.call(context, id + '?tsrx-css&lang.css');
		expect(plugin.load.call(context, css_id)).toContain('red');
		await plugin.transform.call(context, 'export function App() @{ <p /> }', id);
		expect(plugin.load.call(context, css_id)).toBe('');
		plugin.watchChange.call(context, id, { event: 'delete' });
		expect(plugin.load.call(context, css_id)).toBeNull();
	});

	it('does not keep CSS from a previous build', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const id = '/virtual/Styled.tsrx';
		await plugin.transform.call(
			context,
			'export function App() @{ <><style>p { color: red; }</style><p /></> }',
			id,
		);
		const css_id = plugin.resolveId.call(context, id + '?tsrx-css&lang.css');
		plugin.buildStart.call(context);
		expect(plugin.load.call(context, css_id)).toBeNull();
	});

	it('keeps virtual CSS isolated between Vite environments', async () => {
		const plugin = tsrxHono();
		const id = '/virtual/Styled.tsrx';
		const client_environment = {};
		const ssr_environment = {};
		const client_context = { environment: client_environment };
		const ssr_context = { environment: ssr_environment };
		const css_id = '\0' + id + '?tsrx-css&lang.css';

		await plugin.transform.call(
			client_context,
			'export function App() @{ <><style>p { color: red; }</style><p /></> }',
			id,
		);
		await plugin.transform.call(
			ssr_context,
			'export function App() @{ <><style>p { color: blue; }</style><p /></> }',
			id,
		);

		expect(plugin.load.call(client_context, css_id)).toContain('red');
		expect(plugin.load.call(ssr_context, css_id)).toContain('blue');

		plugin.buildStart.call(ssr_context);
		expect(plugin.load.call(ssr_context, css_id)).toBeNull();
		expect(plugin.load.call(client_context, css_id)).toContain('red');
	});

	it('refreshes environment-scoped virtual CSS through Vite hotUpdate', async () => {
		const plugin = tsrxHono();
		const id = '/virtual/Styled.tsrx';
		const css_id = '\0' + id + '?tsrx-css&lang.css';
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
		const context = { environment };

		await plugin.transform.call(
			context,
			'export function App() @{ <><style>p { color: red; }</style><p /></> }',
			id,
		);
		const modules = [{ id }];
		const updated_modules = await plugin.hotUpdate.call(context, {
			file: id,
			modules,
			read: async () => 'export function App() @{ <><style>p { color: blue; }</style><p /></> }',
		});

		expect(plugin.load.call(context, css_id)).toContain('blue');
		expect(invalidated).toEqual([css_module]);
		expect(updated_modules).toEqual([...modules, css_module]);
	});
});
