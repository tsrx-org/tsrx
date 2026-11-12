import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tsrxVue } from '../src/index.js';

/**
 * @typedef {{
 * 	onResolve: Array<{ options: { filter: RegExp, namespace?: string }, callback: Function }>,
 * 	onLoad: Array<{ options: { filter: RegExp, namespace?: string }, callback: Function }>,
 * }} Hooks
 */

const original_bun = Reflect.get(globalThis, 'Bun');

afterEach(() => {
	if (original_bun === undefined) {
		Reflect.deleteProperty(globalThis, 'Bun');
	} else {
		Object.defineProperty(globalThis, 'Bun', {
			value: original_bun,
			writable: true,
			configurable: true,
		});
	}
});

/**
 * @returns {{ options: unknown[] }}
 */
function install_transpiler_stub() {
	/** @type {unknown[]} */
	const options = [];

	class TranspilerStub {
		/**
		 * @param {unknown} transpiler_options
		 */
		constructor(transpiler_options) {
			options.push(transpiler_options);
		}

		/**
		 * @param {string} source
		 * @returns {string}
		 */
		transformSync(source) {
			return `// transformed\n${source}`;
		}
	}

	Object.defineProperty(globalThis, 'Bun', {
		value: { Transpiler: TranspilerStub },
		writable: true,
		configurable: true,
	});

	return { options };
}

/**
 * @param {import('../types/index.js').TsrxVueBunPluginOptions} [options]
 * @param {{ target?: import('bun').Target, root?: string, entrypoints?: string[], files?: Record<string, string> } | null} [config]
 * @param {Hooks} [hooks] hooks shared with other instances in the same build
 */
function setup_plugin(options, config = {}, hooks = { onResolve: [], onLoad: [] }) {
	const plugin = tsrxVue(options);
	const build = {
		// `null` stands for Bun.plugin() registration, which has no build config.
		config: config === null ? undefined : { entrypoints: [], plugins: [], ...config },
		/**
		 * @param {{ filter: RegExp, namespace?: string }} hook_options
		 * @param {Function} callback
		 */
		onResolve(hook_options, callback) {
			hooks.onResolve.push({ options: hook_options, callback });
			return build;
		},
		/**
		 * @param {{ filter: RegExp, namespace?: string }} hook_options
		 * @param {Function} callback
		 */
		onLoad(hook_options, callback) {
			hooks.onLoad.push({ options: hook_options, callback });
			return build;
		},
	};
	plugin.setup(/** @type {import('bun').PluginBuilder} */ (/** @type {unknown} */ (build)));
	return hooks;
}

/**
 * @param {Hooks} hooks
 * @param {string} file_path
 * @returns {Promise<{ contents: string, loader: string } | undefined>}
 */
async function load_tsrx(hooks, file_path) {
	const hook = hooks.onLoad.find(({ options }) => options.namespace === 'file');
	if (!hook) throw new Error('missing .tsrx onLoad hook');
	return hook.callback({ path: file_path, namespace: 'file', importer: '', kind: 'entry-point' });
}

/**
 * @param {Hooks} hooks
 * @param {string} file_path
 * @returns {Promise<{ contents: string, loader: string } | undefined>}
 */
async function load_source(hooks, file_path) {
	const hook = hooks.onLoad.find(
		({ options }) => options.namespace === 'file' && options.filter.test(file_path),
	);
	if (!hook) throw new Error('missing source onLoad hook');
	return hook.callback({ path: file_path, namespace: 'file', importer: '', kind: 'entry-point' });
}

/**
 * @param {Hooks} hooks
 * @param {string} id
 */
function load_css(hooks, id) {
	const resolve_hook = hooks.onResolve.find(({ options }) => options.filter.test(id));
	if (!resolve_hook) throw new Error('missing CSS onResolve hook');
	const resolved = resolve_hook.callback({ path: id, importer: '' });
	const load_hook = hooks.onLoad.find(({ options }) => options.namespace === resolved.namespace);
	if (!load_hook) throw new Error('missing CSS onLoad hook');
	return load_hook.callback({ path: resolved.path, namespace: resolved.namespace });
}

/**
 * Run hooks the way Bun does: the first one whose namespace and filter match
 * and that returns a result handles the request.
 *
 * @param {Hooks['onLoad']} hooks
 * @param {{ path: string, namespace: string }} args
 */
