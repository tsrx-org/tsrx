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
	Reflect.deleteProperty(globalThis, Symbol.for('@tsrx/bun-plugin.runtime.v1'));
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
 * Stands in for `Bun.resolveSync()`, which Bun.plugin() registration uses to
 * find the `vue` a module imports: `<dir>/node_modules/<specifier>/index.js`.
 */
function install_resolve_stub() {
	Object.defineProperty(globalThis, 'Bun', {
		value: {
			...Reflect.get(globalThis, 'Bun'),
			resolveSync: (/** @type {string} */ specifier, /** @type {string} */ from) =>
				path.join(from, 'node_modules', specifier, 'index.js'),
		},
		writable: true,
		configurable: true,
	});
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

/**
 * Run hooks the way Bun.plugin() registration does: only the first hook whose
 * namespace and filter match is called, and it has to return an object.
 *
 * @param {Hooks['onLoad']} hooks
 * @param {{ path: string, namespace: string }} args
 */
async function runtime_dispatch(hooks, args) {
	const hook = hooks.find(
		({ options }) =>
			(options.namespace ?? 'file') === args.namespace && options.filter.test(args.path),
	);
	if (!hook) throw new Error(`no onLoad hook for ${args.path}`);
	const result = await hook.callback({ importer: '', kind: 'import-statement', ...args });
	if (result === undefined) throw new Error(`onLoad() expects an object returned for ${args.path}`);
	return result;
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

	it("expands vue-jsx-vapor's macros before the Vapor transform", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-macros-'));
		try {
			const file_path = path.join(dir, 'Greeting.tsrx');
			await writeFile(
				file_path,
				`export function Greeting({ name, greeting = 'Hello' }: { name: string; greeting?: string }) @{
					<p>{greeting}{', '}{name}</p>
				}`,
			);

			const transformed = await load_tsrx(setup_plugin(undefined, { root: dir }), file_path);
			expect(transformed?.contents).toContain('_setNodes(_x0, () => __props.greeting');
			expect(transformed?.contents).toContain('"name": null');
			expect(transformed?.contents).toContain('default: "Hello"');

			const unexpanded = await load_tsrx(
				setup_plugin({ vapor: { macros: false } }, { root: dir }),
				file_path,
			);
			expect(unexpanded?.contents).toContain('function Greeting({ name, greeting = "Hello" }');
			expect(unexpanded?.contents).not.toContain('props:');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('serves the helper modules the macros import in Bun.build()', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-helpers-'));
		try {
			const file_path = path.join(dir, 'Named.tsrx');
			await writeFile(
				file_path,
				`export function Named(props: { name: string }) @{
					<p>{props.name}</p>
				}`,
			);

			const hooks = setup_plugin(undefined, { root: dir });
			const transformed = await load_tsrx(hooks, file_path);
			expect(transformed?.contents).toContain(
				'import { useFullProps as __useFullProps } from "/vue-jsx-vapor/props";',
			);

			const helper = { path: '/vue-jsx-vapor/props', namespace: 'file' };
			expect(
				await dispatch(hooks.onResolve, { ...helper, importer: path.join(dir, 'main.ts') }),
			).toBeUndefined();
			const resolved = await dispatch(hooks.onResolve, { ...helper, importer: file_path });
			expect(resolved).toEqual({
				path: `${path.join(dir, 'vue-jsx-vapor')}?vue-jsx-vapor=%2Fvue-jsx-vapor%2Fprops`,
			});
			expect(await dispatch(hooks.onLoad, { path: resolved.path, namespace: 'file' })).toEqual({
				contents: expect.stringContaining('export function useFullProps()'),
				loader: 'js',
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	// Bun.plugin() registration doesn't call onResolve hooks, and another
	// plugin's loose `include` must not see a `.tsrx` path.
	it("points helper imports at the module's vue under Bun.plugin() registration", async () => {
		install_resolve_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-helpers-'));
		try {
			const file_path = path.join(dir, 'Named.tsrx');
			await writeFile(
				file_path,
				`export function Named(props: { name: string }) @{
					<p>{props.name}</p>
				}`,
			);

			const hooks = setup_plugin(undefined, null);
			const transformed = await runtime_dispatch(hooks.onLoad, {
				path: file_path,
				namespace: 'file',
			});
			const vue_path = path.join(dir, 'node_modules/vue/index.js');
			const helper_path = `${vue_path}?vue-jsx-vapor=%2Fvue-jsx-vapor%2Fprops`;
			expect(transformed.contents).toContain(`from ${JSON.stringify(helper_path)};`);
			expect(transformed.contents).not.toContain('"/vue-jsx-vapor/props"');
			const helper = await runtime_dispatch(hooks.onLoad, { path: helper_path, namespace: 'file' });
			expect(helper).toEqual({
				contents: expect.stringContaining('export function useFullProps()'),
				loader: 'js',
			});
			expect(helper.contents).toContain(`import * as Vue from ${JSON.stringify(vue_path)};`);
			expect(helper.contents).not.toContain('"vue"');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('compiles defineStyle stylesheets as helper modules', async () => {
		install_resolve_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-define-style-'));
		try {
			const file_path = path.join(dir, 'Box.tsrx');
			await writeFile(
				file_path,
				`export function Box() @{
					defineStyle(\`.box { color: red; }\`);
					<div class="box" />
				}`,
			);

			const hooks = setup_plugin(undefined, { root: dir });
			const transformed = await load_tsrx(hooks, file_path);
			const [, id] = /import "(\/vue-jsx-vapor\/macros\/define-style\/[^"]+)"/.exec(
				String(transformed?.contents),
			) ?? [, ''];
			expect(id).toMatch(/&scoped=true&lang\.css$/);
			const resolved = await dispatch(hooks.onResolve, {
				path: id,
				namespace: 'file',
				importer: file_path,
			});
			const css = await dispatch(hooks.onLoad, { path: resolved.path, namespace: 'file' });
			expect(css).toEqual({
				contents: expect.stringMatching(/\.box\[data-v-\w+\]/),
				loader: 'css',
			});

			const runtime_hooks = setup_plugin(undefined, null);
			const runtime_module = await runtime_dispatch(runtime_hooks.onLoad, {
				path: file_path,
				namespace: 'file',
			});
			const [, runtime_path] = /import "([^"]+define-style[^"]+)"/.exec(
				String(runtime_module.contents),
			) ?? [, ''];
			expect(
				await runtime_dispatch(runtime_hooks.onLoad, { path: runtime_path, namespace: 'file' }),
			).toEqual({ exports: { default: {} }, loader: 'object' });
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("reports defineStyle stylesheets in a language Bun can't load", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-define-style-'));
		try {
			const file_path = path.join(dir, 'Box.tsrx');
			await writeFile(
				file_path,
				`export function Box() @{
					defineStyle.scss(\`.box { .inner { color: red; } }\`);
					<div class="box">{'box'}</div>
				}`,
			);

			const hooks = setup_plugin(undefined, { root: dir });
			const transformed = await load_tsrx(hooks, file_path);
			const [, id] = /import "(\/vue-jsx-vapor\/macros\/define-style\/[^"]+)"/.exec(
				String(transformed?.contents),
			) ?? [, ''];
			expect(id).toMatch(/&lang\.scss$/);
			const resolved = await dispatch(hooks.onResolve, {
				path: id,
				namespace: 'file',
				importer: file_path,
			});
			await expect(
				dispatch(hooks.onLoad, { path: resolved.path, namespace: 'file' }),
			).rejects.toThrow("Bun can't load a defineStyle.scss stylesheet");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("applies the macros' include and exclude options", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-macros-filter-'));
		try {
			const source = `export function Greeting({ name }: { name: string }) @{
				<p>{name}</p>
			}`;
			await mkdir(path.join(dir, 'legacy'));
			await mkdir(path.join(dir, 'node_modules/lib'), { recursive: true });
			for (const file of [
				'Greeting.tsrx',
				'legacy/Greeting.tsrx',
				'node_modules/lib/Greeting.tsrx',
			]) {
				await writeFile(path.join(dir, file), source);
			}
			const expands = async (/** @type {any} */ options, /** @type {string} */ file) =>
				String(
					(await load_tsrx(setup_plugin(options, { root: dir }), path.join(dir, file)))?.contents,
				).includes('"name": null');

			// By default, as in the Vite plugin, modules in node_modules are left out.
			expect(await expands(undefined, 'Greeting.tsrx')).toBe(true);
			expect(await expands(undefined, 'node_modules/lib/Greeting.tsrx')).toBe(false);
			const options = { vapor: { macros: { exclude: [/[/\\]legacy[/\\]/] } } };
			expect(await expands(options, 'Greeting.tsrx')).toBe(true);
			expect(await expands(options, 'legacy/Greeting.tsrx')).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	// Bun.plugin() registration calls only the first matching onLoad hook.
	it("serves another instance's helper modules under Bun.plugin() registration", async () => {
		install_resolve_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-helpers-'));
		try {
			const file_path = path.join(dir, 'Rich.tsrx');
			await writeFile(
				file_path,
				`export function Rich() @{
					const count = defineModel<number>('count');
					<p>{count.value}</p>
				}`,
			);

			const hooks = setup_plugin({ vapor: { macros: false }, exclude: /Rich\.tsrx$/ }, null);
			setup_plugin({ include: /Rich\.tsrx$/ }, null, hooks);
			const transformed = await runtime_dispatch(hooks.onLoad, {
				path: file_path,
				namespace: 'file',
			});
			const helper_path = `${path.join(dir, 'node_modules/vue/index.js')}?vue-jsx-vapor=%2Fvue-jsx-vapor%2Fmacros%2Fuse-model`;
			expect(transformed.contents).toContain(JSON.stringify(helper_path));
			expect(
				await runtime_dispatch(hooks.onLoad, { path: helper_path, namespace: 'file' }),
			).toEqual({
				contents: expect.stringContaining('export function useModel('),
				loader: 'js',
			});
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

	// Bun.plugin() registration calls only the first matching onLoad hook.
	it('splits the source files between instances under Bun.plugin() registration', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-runtime-'));
		try {
			const hooks = setup_plugin({ exclude: /b\.tsrx$/ }, null);
			setup_plugin({ include: /b\.tsrx$/ }, null, hooks);
			for (const name of ['a', 'b']) {
				const file_path = path.join(dir, `${name}.tsrx`);
				await writeFile(
					file_path,
					`export function App() @{ <><style>div { --marker-${name}: 1; }</style><div /></> }`,
				);
				const result = await runtime_dispatch(hooks.onLoad, { path: file_path, namespace: 'file' });
				expect(result.contents).toContain(`${file_path}?tsrx-css&lang.css`);
			}

			for (const name of ['a', 'b']) {
				const css_id = `${path.join(dir, `${name}.tsrx`)}?tsrx-css&lang.css`;
				const resolved = await dispatch(hooks.onResolve, { path: css_id, namespace: 'file' });
				const css = await runtime_dispatch(hooks.onLoad, {
					path: resolved.path,
					namespace: resolved.namespace ?? 'file',
				});
				expect(css).toEqual({
					contents: expect.stringContaining(`--marker-${name}`),
					loader: 'css',
				});
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('loads a file every instance leaves out the way Bun does without a plugin', async () => {
		const hooks = setup_plugin({ exclude: /ignored\.tsrx$/ }, null);

		expect(
			await runtime_dispatch(hooks.onLoad, { path: '/project/ignored.tsrx', namespace: 'file' }),
		).toEqual({ exports: { default: '/project/ignored.tsrx' }, loader: 'object' });
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

	it("loads rewritten modules with Bun's default loader for their extension", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-vue-'));
		try {
			const hooks = setup_plugin(undefined, { target: 'browser', root: dir });
			for (const [name, loader] of [
				['main.js', 'jsx'],
				['main.mjs', 'js'],
				['main.ts', 'ts'],
				['main.tsx', 'tsx'],
			]) {
				const file_path = path.join(dir, name);
				await writeFile(
					file_path,
					`import { createVaporApp } from 'vue';\ncreateVaporApp({}).mount('#root');\n`,
				);

				expect((await load_source(hooks, file_path))?.loader).toBe(loader);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	// A module an async hook loads can't be `require()`d.
	it('leaves project modules to Bun under Bun.plugin() registration', () => {
		const hooks = setup_plugin(undefined, null);

		expect(hooks.onLoad.some(({ options }) => options.filter.test('/app/src/main.ts'))).toBe(false);
	});

	it('leaves dependencies to Bun before calling the interop hook', () => {
		const hooks = setup_plugin(undefined, {});
		const hook = hooks.onLoad.find(({ options }) => options.filter.test('/app/src/main.ts'));

		expect(hook?.options.filter.test('/app/src/main.ts')).toBe(true);
		expect(hook?.options.filter.test('/app/node_modules/vue/index.mjs')).toBe(false);
		expect(hook?.options.filter.test('C:\\app\\node_modules\\vue\\index.mjs')).toBe(false);
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
