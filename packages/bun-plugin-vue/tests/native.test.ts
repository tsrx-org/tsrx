import { afterEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tsrxVue } from '../src/index.js';

// Each test starts `bun test` or Bun.build(), which can take well over Bun's
// default 5 s on a loaded machine.
const NATIVE_TIMEOUT = 60_000;

// Fixtures go in folders next to this file, so Bun resolves the workspace's
// packages from them. They're removed after each test, even one that timed out.
const temp_dirs: string[] = [];

async function make_temp_dir() {
	const dir = await mkdtemp(join(import.meta.dir, '.native-'));
	temp_dirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(temp_dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// A `bun:test` preload registers the plugin with Bun.plugin(), which requires
// an object from every onLoad hook it calls, so the plugin must not claim
// modules it leaves alone.
test(
	'works as a bun:test preload',
	async () => {
		const dir = await make_temp_dir();
		const files = {
			'preload.mjs': `import { tsrxVue } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};\nBun.plugin(tsrxVue());\n`,
			'helper.js': 'export const answer = 42;\n',
			'typed.ts': 'export const double = (value: number): number => value * 2;\n',
			'Answer.tsrx':
				"import { answer } from './helper.js';\nimport { double } from './typed.ts';\nexport const doubled = double(answer);\n",
			'plain.test.js': `import { expect, test } from 'bun:test';\nimport { answer } from './helper.js';\ntest('imports an ordinary module', () => expect(answer).toBe(42));\n`,
			'tsrx.test.js': `import { expect, test } from 'bun:test';\nimport { doubled } from './Answer.tsrx';\ntest('imports a .tsrx module', () => expect(doubled).toBe(84));\n`,
		};
		for (const [name, contents] of Object.entries(files)) {
			await writeFile(join(dir, name), contents);
		}
		const child = Bun.spawnSync({
			cmd: [
				process.execPath,
				'test',
				'--preload',
				'./preload.mjs',
				'./plain.test.js',
				'./tsrx.test.js',
			],
			cwd: dir,
		});
		expect(child.stderr.toString()).toContain(' 2 pass');
		expect(child.exitCode).toBe(0);
	},
	NATIVE_TIMEOUT,
);

// Bun.plugin() registration calls only the first onLoad hook whose filter
// matches, so instances that split the source files have to hand them on.
test(
	'splits the source files between two instances in a bun:test preload',
	async () => {
		const dir = await make_temp_dir();
		const files = {
			'preload.mjs': `import { tsrxVue } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};
Bun.plugin(tsrxVue({ exclude: [/Second\\.tsrx$/, /Asset\\.tsrx$/] }));
Bun.plugin(tsrxVue({ include: /Second\\.tsrx$/ }));
`,
			'First.tsrx': "export const name: string = 'first';\n",
			'Second.tsrx': "export const name: string = 'second';\n",
			'Asset.tsrx': 'export const unused = true;\n',
			'split.test.js': `import { expect, test } from 'bun:test';
import { name as first } from './First.tsrx';
import { name as second } from './Second.tsrx';
import asset from './Asset.tsrx';
test('loads both and the left-out file as Bun does', () => {
	expect([first, second]).toEqual(['first', 'second']);
	expect(asset).toEndWith('/Asset.tsrx');
});
`,
		};
		for (const [name, contents] of Object.entries(files)) {
			await writeFile(join(dir, name), contents);
		}
		const child = Bun.spawnSync({
			cmd: [process.execPath, 'test', '--preload', './preload.mjs', './split.test.js'],
			cwd: dir,
		});
		expect(child.stderr.toString()).toContain(' 1 pass');
		expect(child.exitCode).toBe(0);
	},
	NATIVE_TIMEOUT,
);

// An async onLoad hook makes Bun load the module asynchronously, and
// `require()` can't load an async module. The interop hook runs only in
// Bun.build(), so CommonJS and `require()` keep working under the preload.
test(
	'leaves require() of project modules working in a bun:test preload',
	async () => {
		const dir = await make_temp_dir();
		const files = {
			'preload.mjs': `import { tsrxVue } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};\nBun.plugin(tsrxVue());\n`,
			'legacy.cjs': "module.exports = { value: 'cjs' };\n",
			'helper.js': "exports.value = 'js';\n",
			'typed.cts': "const value: string = 'cts';\nmodule.exports = { value };\n",
			'require.test.js': `import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
test('requires CommonJS project modules', () => {
	const load = createRequire(import.meta.url);
	expect([load('./legacy.cjs'), load('./helper.js'), load('./typed.cts')].map((m) => m.value)).toEqual(['cjs', 'js', 'cts']);
	expect(require('./legacy.cjs').value).toBe('cjs');
});
`,
		};
		for (const [name, contents] of Object.entries(files)) {
			await writeFile(join(dir, name), contents);
		}
		const child = Bun.spawnSync({
			cmd: [process.execPath, 'test', '--preload', './preload.mjs', './require.test.js'],
			cwd: dir,
		});
		expect(child.stderr.toString()).toContain(' 1 pass');
		expect(child.exitCode).toBe(0);
	},
	NATIVE_TIMEOUT,
);

// vue-jsx-vapor's macros give a component with destructured props its `props`
// option, and read an identifier `props` through a helper module.
const GREETING_FILES = {
	'Greeting.tsrx': `export function Greeting({ name, greeting = 'Hello' }: { name: string; greeting?: string }) @{
	<p class="greeting">{greeting}{', '}{name}</p>
}
`,
	'Named.tsrx': `export function Named(props: { name: string }) @{
	<p class="named">{'Hi, '}{props.name}</p>
}
`,
};

/**
 * Writes `files`, plus stand-ins for `vue` and `vue-jsx-vapor`: Vue's browser
 * build with Vapor, since its Node build has none, and a copy of
 * vue-jsx-vapor's runtime that imports it.
 */
async function write_vue_project(dir: string, files: Record<string, string>) {
	const package_dir = (name: string, from: string) =>
		dirname(Bun.resolveSync(`${name}/package.json`, from));
	const vue_dir = package_dir('vue', import.meta.dir);
	const vapor_runtime_dir = package_dir(
		'@vue-jsx-vapor/runtime',
		package_dir('vue-jsx-vapor', import.meta.dir),
	);
	await mkdir(join(dir, 'node_modules/vue'), { recursive: true });
	await writeFile(
		join(dir, 'node_modules/vue/index.js'),
		`export * from ${JSON.stringify(join(vue_dir, 'dist/vue.runtime-with-vapor.esm-browser.js'))};\n`,
	);
	await cp(join(vapor_runtime_dir, 'dist'), join(dir, 'node_modules/vue-jsx-vapor'), {
		recursive: true,
	});
	for (const name of ['vue', 'vue-jsx-vapor']) {
		await writeFile(
			join(dir, 'node_modules', name, 'package.json'),
			JSON.stringify({ name, type: 'module', main: 'index.js' }),
		);
	}
	for (const [name, contents] of Object.entries(files)) {
		await writeFile(join(dir, name), contents);
	}
}

const RENDER_GREETINGS = `
import { JSDOM } from 'jsdom';
const { window } = new JSDOM('<!doctype html><body></body>');
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Text', 'Comment', 'DocumentFragment', 'SVGElement', 'MathMLElement']) {
	if (window[key] !== undefined) globalThis[key] = window[key];
}

export function render(createVaporApp, component, props) {
	const host = document.createElement('div');
	const app = createVaporApp(component, props);
	app.mount(host);
	const html = host.innerHTML;
	app.unmount();
	return html;
}
`;

test(
	'runs the macros in Bun.build()',
	async () => {
		const dir = await make_temp_dir();
		await write_vue_project(dir, {
			...GREETING_FILES,
			'entry.js': `export { Greeting } from './Greeting.tsrx';
export { Named } from './Named.tsrx';
export { createVaporApp } from 'vue';
`,
			'render.js': RENDER_GREETINGS,
		});
		const result = await Bun.build({
			entrypoints: [join(dir, 'entry.js')],
			outdir: join(dir, 'out'),
			target: 'browser',
			plugins: [tsrxVue()],
		});
		expect(result.logs).toEqual([]);
		expect(result.success).toBe(true);

		const { render } = await import(join(dir, 'render.js'));
		const { Greeting, Named, createVaporApp } = await import(join(dir, 'out/entry.js'));
		expect(render(createVaporApp, Greeting, { name: 'Ada' })).toBe(
			'<p class="greeting">Hello, Ada</p>',
		);
		expect(render(createVaporApp, Greeting, { name: 'Ada', greeting: 'Hi' })).toBe(
			'<p class="greeting">Hi, Ada</p>',
		);
		expect(render(createVaporApp, Named, { name: 'Lin' })).toBe('<p class="named">Hi, Lin</p>');
	},
	NATIVE_TIMEOUT,
);

test(
	'runs the macros in a bun:test preload',
	async () => {
		const dir = await make_temp_dir();
		await write_vue_project(dir, {
			...GREETING_FILES,
			'preload.mjs': `import { tsrxVue } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};\nBun.plugin(tsrxVue());\n`,
			'render.js': RENDER_GREETINGS,
			'greeting.test.js': `import { expect, test } from 'bun:test';
import { render } from './render.js';
import { createVaporApp } from 'vue';
import { Greeting } from './Greeting.tsrx';
import { Named } from './Named.tsrx';
test('renders the props', () => {
	expect(render(createVaporApp, Greeting, { name: 'Ada' })).toBe('<p class="greeting">Hello, Ada</p>');
	expect(render(createVaporApp, Named, { name: 'Lin' })).toBe('<p class="named">Hi, Lin</p>');
});
`,
		});
		const child = Bun.spawnSync({
			cmd: [process.execPath, 'test', '--preload', './preload.mjs', './greeting.test.js'],
			cwd: dir,
		});
		expect(child.stderr.toString()).toContain(' 1 pass');
		expect(child.exitCode).toBe(0);
	},
	NATIVE_TIMEOUT,
);

// Bun.plugin() registration calls only the first instance's helper hook, so it
// has to serve the helpers another instance's macros import.
test(
	"serves another instance's helper modules in a bun:test preload",
	async () => {
		const dir = await make_temp_dir();
		await write_vue_project(dir, {
			'Rich.tsrx': `export function Rich() @{
	const count = defineModel<number>('count');
	<p class="rich">{count.value}</p>
}
`,
			'preload.mjs': `import { tsrxVue } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};
Bun.plugin(tsrxVue({ vapor: { macros: false }, exclude: /Rich\\.tsrx$/ }));
Bun.plugin(tsrxVue({ include: /Rich\\.tsrx$/ }));
`,
			'render.js': RENDER_GREETINGS,
			'rich.test.js': `import { expect, test } from 'bun:test';
import { render } from './render.js';
import { createVaporApp } from 'vue';
import { Rich } from './Rich.tsrx';
test('renders the model', () => {
	expect(render(createVaporApp, Rich, { count: 3 })).toBe('<p class="rich">3</p>');
});
`,
		});
		const child = Bun.spawnSync({
			cmd: [process.execPath, 'test', '--preload', './preload.mjs', './rich.test.js'],
			cwd: dir,
		});
		expect(child.stderr.toString()).toContain(' 1 pass');
		expect(child.exitCode).toBe(0);
	},
	NATIVE_TIMEOUT,
);

// An earlier plugin's loose `include` sees every path with `.tsrx` in it, so
// helper modules must not be served from a `.tsrx` file's path.
test(
	"leaves helper modules out of another plugin's loose include in a bun:test preload",
	async () => {
		const dir = await make_temp_dir();
		await write_vue_project(dir, {
			'Rich.tsrx': `export function Rich() @{
	const count = defineModel<number>('count');
	<p class="rich">{count.value}</p>
}
`,
			'preload.mjs': `import { tsrxReact } from ${JSON.stringify(join(import.meta.dir, '../../bun-plugin-react/src/index.js'))};
import { tsrxVue } from ${JSON.stringify(join(import.meta.dir, '../src/index.js'))};
Bun.plugin(tsrxReact({ include: /\\.tsrx/, exclude: /Rich\\.tsrx$/ }));
Bun.plugin(tsrxVue({ include: /Rich\\.tsrx$/ }));
`,
			'render.js': RENDER_GREETINGS,
			'rich.test.js': `import { expect, test } from 'bun:test';
import { render } from './render.js';
import { createVaporApp } from 'vue';
import { Rich } from './Rich.tsrx';
test('renders the model', () => {
	expect(render(createVaporApp, Rich, { count: 3 })).toBe('<p class="rich">3</p>');
});
`,
		});
		const child = Bun.spawnSync({
			cmd: [process.execPath, 'test', '--preload', './preload.mjs', './rich.test.js'],
			cwd: dir,
		});
		expect(child.stderr.toString()).toContain(' 1 pass');
		expect(child.exitCode).toBe(0);
	},
	NATIVE_TIMEOUT,
);
