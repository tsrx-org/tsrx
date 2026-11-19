import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tsrxVue } from '../src/index.js';

// Pins a limit, not a feature. A keyed `@for` with `@empty` or a body that can
// skip a row renders through `VaporFor` (#178), and vue-jsx-vapor 3.2.29's
// `VaporFor` calls `createFor`, which Vue's server build doesn't have, so the
// server render throws, as it does for every `VaporFor` loop. These loops
// rendered on the server through `map_iterable` before; a vue-jsx-vapor or Vue
// release that renders `VaporFor` on the server fails this test, and the loops
// can be server-rendered again.
const FIXTURES = {
	'empty.tsrx': `export function App({ items }: { items: { id: number }[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			<li>{item.id}</li>
		} @empty {
			<p>{'none'}</p>
		}
	</ul>
}`,

	'skip.tsrx': `export function App({ items }: { items: { id: number }[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			@if (item.id > 1) {
				<li>{item.id}</li>
			}
		}
	</ul>
}`,

	'switch.tsrx': `export function App({ items }: { items: { id: number }[] }) @{
	<div>
		@switch (items.length) {
			@case 0: {
				<p>{'zero'}</p>
			}
			@default: {
				const count = items.length + ' items';
				<p>{count}</p>
			}
		}
		<ul>
			@for (const item of items; key item.id) {
				@switch (item.id) {
					@case 1: {
						<li>{'one'}</li>
					}
				}
			} @empty {
				<li>{'none'}</li>
			}
		</ul>
	</div>
}`,
};

/** @type {string} */
let dir;
/** @type {import('vite').ViteDevServer} */
let server;

beforeAll(async () => {
	dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-vapor-for-ssr-'));
	for (const [file, source] of Object.entries(FIXTURES)) writeFileSync(join(dir, file), source);
	server = await createServer({
		root: dir,
		configFile: false,
		cacheDir: join(dir, '.vite'),
		logLevel: 'silent',
		plugins: [tsrxVue()],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
	});
});

afterAll(async () => {
	await server?.close();
	rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {string} file
 * @param {{ id: number }[]} items
 */
async function render(file, items) {
	const { App } = await server.ssrLoadModule(`/${file}`);
	const html = await renderToString(createSSRApp(App, { items }));
	return html.replace(/<!--[^]*?-->/g, '');
}

describe('[vue] keyed @for through VaporFor on the server', () => {
	it('throws for a keyed loop with @empty whose source has items', async () => {
		await expect(render('empty.tsrx', [{ id: 1 }, { id: 2 }])).rejects.toThrow('createFor');
	});

	it('renders @empty for a keyed loop whose source is empty', async () => {
		expect(await render('empty.tsrx', [])).toBe('<ul><p>none</p></ul>');
	});

	it('throws for a keyed loop whose body can skip a row', async () => {
		await expect(render('skip.tsrx', [{ id: 1 }, { id: 2 }])).rejects.toThrow('createFor');
	});
});

// A `@switch` picks its case in a `computed`, which the server build has; a
// keyed loop with `@empty` whose row is a `@switch` stays on `map_iterable`.
describe('[vue] @switch on the server', () => {
	it('renders a @switch and a keyed @switch row in a loop with @empty', async () => {
		expect(await render('switch.tsrx', [{ id: 1 }, { id: 2 }])).toBe(
			'<div><p>2 items</p><ul><li>one</li></ul></div>',
		);
		expect(await render('switch.tsrx', [])).toBe('<div><p>zero</p><ul><li>none</li></ul></div>');
	});
});
