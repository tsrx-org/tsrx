import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tsrxHono } from '../src/index.js';

/**
 * @typedef {{
 *  onStart: Function[],
 *  onEnd: Function[],
 *  onResolve: Array<{ options: { filter: RegExp, namespace?: string }, callback: Function }>,
 *  onLoad: Array<{ options: { filter: RegExp, namespace?: string }, callback: Function }>,
 *  config: Record<string, any>,
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

/** @returns {{ options: unknown[] }} */
function install_transpiler_stub() {
	/** @type {unknown[]} */
	const options = [];

	class TranspilerStub {
		/** @param {unknown} transpiler_options */
		constructor(transpiler_options) {
			options.push(transpiler_options);
		}

		/** @param {string} source */
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
 * @param {import('../types/index.js').TsrxHonoBunPluginOptions} [options]
 * @param {{ target?: import('bun').Target, root?: string }} [config]
 * @returns {Hooks}
 */
function setup_plugin(options, config = {}) {
	/** @type {Omit<Hooks, 'config'>} */
	const hooks = { onStart: [], onEnd: [], onResolve: [], onLoad: [] };
	const plugin = tsrxHono(options);
	const build = {
		config: {
			entrypoints: [],
			plugins: [],
			...config,
		},
		onStart(callback) {
			hooks.onStart.push(callback);
			return build;
		},
		onEnd(callback) {
			hooks.onEnd.push(callback);
			return build;
		},
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
	return { ...hooks, config: build.config };
}

/**
 * @param {Hooks} hooks
 * @param {string} file_path
 * @returns {Promise<{ contents: string, loader: string } | undefined>}
 */
async function load_tsrx(hooks, file_path) {
	const hook = hooks.onLoad.find(({ options }) => {
		options.filter.lastIndex = 0;
		return options.namespace === 'file' && options.filter.test(file_path);
	});
	if (!hook) return undefined;
	return hook.callback({ path: file_path, namespace: 'file', importer: '', kind: 'entry-point' });
}

/**
 * @param {Hooks} hooks
 * @param {string} id
 */
function resolve_css(hooks, id) {
	const resolve_hook = hooks.onResolve.find(({ options }) => {
		options.filter.lastIndex = 0;
		return options.filter.test(id);
	});
	if (!resolve_hook) throw new Error('missing CSS onResolve hook');
	return resolve_hook.callback({ path: id, importer: '' });
}

/**
 * @param {Hooks} hooks
 * @param {{ path: string, namespace: string }} resolved
 */
function load_css(hooks, resolved) {
	const load_hook = hooks.onLoad.find(({ options }) => options.namespace === resolved.namespace);
	if (!load_hook) throw new Error('missing CSS onLoad hook');
	return load_hook.callback({ path: resolved.path, namespace: resolved.namespace });
}

describe('@tsrx/bun-plugin-hono', () => {
	it.each([
		['server', undefined, 'hono/jsx'],
		['dom', /** @type {const} */ ('dom'), 'hono/jsx/dom'],
	])('compiles %s files with the target-owned JSX runtime', async (_label, mode, source) => {
		const transpiler = install_transpiler_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`export function App({ visible }) @{ @if (visible) { <p>{'Hello'}</p> } @else { <p>{'Bye'}</p> } }`,
			);

			const hooks = setup_plugin(mode ? { mode } : undefined, {
				target: mode === 'dom' ? 'browser' : 'bun',
				root: dir,
			});
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed).toBeDefined();
			expect(transformed?.loader).toBe('js');
			expect(transformed?.contents).toContain('// transformed');
			expect(transpiler.options).toEqual([
				expect.objectContaining({
					loader: 'tsx',
					target: mode === 'dom' ? 'browser' : 'bun',
					autoImportJSX: true,
					tsconfig: {
						compilerOptions: {
							jsx: 'react-jsx',
							jsxImportSource: source,
						},
					},
				}),
			]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('serves only owned virtual CSS and clears stale CSS', async () => {
		install_transpiler_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-css-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`import './reset.css';
				export function App() @{ <><div class="app">{'Hello'}</div><style>.app { color: red; }</style></> }`,
			);

			const hooks = setup_plugin({ mode: 'dom' }, { target: 'browser', root: dir });
			const transformed = await load_tsrx(hooks, file_path);
			const css_id = `${file_path}?tsrx-css&lang.css`;
			const resolved = resolve_css(hooks, css_id);
			const css = load_css(hooks, resolved);

			expect(transformed?.contents).toContain(css_id);
			expect(String(transformed?.contents).indexOf('./reset.css')).toBeLessThan(
				String(transformed?.contents).indexOf(css_id),
			);
			expect(resolved.namespace).toBe('@tsrx/bun-plugin-hono-css');
			expect(css.loader).toBe('css');
			expect(css.contents).toContain('.app.');
			expect(css.contents).toContain('color: red;');
			expect(resolve_css(hooks, '/other/App.tsrx?tsrx-css&lang.css')).toBeUndefined();

			expect(hooks.onStart).toHaveLength(1);
			hooks.onStart[0]();
			expect(resolve_css(hooks, css_id)).toBeUndefined();
			await load_tsrx(hooks, file_path);
			expect(resolve_css(hooks, css_id)).toBeDefined();

			await writeFile(file_path, `export function App() @{ <div>{'No style'}</div> }`);
			const without_css = await load_tsrx(hooks, file_path);
			expect(without_css?.contents).not.toContain(css_id);
			expect(resolve_css(hooks, css_id)).toBeUndefined();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('honors include and exclude filters without intercepting unrelated modules', async () => {
		install_transpiler_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-filter-'));
		try {
			const included = path.join(dir, 'included', 'App.tsrx');
			const excluded = path.join(dir, 'included', 'Ignored.tsrx');
			await mkdir(path.dirname(included));
			await writeFile(included, `export function App() @{ <p>{'yes'}</p> }`);
			await writeFile(excluded, `export function App() @{ <p>{'no'}</p> }`);

			const hooks = setup_plugin({
				include: /[/\\]included[/\\].*\.tsrx$/,
				exclude: [/Ignored\.tsrx$/, /vendor/],
			});

			expect(await load_tsrx(hooks, included)).toBeDefined();
			expect(await load_tsrx(hooks, excluded)).toBeUndefined();
			expect(await load_tsrx(hooks, path.join(dir, 'included', 'App.ts'))).toBeUndefined();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('falls back to TSX with an exact JSX source pragma without Bun.Transpiler', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-fallback-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(file_path, `export function App() @{ <div>{'Hello'}</div> }`);

			const hooks = setup_plugin({ mode: 'dom' }, { target: 'browser', root: dir });
			const transformed = await load_tsrx(hooks, file_path);

			expect(transformed?.loader).toBe('tsx');
			expect(transformed?.contents).toMatch(/^\/\*\* @jsxImportSource hono\/jsx\/dom \*\//);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('forwards platform and runtime import options to the selected compiler', async () => {
		install_transpiler_stub();
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-platform-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`if (import.meta.env.platform.web) {
					const selected_web = 'selected_web';
				} else {
					const selected_native = 'selected_native';
				}
				export function App(props) @{ <input {...props} /> }`,
			);

			const hooks = setup_plugin({ platform: 'web', runtimeImports: 'direct' }, { root: dir });
			const transformed = await load_tsrx(hooks, file_path);

			expect(hooks.config.define['import.meta.env.platform.web']).toBe('true');
			expect(hooks.config.define['import.meta.env.platform.ios']).toBe('false');
			expect(transformed?.contents).toContain("from '@tsrx/core/runtime/ref'");
			expect(transformed?.contents).toContain('selected_web');
			expect(transformed?.contents).not.toContain('selected_native');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('rejects an invalid mode before registering build hooks', () => {
		expect(() => tsrxHono({ mode: /** @type {any} */ ('client') })).toThrow(
			/Invalid Hono target mode/,
		);
	});
});
