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

	'clone-slot.tsrx': `import { cloneVNode } from 'vue';
const Clone = {
	setup(_: unknown, { slots }: any) {
		return () => cloneVNode(slots.default()[0], { id: 'injected' });
	},
};
export function App() @{
	@try {
		<Clone><button>{'body'}</button></Clone>
	} @catch (e) {
		<b>{String(e)}</b>
	}
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
/** @type {Record<string, import('vite').ViteDevServer>} */
const servers = {};

// Vue's bundler build, which a server resolves without the `node` condition
// (an edge or worker runtime, or an SSR bundle), has the Vapor renderer;
// Vue's Node build has not.
const BUNDLER_CONDITIONS = ['import', 'module', 'browser', 'default'];

beforeAll(async () => {
	dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-try-ssr-'));
	for (const [file, source] of Object.entries(FIXTURES)) writeFileSync(join(dir, file), source);
	writeFileSync(
		join(dir, 'vue-entry.js'),
		"export { createSSRApp } from 'vue';\nexport { renderToString } from 'vue/server-renderer';\n",
	);
	/** @type {import('vite').InlineConfig} */
	const config = {
		root: dir,
		configFile: false,
		logLevel: 'silent',
		plugins: [tsrxVue()],
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
	};
	servers.node = await createServer({ ...config, cacheDir: join(dir, '.vite') });
	servers.bundler = await createServer({
		...config,
		cacheDir: join(dir, '.vite-bundler'),
		resolve: { conditions: BUNDLER_CONDITIONS },
		ssr: {
			noExternal: true,
			resolve: { conditions: BUNDLER_CONDITIONS, externalConditions: BUNDLER_CONDITIONS },
		},
		define: {
			__VUE_OPTIONS_API__: 'true',
			__VUE_PROD_DEVTOOLS__: 'false',
			__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
		},
	});
});

afterAll(async () => {
	await Promise.all(Object.values(servers).map((server) => server.close()));
	rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {'node' | 'bundler'} build
 * @param {string} file
 */
async function render(build, file) {
	const server = servers[build];
	const { App } = await server.ssrLoadModule(`/${file}`);
	const vue =
		build === 'node'
			? { createSSRApp, renderToString }
			: await server.ssrLoadModule('/vue-entry.js');
	const app = vue.createSSRApp(App);
	/** @type {string[]} */
	const handled = [];
	app.config.errorHandler = (/** @type {unknown} */ error) => {
		handled.push(String(error));
	};
	const html = await vue.renderToString(app);
	return { html, handled };
}

describe.each(/** @type {const} */ (['node', 'bundler']))(
	'[vue] @try on the server (%s build)',
	(build) => {
		it('renders the body inside an element', async () => {
			expect(await render(build, 'element.tsrx')).toEqual({
				html: '<div><p>body</p></div>',
				handled: [],
			});
		});

		it('renders the body at the component root', async () => {
			expect(await render(build, 'root.tsrx')).toEqual({ html: '<p>body</p>', handled: [] });
		});

		it('renders the @catch when the body throws as it renders', async () => {
			expect(await render(build, 'inline-throws.tsrx')).toEqual({
				html: '<div><b>Error: inline</b></div>',
				handled: [],
			});
		});

		it('renders the @catch of the @try nearest the throw', async () => {
			expect(await render(build, 'nested.tsrx')).toEqual({
				html: '<div><section><b>inner Error: inner</b></section></div>',
				handled: [],
			});
		});

		it('renders the body of a @try with @pending', async () => {
			expect(await render(build, 'pending.tsrx')).toEqual({
				html: '<div><p>body</p></div>',
				handled: [],
			});
		});

		// The boundary renders as a functional VDOM component there, so the slots
		// of what it creates stay VDOM slots, which a component can clone.
		it('keeps what a component in the body adds to a cloned slot child', async () => {
			expect(await render(build, 'clone-slot.tsrx')).toEqual({
				html: '<button id="injected">body</button>',
				handled: [],
			});
		});

		// Pins a limit: a component in the body throws as the server renders it,
		// after the boundary has rendered, so Vue reports it and leaves a comment.
		it('reports a throw from a component in the body to errorHandler', async () => {
			expect(await render(build, 'child-throws.tsrx')).toEqual({
				html: '<div><!----></div>',
				handled: ['Error: child'],
			});
		});
	},
);
