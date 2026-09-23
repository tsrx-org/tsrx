import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveWorkerFixture } from '@tsrx/core/test-harness/worker';
import { tsrxVue } from '../src/index.js';

const fixtures_dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** @param {string} message */
const worker = (message) => `const message: string = ${JSON.stringify(message)};
self.postMessage(message);
`;

/**
 * Pluck the main tsrx-vue plugin (the one that owns `.tsrx.tsx` virtual ids)
 * out of the array returned by `tsrxVue()`.
 */
function get_main_plugin() {
	const main = tsrxVue().find((p) => p.name === '@tsrx/vite-plugin-vue');
	if (!main) throw new Error('@tsrx/vite-plugin-vue plugin not found');
	return main;
}

/**
 * @param {import('vite').Plugin} plugin
 * @param {string} source
 */
function call_resolve_id(plugin, source) {
	const hook =
		typeof plugin.resolveId === 'function' ? plugin.resolveId : plugin.resolveId?.handler;
	if (!hook) throw new Error('plugin has no resolveId hook');
	const context = /** @type {ThisParameterType<typeof hook>} */ ({
		/** @param {string} id */
		resolve: async (id) => ({ id, external: false, moduleSideEffects: true, meta: {} }),
	});
	return hook.call(context, source, undefined, { isEntry: false });
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
 * @param {object} ctx
 */
function call_handle_hot_update(plugin, ctx) {
	const hook =
		typeof plugin.handleHotUpdate === 'function'
			? plugin.handleHotUpdate
			: plugin.handleHotUpdate?.handler;
	if (!hook) throw new Error('plugin has no handleHotUpdate hook');
	return hook.call(/** @type {any} */ ({}), /** @type {any} */ (ctx));
}

describe('@tsrx/vite-plugin-vue web workers', () => {
	it('keeps the worker query on the virtual id of a dev worker entry', async () => {
		const result = await call_resolve_id(
			get_main_plugin(),
			'/abs/path/Worker.tsrx?worker_file&type=module',
		);

		expect(/** @type {any} */ (result).id).toBe(
			'/abs/path/Worker.tsrx.tsx?worker_file&type=module',
		);
	});

	it('leaves other query-suffixed ids to vite', async () => {
		const plugin = get_main_plugin();

		for (const source of [
			'/abs/path/Worker.tsrx?worker',
			'/abs/path/App.tsrx?raw',
			'/abs/path/App.tsrx?url',
		]) {
			expect(await call_resolve_id(plugin, source)).toBeNull();
		}
	});

	it('compiles a dev worker entry from its file path', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'tsrx-vue-worker-'));
		const real_path = join(dir, 'Worker.tsrx');
		writeFileSync(real_path, worker('hello'));

		const result = await call_load(get_main_plugin(), real_path + '.tsx?worker_file&type=module');

		expect(/** @type {any} */ (result).code).toContain('self.postMessage(message)');
		expect(/** @type {any} */ (result).map.sources).toEqual([real_path]);
	});

	it('invalidates a dev worker entry on hot update', async () => {
		const worker_module = { id: '/abs/path/Worker.tsrx.tsx?worker_file&type=module' };
		const modules = await call_handle_hot_update(get_main_plugin(), {
			file: '/abs/path/Worker.tsrx',
			modules: [],
			server: {
				moduleGraph: {
					/** @param {string} file */
					getModulesByFile(file) {
						return file === '/abs/path/Worker.tsrx.tsx' ? new Set([worker_module]) : undefined;
					},
					getModuleById() {
						return undefined;
					},
				},
			},
		});

		expect(modules).toEqual([worker_module]);
	});

	it('serves a compiled .tsrx worker entry from the dev server', async () => {
		const { initial, updated } = await serveWorkerFixture({
			root: join(fixtures_dir, 'worker'),
			files: { 'Worker.tsrx': worker('hello') },
			entry: 'Worker.tsrx',
			plugins: [tsrxVue()],
			update: worker('updated'),
		});

		expect(initial.status).toBe(200);
		expect(initial.contentType).toMatch(/^text\/javascript/);
		expect(initial.code).toContain('const message = "hello";');
		// Vite's worker plugin only prepares the entry when its id keeps the
		// worker query.
		expect(initial.code).toMatch(/import ".*\/env\.mjs"/);
		expect(updated?.code).toContain('const message = "updated";');
	}, 60_000);
});
