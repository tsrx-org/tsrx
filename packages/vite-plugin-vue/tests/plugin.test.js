import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { tsrxVue } from '../src/index.js';

/**
 * @param {import('vite').Plugin} plugin
 * @param {string} id
 */
function call_load(plugin, id) {
	const hook = typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler;
	if (!hook) throw new Error('plugin has no load hook');
	return hook.call(/** @type {any} */ ({}), id);
}

/**
 * @param {import('vite').Plugin} plugin
 * @param {string} source
 * @param {(source: string) => Promise<{ id: string } | null>} resolve
 */
function call_resolve_id(plugin, source, resolve) {
	const hook =
		typeof plugin.resolveId === 'function' ? plugin.resolveId : plugin.resolveId?.handler;
	if (!hook) throw new Error('plugin has no resolveId hook');
	const context = /** @type {ThisParameterType<typeof hook>} */ ({ resolve });
	return hook.call(context, source, undefined, { isEntry: false });
}

/**
 * Pluck the main tsrx-vue plugin (the one with the load hook for `.tsrx.tsx`
 * virtual ids) out of the array returned by `tsrxVue()`.
 */
function get_main_plugin(options) {
	const plugins = tsrxVue(options);
	const main = plugins.find((p) => p.name === '@tsrx/vite-plugin-vue');
	if (!main) throw new Error('@tsrx/vite-plugin-vue plugin not found');
	return main;
}

describe('@tsrx/vite-plugin-vue module resolution', () => {
	it('rewrites a specifier without an extension that resolves to a `.tsrx` file', async () => {
		const resolve = async () => ({ id: '/abs/node_modules/fixture-lib/App.tsrx' });
		const result = await call_resolve_id(get_main_plugin(), 'fixture-lib', resolve);
		expect(/** @type {any} */ (result).id).toBe('/abs/node_modules/fixture-lib/App.tsrx.tsx');
	});

	it('passes the resolution of a specifier for another file through unchanged', async () => {
		const resolve = async () => ({ id: '/abs/node_modules/vue/index.js' });
		expect(await call_resolve_id(get_main_plugin(), 'vue', resolve)).toEqual({
			id: '/abs/node_modules/vue/index.js',
		});
	});

	it('leaves a virtual or query-suffixed resolution of a `.tsrx` path alone', async () => {
		for (const id of ['\0virtual:App.tsrx', '/abs/path/App.tsrx?inline']) {
			const resolve = async () => ({ id });
			expect(await call_resolve_id(get_main_plugin(), 'virtual-app', resolve)).toEqual({ id });
		}
	});
});

describe('@tsrx/vite-plugin-vue source maps', () => {
	it('forwards direct runtime imports to the compiler', async () => {
		const plugin = get_main_plugin({ runtimeImports: 'direct' });
		const dir = mkdtempSync(join(tmpdir(), 'tsrx-vue-runtime-'));
		const real_path = join(dir, 'App.tsrx');
		writeFileSync(
			real_path,
			`export function App(props) @{
				<input {...props} />
			}`,
		);

		const result = await call_load(plugin, real_path + '.tsx');
		expect(/** @type {any} */ (result).code).toContain("from '@tsrx/vue-runtime/ref'");
	});

	it('maps the compiled output back to the original tsrx source', async () => {
		const plugin = get_main_plugin();
		const dir = mkdtempSync(join(tmpdir(), 'tsrx-vue-'));
		const real_path = join(dir, 'App.tsrx');
		const source = `export function App() @{
			const message = 'Hello world';
			<div>{message}</div>
		}`;
		writeFileSync(real_path, source);

		const result = await call_load(plugin, real_path + '.tsx');

		expect(result).toBeTruthy();
		expect(/** @type {any} */ (result).map.sources).toEqual([real_path]);
		expect(/** @type {any} */ (result).map.sourcesContent).toEqual([source]);
	});
});

