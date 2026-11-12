import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
 * @param {{ ssr?: boolean }} [options] the hook's options
 * @param {object} [context] the hook's `this`
 */
function call_load(plugin, id, options, context = {}) {
	const hook = typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler;
	if (!hook) throw new Error('plugin has no load hook');
	return hook.call(/** @type {any} */ (context), id, options);
}

/**
 * @param {import('vite').Plugin} plugin
 * @param {string} source
 * @param {typeof fake_plugin_resolve} [resolve]
 */
function call_resolve_id(plugin, source, resolve = fake_plugin_resolve) {
	const hook =
		typeof plugin.resolveId === 'function' ? plugin.resolveId : plugin.resolveId?.handler;
	if (!hook) throw new Error('plugin has no resolveId hook');
	const context = /** @type {ThisParameterType<typeof hook>} */ ({ resolve });
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

		it('passes the resolution of unrelated extensions through unchanged', async () => {
			for (const source of ['/abs/path/App.ts', '/abs/path/App.tsx', 'solid-js']) {
				expect(resolved_id(await call_resolve_id(plugin, source))).toBe(source);
			}
		});

		it('leaves a virtual or query-suffixed resolution of a `.tsrx` path alone', async () => {
			for (const id of ['\0virtual:App.tsrx', '/abs/path/App.tsrx?inline']) {
				/** @param {string} source */
				const resolve = async (source) => ({ ...(await fake_plugin_resolve(source)), id });
				expect(resolved_id(await call_resolve_id(plugin, 'virtual-app', resolve))).toBe(id);
			}
		});

		it('rewrites a specifier without an extension that resolves to a `.tsrx` file', async () => {
			/** @param {string} source */
			const resolve = async (source) => ({
				...(await fake_plugin_resolve(source)),
				id: '/abs/node_modules/fixture-lib/App.tsrx',
			});
			const result = await call_resolve_id(plugin, 'fixture-lib', resolve);
			expect(resolved_id(result)).toBe('/abs/node_modules/fixture-lib/App.tsrx.tsx');
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
			expect(resolved_id(skipped)).toBe('/proj/tests/App.tsrx');
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

	// #1291: with `ssr` on, as in `solid({ ssr: true })`, vite-plugin-solid
	// compiles a server build to babel-preset-solid's SSR output, which moves
	// this `yield` into an arrow; the DOM output doesn't. So only a server
	// build with the option on reports it (TSRX2034).
	describe('server builds', () => {
		const dir = mkdtempSync(join(tmpdir(), 'tsrx-solid-ssr-'));
		const real_path = join(dir, 'Field.tsrx');
		const source = `export function* field(bag: any) {\n\treturn <input {...bag} title={yield 1} />;\n}`;
		writeFileSync(real_path, source);
		const id = real_path + '.tsx';
		const server = { environment: { config: { consumer: 'server' } } };
		const client = { environment: { config: { consumer: 'client' } } };
		const server_error = expect.objectContaining({
			code: 'TSRX2034',
			pos: source.indexOf('yield'),
		});

		/** @param {Promise<unknown>} result */
		const compiles = async (result) =>
			expect(/** @type {any} */ (await result).code).toContain('title={yield 1}');

		it("follows the SSR output with `ssr` on, on Vite's `ssr` flag", async () => {
			const plugin = tsrxSolid({ ssr: true });
			await expect(call_load(plugin, id, { ssr: true })).rejects.toThrow(server_error);
		});

		it('follows the SSR output with `ssr` on, in a Vite 6+ server environment', async () => {
			const plugin = tsrxSolid({ ssr: true });
			await expect(call_load(plugin, id, undefined, server)).rejects.toThrow(server_error);
			await expect(call_load(plugin, id, { ssr: true }, server)).rejects.toThrow(server_error);
		});

		it('keeps the DOM output rules in a server build with `ssr` off', async () => {
			// As vite-plugin-solid does with `solid()`, e.g. a Vitest `node` environment.
			for (const plugin of [tsrxSolid(), tsrxSolid({ ssr: false })]) {
				await compiles(call_load(plugin, id, { ssr: true }));
				await compiles(call_load(plugin, id, undefined, server));
			}
		});

		it('keeps the DOM output rules in a client build', async () => {
			const plugin = tsrxSolid({ ssr: true });
			await compiles(call_load(plugin, id));
			await compiles(call_load(plugin, id, { ssr: false }));
			await compiles(call_load(plugin, id, undefined, client));
			await compiles(call_load(plugin, id, { ssr: false }, client));
		});
	});
});

it('refreshes scoped CSS before updated virtual JS loads and clears removed styles', async () => {
	const plugin = tsrxSolid();
	const directory = mkdtempSync(join(tmpdir(), 'tsrx-solid-hmr-'));
	const file = join(directory, 'App.tsrx');
	const virtual_id = file + '.tsx';
	const css_module = { id: file + '?tsrx-solid-css&lang.css' };
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

it('keeps the last good CSS and still reloads the module when an update does not compile', async () => {
	const plugin = tsrxSolid();
	const directory = mkdtempSync(join(tmpdir(), 'tsrx-solid-hmr-'));
	const file = join(directory, 'App.tsrx');
	const virtual_id = file + '.tsx';
	const css_module = { id: file + '?tsrx-solid-css&lang.css' };
	const js_module = { id: virtual_id };
	const source = `export function App() @{
		<>
			<style>.content { color: red; }</style>
			<div class="content">Before</div>
		</>
	}`;
	// The `<div>` is left open, which the compiler rejects.
	const broken = source.replace('</div>', '');
	const handle_hot_update = /** @type {(ctx: any) => Promise<any[]>} */ (plugin.handleHotUpdate);
	try {
		writeFileSync(file, source);
		await call_load(plugin, virtual_id);

		writeFileSync(file, broken);
		const modules = await handle_hot_update({
			file,
			modules: [],
			read: async () => broken,
			server: {
				moduleGraph: {
					getModulesByFile: () => new Set([js_module]),
					getModuleById: () => css_module,
				},
			},
		});
		// The virtual module still reloads, so its `load` reports the error.
		expect(modules).toEqual([js_module, css_module]);
		expect(await call_load(plugin, css_module.id)).toContain('color: red');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
