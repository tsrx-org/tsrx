import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tsrxReact } from '../src/index.js';

// Bun.plugin() registrations share state across instances; start each test clean.
afterEach(() => {
	Reflect.deleteProperty(globalThis, Symbol.for('@tsrx/bun-plugin.runtime.v1'));
});

/**
 * @typedef {{
 * 	onResolve: Array<{ options: { filter: RegExp, namespace?: string }, callback: Function }>,
 * 	onLoad: Array<{ options: { filter: RegExp, namespace?: string }, callback: Function }>,
 * }} Hooks
 */

/**
 * @param {import('../types/index.js').TsrxReactBunPluginOptions} [options]
 * @param {{ target?: import('bun').Target, root?: string, entrypoints?: string[], files?: Record<string, string> } | null} [config]
 * @param {Hooks} [hooks] hooks shared with other instances in the same build
 */
function setup_plugin(options, config = {}, hooks = { onResolve: [], onLoad: [] }) {
	const plugin = tsrxReact(options);
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

describe('@tsrx/bun-plugin-react', () => {
	it('compiles .tsrx files, transforms TSX, and serves emitted CSS', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`import './reset.css';

					export function App() @{
					<>
					<div className="div">{'Hello world'}</div>

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
			// Bun's own TSX transform selects the development or production runtime.
			expect(transformed?.loader).toBe('tsx');
			expect(transformed?.contents).toMatch(/^\/\*\* @jsxImportSource react \*\/\n/);
			expect(transformed?.contents).toContain(css_id);
			expect(String(transformed?.contents).indexOf('./reset.css')).toBeGreaterThan(-1);
			expect(String(transformed?.contents).indexOf('./reset.css')).toBeLessThan(
				String(transformed?.contents).indexOf(css_id),
			);
			expect(css.loader).toBe('css');
			expect(css.contents).toContain('.div.');
			expect(css.contents).toContain('color: red;');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('uses a custom jsx import source', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(file_path, `export function App() @{ <div>{'Hello world'}</div> }`);

			const hooks = setup_plugin({ jsxImportSource: 'react-custom' }, { target: 'browser' });
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed?.contents).toMatch(/^\/\*\* @jsxImportSource react-custom \*\/\n/);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('forwards direct runtime imports to the compiler', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-runtime-'));
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
			expect(transformed?.contents).toContain("from '@tsrx/react-runtime/ref'");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads the platform from the tsconfig nearest the entrypoints when root is omitted', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-root-'));
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
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-runtime-'));
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
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-files-'));
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

	it('restores the automatic runtime under a classic jsx tsconfig', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-classic-'));
		try {
			await writeFile(
				path.join(dir, 'tsconfig.json'),
				JSON.stringify({ compilerOptions: { jsx: 'react' } }),
			);
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(file_path, `export function App() @{ <p>{'x'}</p> }`);
			const hooks = setup_plugin(undefined, { root: dir });
			const transformed = await load_tsrx(hooks, file_path);

			// Bun ignores a lone @jsxImportSource under `"jsx": "react"`.
			expect(transformed?.contents).toMatch(
				/^\/\*\* @jsxRuntime automatic @jsxImportSource react \*\/\n/,
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads the jsx setting from the working directory for Bun.plugin() registration', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-runtime-classic-'));
		const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
		try {
			await writeFile(
				path.join(dir, 'tsconfig.json'),
				JSON.stringify({ compilerOptions: { jsx: 'react' } }),
			);
			await mkdir(path.join(dir, 'src'));
			await writeFile(
				path.join(dir, 'src/tsconfig.json'),
				JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
			);
			const file_path = path.join(dir, 'src/App.tsrx');
			await writeFile(file_path, `export function App() @{ <p>{'x'}</p> }`);
			// Bun's runtime transpiler applies only the working directory's tsconfig.
			const hooks = setup_plugin(undefined, null);
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed?.contents).toMatch(
				/^\/\*\* @jsxRuntime automatic @jsxImportSource react \*\/\n/,
			);
		} finally {
			cwd.mockRestore();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('ignores tsconfigs above the working directory for Bun.plugin() registration', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-runtime-parent-'));
		const cwd = vi.spyOn(process, 'cwd').mockReturnValue(path.join(dir, 'app'));
		try {
			await writeFile(
				path.join(dir, 'tsconfig.json'),
				JSON.stringify({ compilerOptions: { jsx: 'react' } }),
			);
			await mkdir(path.join(dir, 'app'));
			const file_path = path.join(dir, 'app/App.tsrx');
			await writeFile(file_path, `export function App() @{ <p>{'x'}</p> }`);
			// Bun's runtime transpiler reads only the working directory's own tsconfig.
			const hooks = setup_plugin(undefined, null);
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed?.contents).toMatch(/^\/\*\* @jsxImportSource react \*\/\n/);
		} finally {
			cwd.mockRestore();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('keeps a leading shebang above the JSX pragma', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-shebang-'));
		try {
			const file_path = path.join(dir, 'cli.tsrx');
			await writeFile(file_path, `#!/usr/bin/env bun\nexport function App() @{ <p>{'x'}</p> }`);
			const hooks = setup_plugin(undefined, { root: dir });
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed?.contents).toMatch(
				/^#!\/usr\/bin\/env bun\n\/\*\* @jsxImportSource react \*\/\n/,
			);
		} finally {
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
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-runtime-'));
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
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-react-instances-'));
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
});
