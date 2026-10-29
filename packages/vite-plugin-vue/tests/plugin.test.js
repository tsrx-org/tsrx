import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
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
 * Pluck the main tsrx-vue plugin (the one with the load hook for `.tsrx.tsx`
 * virtual ids) out of the array returned by `tsrxVue()`.
 */
function get_main_plugin(options) {
	const plugins = tsrxVue(options);
	const main = plugins.find((p) => p.name === '@tsrx/vite-plugin-vue');
	if (!main) throw new Error('@tsrx/vite-plugin-vue plugin not found');
	return main;
}

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
