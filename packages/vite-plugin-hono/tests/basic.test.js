import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
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

describe('@tsrx/vite-plugin-hono', () => {
	it('compiles server TSRX through the Hono automatic JSX runtime', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const id = '/virtual/App.tsrx';
		const transformed = await plugin.transform.call(
			context,
			`export function App() @{ <div class="app">{'Hello'}</div> }`,
			id,
		);

		expect(transformed).not.toBeNull();
		expect(transformed.code).toContain('hono/jsx/jsx-runtime');
		expect(transformed.code).toContain('class');
	});

	it('runs transformed server modules with Hono SSR', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const directory = await mkdtemp(
			path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-hono-'),
		);

		try {
			const source_id = path.join(directory, 'App.tsrx');
			const output_id = path.join(directory, 'App.js');
			const transformed = await plugin.transform.call(
				context,
				`export async function App({ items }) @{
					const title = await Promise.resolve('Hono');
					<>
						<h1>{title}</h1>
						<ul>
							@for (const item of items) {
								<li class="item">{item}</li>
							}
						</ul>
					</>
				}`,
				source_id,
			);
			await writeFile(output_id, transformed.code);

			const [{ App }, { jsx }, { renderToReadableStream }] = await Promise.all([
				import(`${pathToFileURL(output_id).href}?test=${Date.now()}`),
				import('hono/jsx'),
				import('hono/jsx/streaming'),
			]);

			const stream = await renderToReadableStream(jsx(App, { items: ['one', 'two'] }));
			let html = '';
			for await (const chunk of stream) html += new TextDecoder().decode(chunk);

			expect(html).toContain('<h1>Hono</h1>');
			expect(html).toContain('<li class="item">one</li><li class="item">two</li>');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('works with c.html, c.render, and the JSX renderer context', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const directory = await mkdtemp(
			path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-hono-renderer-'),
		);

		try {
			const source_id = path.join(directory, 'Page.tsrx');
			const output_id = path.join(directory, 'Page.js');
			const transformed = await plugin.transform.call(
				context,
				`import { useRequestContext } from 'hono/jsx-renderer';

				export function SimplePage() @{
					<p>{'html page'}</p>
				}

				export function Page() @{
					const context = useRequestContext();
					<p>{context.req.path}</p>
				}`,
				source_id,
			);
			await writeFile(output_id, transformed.code);

			const [{ Page, SimplePage }, { Hono }, { jsx }, { jsxRenderer }] = await Promise.all([
				import(`${pathToFileURL(output_id).href}?test=${Date.now()}`),
				import('hono'),
				import('hono/jsx'),
				import('hono/jsx-renderer'),
			]);

			const app = new Hono();
			app.get('/html', (c) => c.html(jsx(SimplePage, {})));
			app.use(
				'/page/*',
				jsxRenderer(({ children }) =>
					jsx(
						'html',
						null,
						jsx('body', null, ...(Array.isArray(children) ? children : [children])),
					),
				),
			);
			app.get('/page/info', (c) => c.render(jsx(Page, {})));

			expect(await (await app.request('/html')).text()).toContain('<p>html page</p>');
			expect(await (await app.request('/page/info')).text()).toContain('<p>/page/info</p>');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('preserves Hono StreamingContext around generated Suspense output', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const directory = await mkdtemp(
			path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-hono-streaming-'),
		);

		try {
			const source_id = path.join(directory, 'StreamingPage.tsrx');
			const output_id = path.join(directory, 'StreamingPage.js');
			const transformed = await plugin.transform.call(
				context,
				`import { StreamingContext, Suspense } from 'hono/jsx/streaming';

				async function AsyncContent() {
					await Promise.resolve();
					return <span>{'ready'}</span>;
				}

				export function StreamingPage() @{
					<StreamingContext value={{ scriptNonce: 'test-nonce' }}>
						<Suspense fallback={<span>{'loading'}</span>}>
							<AsyncContent />
						</Suspense>
					</StreamingContext>
				}`,
				source_id,
			);
			await writeFile(output_id, transformed.code);

			const [{ StreamingPage }, { jsx }, { renderToReadableStream }] = await Promise.all([
				import(`${pathToFileURL(output_id).href}?test=${Date.now()}`),
				import('hono/jsx'),
				import('hono/jsx/streaming'),
			]);
			const stream = renderToReadableStream(jsx(StreamingPage, {}));
			expect(await new Response(stream).text()).toMatch(/<script[^>]*nonce="test-nonce"/);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('preserves the StreamingContext nonce in the TSRX ErrorBoundary output', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const directory = await mkdtemp(
			path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-hono-error-streaming-'),
		);

		try {
			const source_id = path.join(directory, 'ErrorStreamingPage.tsrx');
			const output_id = path.join(directory, 'ErrorStreamingPage.js');
			const transformed = await plugin.transform.call(
				context,
				`import { StreamingContext } from 'hono/jsx/streaming';

				async function DelayedContent() {
					await Promise.resolve();
					return <span>{'ready'}</span>;
				}

				export function ErrorStreamingPage() @{
					<StreamingContext value={{ scriptNonce: 'test-nonce' }}>
						@try {
							<DelayedContent />
						} @catch (error) {
							<span>{error.message}</span>
						}
					</StreamingContext>
				}`,
				source_id,
			);
			await writeFile(output_id, transformed.code);

			const [{ ErrorStreamingPage }, { jsx }, { renderToReadableStream }] = await Promise.all([
				import(`${pathToFileURL(output_id).href}?test=${Date.now()}`),
				import('hono/jsx'),
				import('hono/jsx/streaming'),
			]);
			const stream = renderToReadableStream(jsx(ErrorStreamingPage, {}));
			const html = await new Response(stream).text();
			expect(html).toMatch(/<script[^>]*nonce="test-nonce"/);
			expect(html).toContain('<span>ready</span>');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('selects the Hono DOM runtime and forwards direct runtime imports', async () => {
		const plugin = tsrxHono({ mode: 'dom', runtimeImports: 'direct' });
		const transformed = await plugin.transform.call(
			create_context(),
			`export function App(props) @{
				@try {
					<input {...props} />
				} @catch (error) {
					<p>{error.message}</p>
				}
			}`,
			'/virtual/App.tsrx',
		);

		expect(transformed.code).toContain('hono/jsx/dom/jsx-runtime');
		expect(transformed.code).toContain('@tsrx/core/runtime/ref');
		expect(transformed.code).toContain('@tsrx/hono/dom/error-boundary');
	});

	it('only transforms .tsrx files for the selected build mode', async () => {
		const dom = tsrxHono({ mode: 'dom' });
		const source = 'export function App() @{ <div /> }';

		for (const extension of ['.ts', '.tsx', '.js']) {
			expect(await dom.transform.call(create_context(), source, `/src/App${extension}`)).toBeNull();
		}
		const result = await dom.transform.call(create_context(), source, '/src/App.tsrx');
		expect(result.code).toContain('hono/jsx/dom/jsx-runtime');
	});

	it('rejects an invalid mode instead of silently selecting server', () => {
		expect(() => tsrxHono({ mode: /** @type {any} */ ('dmo') })).toThrow(/invalid mode/);
	});

	it('specializes platform flags and defines them for Vite', async () => {
		const plugin = tsrxHono({ platform: 'web' });
		const config = plugin.config({});
		const environment_config = plugin.configEnvironment('client', {});
		const source = `if (import.meta.env.platform.web) {
			const selected_web = 'selected_web';
		} else {
			const selected_native = 'selected_native';
		}`;
		const transformed = await plugin.transform.call(
			create_context(),
			source,
			'/virtual/Platform.tsrx',
		);

		expect(config.define['import.meta.env.platform.web']).toBe(true);
		expect(config.define['import.meta.env.platform.ios']).toBe(false);
		expect(environment_config.define['import.meta.env.platform.web']).toBe(true);
		expect(transformed.code).toContain('selected_web');
		expect(transformed.code).not.toContain('selected_native');
	});

	it('reads the platform from the Vite project tsconfig', async () => {
		const directory = await mkdtemp(
			path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-hono-platform-'),
		);

		try {
			await writeFile(
				path.join(directory, 'tsconfig.json'),
				JSON.stringify({ tsrx: { platform: 'ios' } }),
			);
			const plugin = tsrxHono();
			const config = plugin.config({ root: directory });
			const transformed = await plugin.transform.call(
				create_context(),
				`if (import.meta.env.platform.ios) {
					const selected_ios = 'selected_ios';
				} else {
					const selected_other = 'selected_other';
				}`,
				path.join(directory, 'Platform.tsrx'),
			);

			expect(config.define['import.meta.env.platform.ios']).toBe(true);
			expect(transformed.code).toContain('selected_ios');
			expect(transformed.code).not.toContain('selected_other');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('emits and refreshes virtual CSS', async () => {
		const plugin = tsrxHono();
		const css_module = { id: '\0/virtual/App.tsrx?tsrx-css&lang.css' };
		const invalidated = [];
		const context = create_context({
			getModuleById(module_id) {
				return module_id === css_module.id ? css_module : undefined;
			},
			invalidateModule(module) {
				invalidated.push(module);
			},
		});
		const id = '/virtual/App.tsrx';
		const source = `export function App() @{
			<><div class="app">{'Hello'}</div>
			<style>.app { color: red; }</style></>
		}`;
		const updated_source = `export function App() @{
			<><div class="app">{'Hello'}</div>
			<style>.app { color: blue; }</style></>
		}`;

		const transformed = await plugin.transform.call(context, source, id);
		const virtual_id = `${id}?tsrx-css&lang.css`;
		const resolved_id = plugin.resolveId.call(context, virtual_id);
		expect(transformed.code).toContain(virtual_id);
		expect(plugin.load.call(context, resolved_id)).toContain('color: red;');

		const modules = await plugin.hotUpdate.call(context, {
			file: id,
			modules: [{ id }],
			read: async () => updated_source,
		});

		expect(plugin.load.call(context, resolved_id)).toContain('color: blue;');
		expect(invalidated).toEqual([css_module]);
		expect(modules).toContain(css_module);
	});

	it('does not read or compile a file without a loaded virtual CSS module', async () => {
		const plugin = tsrxHono();
		const context = create_context();
		const modules = [{ id: '/virtual/App.tsrx' }];
		const result = await plugin.hotUpdate.call(context, {
			file: '/virtual/App.tsrx',
			modules,
			read: async () => {
				throw new Error('source should not be read');
			},
		});

		expect(result).toBe(modules);
	});

	it('registers Hono JSX runtime dependencies for optimizeDeps', () => {
		const plugin = tsrxHono({ mode: 'dom' });
		const config = plugin.configEnvironment('client', {});
		expect(config.optimizeDeps.extensions).toContain('.tsrx');
		expect(config.optimizeDeps.rolldownOptions.transform.jsx.importSource).toBe('hono/jsx/dom');
		expect(config.optimizeDeps.rolldownOptions.plugins).toHaveLength(1);
		expect(plugin.configEnvironment('ssr', {})).toBeUndefined();
	});

	it('uses the core dep-scan filter without path-specific exclusions', async () => {
		const plugin = tsrxHono({ mode: 'dom' });
		const scan_plugin = plugin.configEnvironment('client', {}).optimizeDeps.rolldownOptions
			.plugins[0];
		const filter = scan_plugin.transform.filter.id;

		expect(filter).toEqual(/\.tsrx$/);
		const result = await scan_plugin.transform.handler(
			'export function App() @{ <div /> }',
			'/src/other/App.tsrx',
		);
		expect(result?.code).toContain('hono/jsx/dom');
	});
});
