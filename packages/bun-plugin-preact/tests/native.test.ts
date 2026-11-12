import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tsrxPreact } from '../src/index.js';

const APP = 'export function App(props) { return <p>{props.message}</p>; }';
const CLASSIC = JSON.stringify({ compilerOptions: { jsx: 'react', jsxFactory: 'h' } });

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

async function build_app(dir: string, mode: 'development' | 'production') {
	const result = await Bun.build({
		entrypoints: [join(dir, 'App.tsrx')],
		target: 'bun',
		external: ['preact', 'preact/*'],
		define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
		plugins: [tsrxPreact()],
	});
	expect(result.success).toBe(true);
	const js = await result.outputs[0].text();
	const output = join(dir, `${mode}.js`);
	await writeFile(output, js);
	return { js, App: (await import(output)).App };
}

test.each(['development', 'production'] as const)(
	'renders with the %s JSX runtime',
	async (mode) => {
		await with_fixture({ 'App.tsrx': APP }, async (dir) => {
			const { js, App } = await build_app(dir, mode);
			expect(js).toContain(
				mode === 'development' ? '"preact/jsx-dev-runtime"' : '"preact/jsx-runtime"',
			);
			expect(App({ message: 'hello' })).toMatchObject({ type: 'p', props: { children: 'hello' } });
		});
	},
);

test.each(['development', 'production'] as const)(
	'renders under a classic jsx tsconfig in %s',
	async (mode) => {
		await with_fixture({ 'App.tsrx': APP, 'tsconfig.json': CLASSIC }, async (dir) => {
			const { App } = await build_app(dir, mode);
			expect(App({ message: 'hello' })).toMatchObject({ type: 'p' });
		});
	},
);

test('builds a module that starts with a shebang', async () => {
	await with_fixture({ 'App.tsrx': `#!/usr/bin/env bun\n${APP}` }, async (dir) => {
		const { App } = await build_app(dir, 'development');
		expect(App({ message: 'hello' })).toMatchObject({ type: 'p' });
	});
});

// A `bun:test` preload registers the plugin with Bun.plugin(), and Bun's
// runtime reads the JSX settings from the working directory's tsconfig.
test.each([
	['a classic jsx tsconfig', { 'tsconfig.json': CLASSIC }, 'development'],
	['NODE_ENV=production', {}, 'production'],
])('renders through a bun:test preload with %s', async (_name, files, node_env) => {
	await with_fixture(
		{
			...files,
			'App.tsrx': APP,
			'preload.mjs': `import { tsrxPreact } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};\nBun.plugin(tsrxPreact());\n`,
			'app.test.js': `import { expect, test } from 'bun:test';\nimport { App } from './App.tsrx';\ntest('renders', () => expect(App({ message: 'hello' }).type).toBe('p'));\n`,
		},
		async (dir) => {
			const child = Bun.spawnSync({
				cmd: [process.execPath, 'test', '--preload', './preload.mjs', './app.test.js'],
				cwd: dir,
				env: { ...process.env, NODE_ENV: node_env },
			});
			expect(child.stderr.toString()).toContain(' 1 pass');
			expect(child.exitCode).toBe(0);
		},
	);
});
