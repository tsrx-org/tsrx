import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tsrxHono } from '../src/index.js';

test.each(['server', 'dom'] as const)('builds %s JavaScript and CSS with Bun', async (mode) => {
	const dir = await mkdtemp(join(import.meta.dir, '.native-'));
	try {
		const entry = join(dir, 'App.tsrx');
		await writeFile(
			entry,
			'export function App() @{ <><style>p { color: red; }</style><p>{"hello"}</p></> }',
		);
		const result = await Bun.build({
			entrypoints: [entry],
			target: 'browser',
			external: ['hono/*', '@tsrx/*'],
			plugins: [tsrxHono({ mode })],
		});
		expect(result.success).toBe(true);
		const js = await result.outputs.find((output) => output.path.endsWith('.js'))!.text();
		const css = await result.outputs.find((output) => output.path.endsWith('.css'))!.text();
		expect(js).toMatch(
			mode === 'dom' ? /hono\/jsx\/dom\/jsx-(?:dev-)?runtime/ : /hono\/jsx\/jsx-(?:dev-)?runtime/,
		);
		expect(js).not.toContain('react/jsx-runtime');
		expect(css).toContain('red');
		if (mode === 'server') {
			const output = join(dir, 'App.js');
			await writeFile(output, js);
			const { App } = await import(output);
			expect(await App().toString()).toMatch(/<p class="tsrx-[^"]+">hello<\/p>/);
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('selects the production JSX runtime for production builds', async () => {
	const dir = await mkdtemp(join(import.meta.dir, '.native-'));
	try {
		const entry = join(dir, 'App.tsrx');
		await writeFile(entry, 'export function App() @{ <p>{"hello"}</p> }');
		const result = await Bun.build({
			entrypoints: [entry],
			target: 'browser',
			external: ['hono/*', '@tsrx/*'],
			define: { 'process.env.NODE_ENV': '"production"' },
			plugins: [tsrxHono()],
		});
		expect(result.success).toBe(true);
		const js = await result.outputs[0].text();
		expect(js).toContain('hono/jsx/jsx-runtime');
		expect(js).not.toContain('jsx-dev-runtime');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

const APP = 'export function App(props) { return <p>{props.message}</p>; }';
const CLASSIC = JSON.stringify({
	compilerOptions: { jsx: 'react', jsxFactory: 'jsx', jsxFragmentFactory: 'Fragment' },
});

async function with_fixture(
	files: Record<string, string>,
	callback: (dir: string) => Promise<void>,
) {
	const dir = await mkdtemp(join(import.meta.dir, '.native-'));
	try {
		for (const [name, contents] of Object.entries(files)) {
			await writeFile(join(dir, name), contents);
		}
		await callback(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function render_built_app(dir: string, mode: 'development' | 'production') {
	const result = await Bun.build({
		entrypoints: [join(dir, 'App.tsrx')],
		target: 'bun',
		external: ['hono/*', '@tsrx/*'],
		define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
		plugins: [tsrxHono()],
	});
	expect(result.success).toBe(true);
	const output = join(dir, `${mode}.js`);
	await writeFile(output, await result.outputs[0].text());
	const { App } = await import(output);
	return String(await App({ message: 'hello' }));
}

test.each(['development', 'production'] as const)(
	'renders under a classic jsx tsconfig in %s',
	async (mode) => {
		await with_fixture({ 'App.tsrx': APP, 'tsconfig.json': CLASSIC }, async (dir) => {
			expect(await render_built_app(dir, mode)).toBe('<p>hello</p>');
		});
	},
);

test('builds a module that starts with a shebang', async () => {
	await with_fixture({ 'App.tsrx': `#!/usr/bin/env bun\n${APP}` }, async (dir) => {
		expect(await render_built_app(dir, 'development')).toBe('<p>hello</p>');
	});
});

// A `bun:test` preload registers the plugin with Bun.plugin(), and Bun's
// runtime reads the JSX settings from the working directory's tsconfig.
test('renders through a bun:test preload with a classic jsx tsconfig', async () => {
	await with_fixture(
		{
			'tsconfig.json': CLASSIC,
			'App.tsrx': APP,
			'preload.mjs': `import { tsrxHono } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};\nBun.plugin(tsrxHono());\n`,
			'app.test.js': `import { expect, test } from 'bun:test';\nimport { App } from './App.tsrx';\ntest('renders', async () => expect(String(await App({ message: 'hello' }))).toBe('<p>hello</p>'));\n`,
		},
		async (dir) => {
			const child = Bun.spawnSync({
				cmd: [process.execPath, 'test', '--preload', './preload.mjs', './app.test.js'],
				cwd: dir,
			});
			expect(child.stderr.toString()).toContain(' 1 pass');
			expect(child.exitCode).toBe(0);
		},
	);
});