it('refreshes scoped CSS before updated virtual JS loads and clears removed styles', async () => {
	const plugin = get_main_plugin();
	const directory = mkdtempSync(join(tmpdir(), 'tsrx-vue-hmr-'));
	const file = join(directory, 'App.tsrx');
	const virtual_id = file + '.tsx';
	const css_module = { id: file + '?tsrx-vue-css&lang.css' };
	const js_module = { id: virtual_id };
	const source = `export function App() @{
		<>
			<style>.content { color: red; }</style>
			<div class="content">Before</div>
		</>
	}`;
	let updated = source.replace('red', 'blue').replace('Before', 'After');
	const handle_hot_update = /** @type {(ctx: any) => Promise<any[]>} */ (plugin.handleHotUpdate);
	const context = {
		file,
		modules: [],
		read: async () => updated,
		server: {
			moduleGraph: {
				getModulesByFile: () => new Set([js_module]),
				getModuleById: () => css_module,
			},
		},
	};
	try {
		writeFileSync(file, source);
		await call_load(plugin, virtual_id);
		expect(await call_load(plugin, css_module.id)).toContain('color: red');

		writeFileSync(file, updated);
		const modules = await handle_hot_update(context);
		const css = await call_load(plugin, css_module.id);
		expect(css).toContain('color: blue');
		expect(css).not.toContain('color: red');
		if (typeof css !== 'string') throw new Error('expected CSS text');
		const hash = css.match(/tsrx-[a-f0-9]+/)?.[0];
		expect(hash).toBeDefined();
		const javascript = await call_load(plugin, virtual_id);
		expect(/** @type {any} */ (javascript).code).toContain(hash);
		expect(modules).toEqual([js_module, css_module]);

		updated = 'export function App() @{ <div>Without styles</div> }';
		writeFileSync(file, updated);
		await handle_hot_update(context);
		expect(await call_load(plugin, css_module.id)).toBe('');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('@tsrx/vite-plugin-vue module ids', () => {
	it('anchors a root-relative virtual id to the file under the root', async () => {
		// Vitest asks for a test module by its URL. Imports from the module
		// resolve against its id, so the id has to be the real file.
		const root = mkdtempSync(join(tmpdir(), 'tsrx-vue-root-'));
		mkdirSync(join(root, 'tests'));
		writeFileSync(join(root, 'tests', 'App.test.tsrx'), '');
		const plugin = get_main_plugin();
		/** @type {any} */ (plugin).configResolved({ root });
		const hook = /** @type {any} */ (plugin).resolveId;
		/** @param {string} source */
		const resolve_id = (source) =>
			hook.call(
				// Vite's resolver, which spells a path as given here
				{ resolve: async (/** @type {string} */ id) => ({ id, external: false }) },
				source,
				undefined,
				{ isEntry: false },
			);

		const virtual_id = join(root, 'tests', 'App.test.tsrx.tsx');
		expect(await resolve_id('/tests/App.test.tsrx.tsx')).toBe(virtual_id);
		expect(await resolve_id(virtual_id)).toBe(virtual_id);
	});

	it('spells an anchored id the way Vite resolves the file, through a symlinked root', async () => {
		const real_root = realpathSync(mkdtempSync(join(tmpdir(), 'tsrx-vue-real-')));
		mkdirSync(join(real_root, 'tests'));
		writeFileSync(join(real_root, 'tests', 'App.test.tsrx'), '');
		const link_root = join(realpathSync(mkdtempSync(join(tmpdir(), 'tsrx-vue-link-'))), 'root');
		symlinkSync(real_root, link_root, 'dir');
		const server = await createServer({
			root: link_root,
			configFile: false,
			logLevel: 'silent',
			plugins: [tsrxVue()],
			server: { middlewareMode: true, hmr: false },
			appType: 'custom',
			optimizeDeps: { noDiscovery: true },
		});
		try {
			const by_url = await server.pluginContainer.resolveId('/tests/App.test.tsrx.tsx');
			const by_import = await server.pluginContainer.resolveId(
				'./tests/App.test.tsrx',
				join(link_root, 'main.ts'),
			);
			expect(by_url?.id).toBe(join(real_root, 'tests', 'App.test.tsrx.tsx'));
			expect(by_url?.id).toBe(by_import?.id);
		} finally {
			await server.close();
		}
	});
});
