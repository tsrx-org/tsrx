import { mkdtempSync, writeFileSync } from 'node:fs';
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
