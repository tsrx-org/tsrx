import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tsrxVue } from '../src/index.js';

// Vue's server build has no Vapor renderer, so the boundary renders as a
// functional VDOM component there. runtime.test.tsrx hydrates this markup.
const FIXTURES = {
	'element.tsrx': `export function App() @{
	<div>
		@try {
			<p>{'body'}</p>
		} @catch (e) {
			<b>{String(e)}</b>
		}
	</div>
}`,

	'root.tsrx': `export function App() @{
	@try {
		<p>{'body'}</p>
	} @catch (e) {
		<b>{String(e)}</b>
	}
}`,

	'inline-throws.tsrx': `function boom(): string {
	throw new Error('inline');
}
export function App() @{
	<div>
		@try {
			<p>{boom()}</p>
		} @catch (e) {
			<b>{String(e)}</b>
		}
	</div>
}`,

	'nested.tsrx': `function boom(): string {
	throw new Error('inner');
}
export function App() @{
	<div>
		@try {
			<section>
				@try {
					<p>{boom()}</p>
				} @catch (e) {
					<b>{'inner ' + String(e)}</b>
				}
			</section>
		} @catch (e) {
			<i>{'outer ' + String(e)}</i>
		}
	</div>
}`,

	'pending.tsrx': `export function App() @{
	<div>
		@try {
			<p>{'body'}</p>
		} @pending {
			<i>{'wait'}</i>
		} @catch (e) {
			<b>{String(e)}</b>
		}
	</div>
}`,

	'child-throws.tsrx': `function Bad() @{
	throw new Error('child');
	<p />
}
export function App() @{
	<div>
		@try {
			<Bad />
		} @catch (e) {
			<b>{String(e)}</b>
		}
	</div>
}`,
};

/** @type {string} */
let dir;
/** @type {import('vite').ViteDevServer} */
let server;

beforeAll(async () => {
	dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-try-ssr-'));
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

/** @param {string} file */
async function render(file) {
	const { App } = await server.ssrLoadModule(`/${file}`);
	const app = createSSRApp(App);
	/** @type {string[]} */
	const handled = [];
	app.config.errorHandler = (error) => {
		handled.push(String(error));
	};
	const html = await renderToString(app);
	return { html, handled };
}

describe('[vue] @try on the server', () => {
	it('renders the body inside an element', async () => {
		expect(await render('element.tsrx')).toEqual({ html: '<div><p>body</p></div>', handled: [] });
	});

	it('renders the body at the component root', async () => {
		expect(await render('root.tsrx')).toEqual({ html: '<p>body</p>', handled: [] });
	});

	it('renders the @catch when the body throws as it renders', async () => {
		expect(await render('inline-throws.tsrx')).toEqual({
			html: '<div><b>Error: inline</b></div>',
			handled: [],
		});
	});

	it('renders the @catch of the @try nearest the throw', async () => {
		expect(await render('nested.tsrx')).toEqual({
			html: '<div><section><b>inner Error: inner</b></section></div>',
			handled: [],
		});
	});

	it('renders the body of a @try with @pending', async () => {
		expect(await render('pending.tsrx')).toEqual({ html: '<div><p>body</p></div>', handled: [] });
	});

	// Pins a limit: a component in the body throws as the server renders it,
	// after the boundary has rendered, so Vue reports it and leaves a comment.
	it('reports a throw from a component in the body to errorHandler', async () => {
		expect(await render('child-throws.tsrx')).toEqual({
			html: '<div><!----></div>',
			handled: ['Error: child'],
		});
	});
});
