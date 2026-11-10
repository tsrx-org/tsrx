import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
