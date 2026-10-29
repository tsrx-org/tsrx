import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { tsrxSolid } from '../src/index.js';

/**
 * Minimal `this` stub for Vite plugin hooks that only need `this.resolve`
 * during the tests — we simulate a successful resolve so the plugin takes
 * the "rewrite to virtual id" path.
 *
 * @param {string} source
 * @returns {Promise<{ id: string, external: false, moduleSideEffects: true, meta: {} }>}
 */
async function fake_plugin_resolve(source) {
	return { id: source, external: false, moduleSideEffects: true, meta: {} };
}

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
 */
function call_resolve_id(plugin, source) {
	const hook =
		typeof plugin.resolveId === 'function' ? plugin.resolveId : plugin.resolveId?.handler;
	if (!hook) throw new Error('plugin has no resolveId hook');
	const context = /** @type {ThisParameterType<typeof hook>} */ ({ resolve: fake_plugin_resolve });
	return hook.call(context, source, undefined, { isEntry: false });
}

/**
 * @param {unknown} result
 * @returns {string | undefined}
 */
function resolved_id(result) {
	return typeof result === 'object' && result !== null && 'id' in result
		? String(result.id)
		: undefined;
}

describe('@tsrx/vite-plugin-solid routing', () => {
	it('anchors a root-relative virtual id to the file under the root', async () => {
		// Vitest asks for a test module by its URL. Imports from the module
		// resolve against its id, so the id has to be the real file.
		const root = mkdtempSync(join(tmpdir(), 'tsrx-solid-root-'));
		mkdirSync(join(root, 'tests'));
		writeFileSync(join(root, 'tests', 'App.test.tsrx'), '');
		const plugin = tsrxSolid();
		/** @type {any} */ (plugin).configResolved({ root });

		const virtual_id = join(root, 'tests', 'App.test.tsrx.tsx');
		expect(await call_resolve_id(plugin, '/tests/App.test.tsrx.tsx')).toBe(virtual_id);
		expect(await call_resolve_id(plugin, virtual_id)).toBe(virtual_id);
	});

	it('spells an anchored id the way Vite resolves the file, through a symlinked root', async () => {
		const real_root = realpathSync(mkdtempSync(join(tmpdir(), 'tsrx-solid-real-')));
		mkdirSync(join(real_root, 'tests'));
		writeFileSync(join(real_root, 'tests', 'App.test.tsrx'), '');
		const link_root = join(realpathSync(mkdtempSync(join(tmpdir(), 'tsrx-solid-link-'))), 'root');
		symlinkSync(real_root, link_root, 'dir');
		const server = await createServer({
			root: link_root,
			configFile: false,
			logLevel: 'silent',
			plugins: [tsrxSolid()],
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

	it('forwards direct runtime imports to the compiler', async () => {
		const plugin = tsrxSolid({ runtimeImports: 'direct' });
		const dir = mkdtempSync(join(tmpdir(), 'tsrx-solid-runtime-'));
		const real_path = join(dir, 'App.tsrx');
		writeFileSync(
			real_path,
			`export function App(props) @{
				<input {...props} />
			}`,
		);

		const result = await call_load(plugin, real_path + '.tsx');
		expect(/** @type {any} */ (result).code).toContain("from '@tsrx/solid-runtime/ref'");
	});

	describe('default include', () => {
		const plugin = tsrxSolid();

		it('rewrites `.tsrx` imports to a virtual `.tsx` id', async () => {
			const result = await call_resolve_id(plugin, '/abs/path/App.tsrx');
			expect(resolved_id(result)).toBe('/abs/path/App.tsrx.tsx');
		});

		it('leaves unrelated extensions alone', async () => {
			expect(await call_resolve_id(plugin, '/abs/path/App.ts')).toBeNull();
			expect(await call_resolve_id(plugin, '/abs/path/App.tsx')).toBeNull();
			expect(await call_resolve_id(plugin, 'solid-js')).toBeNull();
		});
	});

	describe('custom include regex', () => {
		it('respects the user-supplied pattern for additional extensions', async () => {
			const plugin = tsrxSolid({ include: /\.(tsrx|foo)$/ });
			const tsrx = await call_resolve_id(plugin, '/abs/path/App.tsrx');
			const foo = await call_resolve_id(plugin, '/abs/path/Other.foo');
			expect(resolved_id(tsrx)).toBe('/abs/path/App.tsrx.tsx');
			expect(resolved_id(foo)).toBe('/abs/path/Other.foo.tsx');
		});

		it('narrows routing when the pattern is stricter than the default', async () => {
			// User opts to only process `.tsrx` files under `src/`.
			const plugin = tsrxSolid({ include: /\/src\/.*\.tsrx$/ });
			const matched = await call_resolve_id(plugin, '/proj/src/App.tsrx');
			const skipped = await call_resolve_id(plugin, '/proj/tests/App.tsrx');
			expect(resolved_id(matched)).toBe('/proj/src/App.tsrx.tsx');
			expect(skipped).toBeNull();
		});
	});

	describe('source maps', () => {
		it('maps the compiled output back to the original tsrx source', async () => {
			const plugin = tsrxSolid();
			const dir = mkdtempSync(join(tmpdir(), 'tsrx-solid-'));
			const real_path = join(dir, 'App.tsrx');
			const source = `export function App() { return <>
				const message = 'Hello world';
				<div>{message}</div>
			</>; }`;
			writeFileSync(real_path, source);

			const result = await call_load(plugin, real_path + '.tsx');

			expect(result).toBeTruthy();
			expect(/** @type {any} */ (result).map.sources).toEqual([real_path]);
			expect(/** @type {any} */ (result).map.sourcesContent).toEqual([source]);
		});
	});
});
