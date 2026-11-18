import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tsrxHono } from '../src/index.js';

// Bun.plugin() registrations share state across instances; start each test clean.
afterEach(() => {
	Reflect.deleteProperty(globalThis, Symbol.for('@tsrx/bun-plugin.runtime.v1'));
});

function setup_plugin(options, config = {}) {
	const hooks = { onResolve: [], onLoad: [] };
	const plugin = tsrxHono(options);
	const build = {
		// `null` stands for Bun.plugin() registration, which has no build config.
		config: config === null ? undefined : { entrypoints: [], plugins: [], ...config },
		onResolve(hook_options, callback) {
			hooks.onResolve.push({ options: hook_options, callback });
			return build;
		},
		onLoad(hook_options, callback) {
			hooks.onLoad.push({ options: hook_options, callback });
			return build;
		},
	};
	plugin.setup(build);
	hooks.config = build.config;
	return hooks;
}

async function load_tsrx(hooks, file_path) {
	const hook = hooks.onLoad.find(({ options }) => options.namespace === 'file');
	return hook.callback({ path: file_path, namespace: 'file', importer: '', kind: 'entry-point' });
}

describe('@tsrx/bun-plugin-hono', () => {
	it('rejects an invalid mode instead of silently selecting server', () => {
		expect(() => tsrxHono({ mode: /** @type {any} */ ('dmo') })).toThrow(/invalid mode/);
	});

	it('specializes platform flags and defines them for Bun', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-platform-'));
		try {
			const file_path = path.join(dir, 'Platform.tsrx');
			await writeFile(
				file_path,
				`if (import.meta.env.platform.web) {
					const selected_web = 'selected_web';
				} else {
					const selected_native = 'selected_native';
				}`,
			);
			const hooks = setup_plugin({ platform: 'web' }, { target: 'browser' });
			const result = await load_tsrx(hooks, file_path);

			expect(hooks.config.define['import.meta.env.platform.web']).toBe('true');
			expect(hooks.config.define['import.meta.env.platform.ios']).toBe('false');
			expect(result.contents).toContain('selected_web');
			expect(result.contents).not.toContain('selected_native');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads the platform from the Bun build tsconfig', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-platform-'));
		try {
			await writeFile(
				path.join(dir, 'tsconfig.json'),
				JSON.stringify({ tsrx: { platform: 'android' } }),
			);
			const file_path = path.join(dir, 'Platform.tsrx');
			await writeFile(
				file_path,
				`if (import.meta.env.platform.android) {
					const selected_android = 'selected_android';
				} else {
					const selected_other = 'selected_other';
				}`,
			);
			const hooks = setup_plugin(undefined, { root: dir, target: 'browser' });
			const result = await load_tsrx(hooks, file_path);

			expect(hooks.config.define['import.meta.env.platform.android']).toBe('true');
			expect(result.contents).toContain('selected_android');
			expect(result.contents).not.toContain('selected_other');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads the platform from the tsconfig nearest the entrypoints when root is omitted', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-root-'));
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
			const result = await load_tsrx(hooks, file_path);

			expect(result?.contents).toContain('selected_ios');
			expect(result?.contents).not.toContain('selected_other');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('writes platform flag values into the output for Bun.plugin() registration', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-runtime-'));
		try {
			const file_path = path.join(dir, 'Platform.tsrx');
			await writeFile(
				file_path,
				`export function flags() {
					return [import.meta.env.platform.web, import.meta.env.platform.ios, import.meta.env.platform.android];
				}`,
			);
			const hooks = setup_plugin({ platform: 'ios' }, null);
			const result = await load_tsrx(hooks, file_path);

			expect(result?.contents).toMatch(/\[\s*false,\s*true,\s*false\s*\]/);
			expect(result?.contents).not.toContain('import.meta.env.platform');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads the platform from the working directory when every entrypoint is an in-memory file', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-files-'));
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
			const result = await load_tsrx(hooks, file_path);

			expect(result?.contents).toContain('selected_ios');
			expect(result?.contents).not.toContain('selected_other');
		} finally {
			cwd.mockRestore();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('restores the automatic runtime under a classic jsx tsconfig', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-classic-'));
		try {
			await writeFile(
				path.join(dir, 'tsconfig.json'),
				JSON.stringify({ compilerOptions: { jsx: 'react' } }),
			);
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(file_path, `export function App() @{ <p>{'x'}</p> }`);
			const hooks = setup_plugin(undefined, { root: dir });
			const result = await load_tsrx(hooks, file_path);

			// Bun ignores a lone @jsxImportSource under `"jsx": "react"`.
			expect(result?.contents).toMatch(
				/^\/\*\* @jsxRuntime automatic @jsxImportSource hono\/jsx \*\/\n/,
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads the jsx setting from the working directory for Bun.plugin() registration', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-runtime-classic-'));
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
			const result = await load_tsrx(hooks, file_path);

			expect(result?.contents).toMatch(
				/^\/\*\* @jsxRuntime automatic @jsxImportSource hono\/jsx \*\/\n/,
			);
		} finally {
			cwd.mockRestore();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('ignores tsconfigs above the working directory for Bun.plugin() registration', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-runtime-parent-'));
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
			const result = await load_tsrx(hooks, file_path);

			expect(result?.contents).toMatch(/^\/\*\* @jsxImportSource hono\/jsx \*\/\n/);
		} finally {
			cwd.mockRestore();
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('keeps a leading shebang above the JSX pragma', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-shebang-'));
		try {
			const file_path = path.join(dir, 'cli.tsrx');
			await writeFile(file_path, `#!/usr/bin/env bun\nexport function App() @{ <p>{'x'}</p> }`);
			const hooks = setup_plugin(undefined, { root: dir });
			const result = await load_tsrx(hooks, file_path);

			expect(result?.contents).toMatch(
				/^#!\/usr\/bin\/env bun\n\/\*\* @jsxImportSource hono\/jsx \*\/\n/,
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('compiles server files and selects hono/jsx', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(file_path, `export function App() @{ <div class="app">{'Hello'}</div> }`);
			const hooks = setup_plugin(undefined, { target: 'browser' });
			const result = await load_tsrx(hooks, file_path);
			// Bun's own TSX transform selects the development or production runtime.
			expect(result.loader).toBe('tsx');
			expect(result.contents).toMatch(/^\/\*\* @jsxImportSource hono\/jsx \*\/\n/);
			expect(result.contents).toContain('<div class="app">');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('selects hono/jsx/dom and serves component CSS', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-dom-'));
		try {
			const file_path = path.join(dir, 'App.tsrx');
			await writeFile(
				file_path,
				`export function App() @{ <><div class="app">{'Hello'}</div><style>.app { color: red; }</style></> }`,
			);
			const hooks = setup_plugin({ mode: 'dom' }, { target: 'browser' });
			const result = await load_tsrx(hooks, file_path);
			const css_id = `${file_path}?tsrx-css&lang.css`;
			const resolved = hooks.onResolve.find(({ options }) => options.filter.test(css_id));
			const css = hooks.onLoad.find(
				({ options }) => options.namespace === resolved.callback({ path: css_id }).namespace,
			);
			const css_result = css.callback({ path: css_id });
			expect(result.contents).toContain(css_id);
			expect(css_result.contents).toContain('color: red;');
			expect(result.contents).toMatch(/^\/\*\* @jsxImportSource hono\/jsx\/dom \*\/\n/);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	// Bun.plugin() registration accepts the css loader only in the file namespace.
	it('serves component CSS from the file namespace for Bun.plugin() registration', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-runtime-css-'));
		try {
			const file_path = path.join(dir, 'Styled.tsrx');
			await writeFile(
				file_path,
				`export function Styled() @{ <><style>p { color: red; }</style><p>{'hi'}</p></> }`,
			);
			const hooks = setup_plugin(undefined, null);
			await load_tsrx(hooks, file_path);
			const css_id = `${file_path}?tsrx-css&lang.css`;
			const resolve = hooks.onResolve.find(({ options }) => options.filter.test(css_id));

			expect(resolve.callback({ path: css_id, namespace: 'file' })).toEqual({ path: css_id });
			const load = hooks.onLoad.find(
				({ options }) => (options.namespace ?? 'file') === 'file' && options.filter.test(css_id),
			);
			expect(load.callback({ path: css_id, namespace: 'file' })).toEqual({
				contents: expect.stringContaining('color: red;'),
				loader: 'css',
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	// Bun.plugin() registration calls only the first matching onLoad hook.
	it("serves another instance's stylesheet under Bun.plugin() registration", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'tsrx-bun-plugin-hono-runtime-'));
		try {
			const file_path = path.join(dir, 'Styled.tsrx');
			await writeFile(
				file_path,
				`export function Styled() @{ <><style>p { color: red; }</style><p>{'hi'}</p></> }`,
			);
			const first = setup_plugin(undefined, null);
			const second = setup_plugin({ mode: 'dom' }, null);
			await load_tsrx(second, file_path);
			const css_id = `${file_path}?tsrx-css&lang.css`;
			const resolve = first.onResolve.find(({ options }) => options.filter.test(css_id));
			const load = first.onLoad.find(
				({ options }) => (options.namespace ?? 'file') === 'file' && options.filter.test(css_id),
			);

			expect(resolve.callback({ path: css_id, namespace: 'file' })).toEqual({ path: css_id });
			expect(load.callback({ path: css_id, namespace: 'file' })).toEqual({
				contents: expect.stringContaining('color: red;'),
				loader: 'css',
			});
			expect(load.callback({ path: '/other.tsrx?tsrx-css&lang.css', namespace: 'file' })).toEqual({
				contents: '',
				loader: 'css',
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not claim another plugin's virtual CSS module", async () => {
		const hooks = setup_plugin();
		const resolve = hooks.onResolve.find(({ options }) =>
			options.filter.test('/other.css?tsrx-css&lang.css'),
		);

		expect(resolve.callback({ path: '/other.css?tsrx-css&lang.css' })).toBeUndefined();
		const load = hooks.onLoad.find(({ options }) =>
			options.filter.test('/other.css?tsrx-css&lang.css'),
		);
		expect(load.callback({ path: '/other.css?tsrx-css&lang.css' })).toBeUndefined();
	});
});
