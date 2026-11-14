import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tsrxVue } from '../src/index.js';

// A keyed `@for` row whose body is a fragment, in a loop that doesn't render
// through `VaporFor`, server-rendered through Vite and vue-jsx-vapor (#179).
// vue-jsx-vapor's server build passes a `<Fragment>`'s children as an array
// only when the tag is spelled `Fragment`.
const FIXTURES = {
	'empty.tsrx': `export function App({ items }: { items: { id: number }[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			<>
				<li>{item.id}</li>
			</>
		} @empty {
			<p>{'none'}</p>
		}
	</ul>
}`,

	'setup.tsrx': `export function App({ items }: { items: { id: number }[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			const label = 'item ' + item.id;
			<>
				<li>{label}</li>
				<li>{item.id}</li>
			</>
		}
	</ul>
}`,

	'vue-import.tsrx': `import { Fragment, ref } from 'vue';
export function App({ items }: { items: { id: number }[] }) @{
	const count = ref(1);
	<Fragment>
		<ul>
			@for (const item of items; key item.id) {
				<>
					<li>{item.id * count.value}</li>
				</>
			} @empty {
				<p>{'none'}</p>
			}
		</ul>
	</Fragment>
}`,
};

/** @type {string} */
let dir;
/** @type {import('vite').ViteDevServer} */
let server;

beforeAll(async () => {
	dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-keyed-fragment-ssr-'));
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

describe('[vue] keyed fragment rows on the server (#179)', () => {
	it('renders a keyed fragment body in a loop with @empty', async () => {
		expect(await render('empty.tsrx', [{ id: 1 }, { id: 2 }])).toBe(
			'<ul><li>1</li><li>2</li></ul>',
		);
		expect(await render('empty.tsrx', [])).toBe('<ul><p>none</p></ul>');
	});

	it('renders a keyed fragment body after setup statements', async () => {
		expect(await render('setup.tsrx', [{ id: 1 }, { id: 2 }])).toBe(
			'<ul><li>item 1</li><li>1</li><li>item 2</li><li>2</li></ul>',
		);
	});

	it('renders beside an authored import of Fragment from vue', async () => {
		expect(await render('vue-import.tsrx', [{ id: 2 }])).toBe('<ul><li>2</li></ul>');
	});
});
