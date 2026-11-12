import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tsrxReact } from '../src/index.js';

const APP = 'export function App(props) { return <p>{props.message}</p>; }';
const CLASSIC = JSON.stringify({ compilerOptions: { jsx: 'react' } });

async function with_fixture(
	files: Record<string, string>,
	callback: (dir: string) => Promise<void>,
) {
	const dir = await mkdtemp(join(import.meta.dir, '.native-'));
	try {
		for (const [name, contents] of Object.entries(files)) {
			await mkdir(dirname(join(dir, name)), { recursive: true });
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
		define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
		plugins: [tsrxReact()],
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
			expect(js.includes('jsx-dev-runtime')).toBe(mode === 'development');
			expect(App({ message: 'hello' })).toMatchObject({ type: 'p', props: { children: 'hello' } });
		});
	},
);

test('renders under a classic jsx tsconfig', async () => {
	await with_fixture({ 'App.tsrx': APP, 'tsconfig.json': CLASSIC }, async (dir) => {
		const { App } = await build_app(dir, 'development');
		expect(App({ message: 'hello' })).toMatchObject({ type: 'p' });
	});
});

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
			'preload.mjs': `import { tsrxReact } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};\nBun.plugin(tsrxReact());\n`,
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

// Bun builds from the working directory when every entrypoint is a `files` key.
test('reads the platform from the working directory for in-memory entrypoints', async () => {
	await with_fixture(
		{
			'tsconfig.json': JSON.stringify({ tsrx: { platform: 'ios' } }),
			'Probe.tsrx':
				'export const flags = [import.meta.env.platform.web, import.meta.env.platform.ios];',
			'build.mjs': `import { tsrxReact } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};
const result = await Bun.build({
	entrypoints: ['/virtual/main.ts'],
	files: { '/virtual/main.ts': 'export { flags } from ' + JSON.stringify(process.cwd() + '/Probe.tsrx') + ';' },
	target: 'bun',
	plugins: [tsrxReact()],
});
const url = 'data:text/javascript;base64,' + Buffer.from(await result.outputs[0].text()).toString('base64');
console.log(JSON.stringify((await import(url)).flags));
`,
		},
		async (dir) => {
			const child = Bun.spawnSync({ cmd: [process.execPath, 'build.mjs'], cwd: dir });
			expect(child.stderr.toString()).toBe('');
			expect(child.stdout.toString().trim()).toBe('[false,true]');
		},
	);
});

// Bun's runtime reads only the working directory's own tsconfig, so a classic
// tsconfig in a parent folder must not change the runtime that Bun.plugin() uses.
test('ignores a classic tsconfig above the working directory for Bun.plugin()', async () => {
	await with_fixture(
		{
			'tsconfig.json': CLASSIC,
			'App.tsrx': APP,
			'app/run.mjs': `import { tsrxReact } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};
Bun.plugin(tsrxReact());
const { App } = await import('../App.tsrx');
console.log(App({ message: 'hello' }).type);
`,
		},
		async (dir) => {
			const child = Bun.spawnSync({
				cmd: [process.execPath, 'run.mjs'],
				cwd: join(dir, 'app'),
				env: { ...process.env, NODE_ENV: 'production' },
			});
			expect(child.stderr.toString()).toBe('');
			expect(child.stdout.toString().trim()).toBe('p');
		},
	);
});