async function dispatch(hooks, args) {
	for (const { options, callback } of hooks) {
		if (options.namespace !== undefined && options.namespace !== args.namespace) continue;
		if (!options.filter.test(args.path)) continue;
		const result = await callback({ importer: '', kind: 'import-statement', ...args });
		if (result !== undefined) return result;
	}
	return undefined;
}

describe('@tsrx/bun-plugin-vue', () => {
	it('compiles .tsrx files, runs the Vue vapor transform, and serves emitted CSS', async () => {
		const transpiler = install_transpiler_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`import './reset.css';

					export function App() @{
					<>
						<div class="div">{'Hello world'}</div>

						<style>
							.div {
								color: red;
							}
						</style>
					</>
				}`,
			);

			const hooks = setup_plugin(undefined, { target: 'browser', root: dir });
			const transformed = await load_tsrx(hooks, file_path);
			const css_id = `${file_path}?tsrx-css&lang.css`;
			const css = load_css(hooks, css_id);

			expect(transformed).toBeDefined();
			expect(transformed?.loader).toBe('js');
			expect(transformed?.contents).toContain('// transformed');
			expect(transformed?.contents).toContain('defineVaporComponent');
			expect(transformed?.contents).toContain('template as _template');
			expect(transformed?.contents).toContain(css_id);
			expect(String(transformed?.contents).indexOf('./reset.css')).toBeGreaterThan(-1);
			expect(String(transformed?.contents).indexOf('./reset.css')).toBeLessThan(
				String(transformed?.contents).indexOf(css_id),
			);
			expect(transformed?.contents).not.toContain('return <div>');
			expect(css.loader).toBe('css');
			expect(css.contents).toContain('.div.');
			expect(css.contents).toContain('color: red;');
			expect(transpiler.options).toEqual([
				expect.objectContaining({
					loader: 'ts',
					target: 'browser',
				}),
			]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('passes custom vapor options through', async () => {
		install_transpiler_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`export function App({ name }: { name: string }) @{
					<div>{name}</div>
				}`,
			);

			const hooks = setup_plugin(
				{
					vapor: {
						compiler: {
							runtimeModuleName: 'custom-runtime',
						},
					},
				},
				{ target: 'browser', root: dir },
			);
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed).toBeDefined();
			expect(transformed?.contents).toContain('custom-runtime');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('falls back to TypeScript output when Bun.Transpiler is unavailable', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`export function App() @{
					<div>{'Hello world'}</div>
				}`,
			);

			const hooks = setup_plugin(undefined, { target: 'browser', root: dir });
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed).toBeDefined();
			expect(transformed?.loader).toBe('ts');
			expect(transformed?.contents).toContain('defineVaporComponent');
			expect(transformed?.contents).not.toContain('?tsrx-css&lang.css');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('forwards direct runtime imports to the compiler', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-runtime-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`export function App(props) @{
					<input {...props} />
				}`,
			);

			const hooks = setup_plugin({ runtimeImports: 'direct' });
			const transformed = await load_tsrx(hooks, file_path);
			expect(transformed?.contents).toContain('@tsrx/vue-runtime/ref');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads the platform from the tsconfig nearest the entrypoints when root is omitted', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-root-'));
		try {
			await mkdir(path.join(dir, 'src/pages'), { recursive: true });
			await mkdir(path.join(dir, 'src/widgets'), { recursive: true });
			for (const [config_dir, platform] of [
				['', 'web'],
				['src', 'ios'],
				['src/pages', 'android'],
			]) {
				await writeFile(
					path.join(dir, config_dir, 'tsconfig.json'),
					JSON.stringify({ tsrx: { platform } }),
				);
			}
			const file_path = path.join(dir, 'src/widgets/Platform.tsrx');
			await writeFile(
				file_path,
				`if (import.meta.env.platform.ios) {
					const selected_ios = 'selected_ios';
				} else {
					const selected_other = 'selected_other';
				}`,
			);
			// Bun's default root is the entrypoints' common ancestor, here src/.
			const hooks = setup_plugin(undefined, {
				entrypoints: [path.join(dir, 'src/pages/Page.tsrx'), file_path],
			});
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed?.contents).toContain('selected_ios');
			expect(transformed?.contents).not.toContain('selected_other');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('writes platform flag values into the output for Bun.plugin() registration', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-runtime-'));
		try {
			const file_path = path.join(dir, 'Platform.tsrx');
			await writeFile(
				file_path,
				`export function flags() {
					return [import.meta.env.platform.web, import.meta.env.platform.ios, import.meta.env.platform.android];
				}`,
			);
			const hooks = setup_plugin({ platform: 'ios' }, null);
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed?.contents).toMatch(/\[\s*false,\s*true,\s*false\s*\]/);
			expect(transformed?.contents).not.toContain('import.meta.env.platform');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads the platform from the working directory when every entrypoint is an in-memory file', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-files-'));
		const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
		try {
			await writeFile(
				path.join(dir, 'tsconfig.json'),
				JSON.stringify({ tsrx: { platform: 'ios' } }),
			);
			const file_path = path.join(dir, 'Platform.tsrx');
			await writeFile(
				file_path,
				`if (import.meta.env.platform.ios) {
					const selected_ios = 'selected_ios';
				} else {
					const selected_other = 'selected_other';
				}`,
			);
			// Bun builds from the working directory when every entrypoint is a `files` key.
			const hooks = setup_plugin(undefined, {
				entrypoints: ['/virtual/main.ts'],
				files: { '/virtual/main.ts': `import ${JSON.stringify(file_path)};` },
			});
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed?.contents).toContain('selected_ios');
			expect(transformed?.contents).not.toContain('selected_other');
		} finally {
			cwd.mockRestore();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('honors exclude filters', async () => {
		const hooks = setup_plugin({ exclude: /ignored\.tsrx$/ }, { target: 'browser' });
		const transformed = await load_tsrx(hooks, '/project/ignored.tsrx');
		expect(transformed).toBeUndefined();
	});

	it('serves each instance its own CSS when instances split the source files', async () => {
		install_transpiler_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-instances-'));
		try {
			const hooks = setup_plugin({ include: /a\.tsrx$/ }, { target: 'browser', root: dir });
			setup_plugin({ include: /b\.tsrx$/ }, { target: 'browser', root: dir }, hooks);
			for (const name of ['a', 'b']) {
				const file_path = path.join(dir, `${name}.tsrx`);
				await writeFile(
					file_path,
					`export function App() @{ <><style>div { --marker-${name}: 1; }</style><div /></> }`,
				);
				expect(await dispatch(hooks.onLoad, { path: file_path, namespace: 'file' })).toBeDefined();
			}

			for (const name of ['a', 'b']) {
				const css_id = `${path.join(dir, `${name}.tsrx`)}?tsrx-css&lang.css`;
				const resolved = await dispatch(hooks.onResolve, { path: css_id, namespace: 'file' });
				const css = await dispatch(hooks.onLoad, {
					path: resolved.path,
					namespace: resolved.namespace ?? 'file',
				});
				expect(css?.contents).toContain(`--marker-${name}`);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('installs vaporInteropPlugin on createVaporApp calls', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-'));
		try {
			const file_path = path.join(dir, 'main.ts');
			await writeFile(
				file_path,
				`import { createVaporApp } from 'vue';
import App from './App.tsrx';

createVaporApp(App).mount('#root');`,
			);

			const hooks = setup_plugin(undefined, { target: 'browser', root: dir });
			const transformed = await load_source(hooks, file_path);

			expect(transformed).toBeDefined();
			expect(transformed?.loader).toBe('ts');
			expect(transformed?.contents).toContain(
				`import { createVaporApp as __tsrx_createVaporApp, vaporInteropPlugin } from 'vue';`,
			);
			expect(transformed?.contents).toContain(
				`const createVaporApp = (...args) => __tsrx_createVaporApp(...args).use(vaporInteropPlugin);`,
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('leaves manually installed interop alone', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-'));
		try {
			const file_path = path.join(dir, 'main.ts');
			await writeFile(
				file_path,
				`import { createVaporApp, vaporInteropPlugin } from 'vue';
import App from './App.tsrx';

createVaporApp(App).use(vaporInteropPlugin).mount('#root');`,
			);

			const hooks = setup_plugin(undefined, { target: 'browser', root: dir });
			const transformed = await load_source(hooks, file_path);

			expect(transformed).toBeUndefined();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
