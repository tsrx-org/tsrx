import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
