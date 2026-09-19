import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const cli_path = fileURLToPath(new URL('../src/tsc.js', import.meta.url));
const cli_require = createRequire(cli_path);
const tsc_path = cli_require.resolve('typescript/lib/tsc.js');
const preact_dir = fileURLToPath(new URL('../../tsrx-preact/', import.meta.url));
const preact_require = createRequire(path.join(preact_dir, 'package.json'));

/** @type {string} */
let workspace;

beforeEach(() => {
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-tsc-'));
	fs.mkdirSync(path.join(workspace, 'node_modules', '@tsrx'), { recursive: true });
	fs.symlinkSync(preact_dir, path.join(workspace, 'node_modules', '@tsrx', 'preact'), 'junction');
	fs.symlinkSync(
		path.dirname(preact_require.resolve('preact/package.json')),
		path.join(workspace, 'node_modules', 'preact'),
		'junction',
	);
	fs.writeFileSync(path.join(workspace, 'package.json'), '{"type":"module"}');
	fs.writeFileSync(
		path.join(workspace, 'tsconfig.json'),
		JSON.stringify({
			tsrx: { compiler: '@tsrx/preact' },
			compilerOptions: {
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'react-jsx',
				jsxImportSource: 'preact',
				allowImportingTsExtensions: true,
				target: 'ES2022',
				strict: true,
				skipLibCheck: true,
				types: [],
			},
			include: ['main.ts'],
		}),
	);
	fs.writeFileSync(
		path.join(workspace, 'main.ts'),
		"import MainLayout from './layout.tsrx';\nMainLayout({ title: 'Hello' });\n",
	);
	fs.writeFileSync(
		path.join(workspace, 'layout.tsrx'),
		'export default function MainLayout({ title }: { title: string }) @{\n\t<div>{title}</div>\n}\n',
	);
});

afterEach(() => {
	fs.rmSync(workspace, { recursive: true, force: true });
});

/** @param {string} loader @param {string[]} [args] */
function run_cli(loader, args = ['--noEmit', '-p', 'tsconfig.json']) {
	const runner_path = path.join(workspace, 'runner.cjs');
	fs.writeFileSync(
		runner_path,
		`
const assert = require('node:assert/strict');
const fs = require('node:fs');
const node_module = require('node:module');
const original_read = fs.readFileSync;
const register = node_module.registerHooks;
if (${JSON.stringify(loader)} === 'bypass') {
	// Model Deno's loader by reading tsc without consulting Volar's fs patch.
	register({
		load(url, context, nextLoad) {
			if (url === ${JSON.stringify(pathToFileURL(tsc_path).href)}) {
				return {
					format: 'commonjs',
					source: original_read(${JSON.stringify(tsc_path)}, 'utf8'),
					shortCircuit: true,
				};
			}
			return nextLoad(url, context);
		},
	});
}
let active_hooks = 0;
node_module.registerHooks = ${JSON.stringify(loader)} === 'legacy' ? undefined : (options) => {
	const hook = register(options);
	const deregister = hook.deregister.bind(hook);
	let active = true;
	active_hooks++;
	return {
		deregister() {
			if (active) active_hooks--;
			active = false;
			deregister();
		},
	};
};
const exit = {};
process.exit = (code) => {
	process.exitCode = code;
	throw exit;
};
try {
	require(${JSON.stringify(cli_path)});
} catch (error) {
	if (error !== exit) throw error;
} finally {
	assert.equal(active_hooks, 0, 'the CLI must deregister its load hook');
	assert.equal(fs.readFileSync, original_read, 'Volar must restore the fs reader');
}
`,
	);
	const result = spawnSync(process.execPath, [runner_path, ...args, '--pretty', 'false'], {
		cwd: workspace,
		encoding: 'utf8',
		timeout: 30_000,
	});
	expect(result.error).toBeUndefined();
	expect(result.signal).toBeNull();
	return { status: result.status, output: result.stdout + result.stderr };
}

describe.each(['native', 'bypass', 'legacy'])('tsrx-tsc with the %s loader', (loader) => {
	it('resolves .tsrx imports from TypeScript and checks template syntax', () => {
		const result = run_cli(loader);
		expect(result.output).toBe('');
		expect(result.status).toBe(0);
	});

	it('reports type errors in .tsrx files and their TypeScript consumers', () => {
		fs.appendFileSync(path.join(workspace, 'main.ts'), 'MainLayout({ title: 123 });\n');
		fs.appendFileSync(path.join(workspace, 'layout.tsrx'), 'export const count: number = "bad";\n');
		const result = run_cli(loader);
		expect(result.status).toBe(2);
		expect(result.output).toContain('main.ts(3,14): error TS2322');
		expect(result.output).toContain('layout.tsrx(4,14): error TS2322');
		expect(result.output).not.toContain('TS2307');
	});

	it('uses the installed TypeScript version for --version', () => {
		const result = run_cli(loader, ['--version']);
		expect(result.output).toBe(`Version ${cli_require('typescript').version}\n`);
		expect(result.status).toBe(0);
	});
});

describe('tsrx-tsc with a TypeScript 7 package', () => {
	it('explains that the native TypeScript package has no JavaScript API instead of failing on its export map', () => {
		// What `typescript@7` resolves to: an export map without `lib/tsc.js` and a
		// main that only carries the version.
		const stub_dir = path.join(workspace, 'typescript-7-stub');
		fs.mkdirSync(path.join(stub_dir, 'lib'), { recursive: true });
		fs.writeFileSync(
			path.join(stub_dir, 'package.json'),
			JSON.stringify({
				name: 'typescript',
				version: '7.0.2',
				exports: { './package.json': './package.json', '.': './lib/version.cjs' },
			}),
		);
		fs.writeFileSync(
			path.join(stub_dir, 'lib', 'version.cjs'),
			'module.exports = { version: "7.0.2", versionMajorMinor: "7.0" };',
		);
		const runner_path = path.join(workspace, 'runner-ts7.cjs');
		fs.writeFileSync(
			runner_path,
			`
const node_module = require('node:module');
const path = require('node:path');
const stub_dir = ${JSON.stringify(stub_dir)};
const original_resolve = node_module.Module._resolveFilename;
node_module.Module._resolveFilename = function (request, ...rest) {
	if (request === 'typescript/package.json') return path.join(stub_dir, 'package.json');
	if (request === 'typescript') return path.join(stub_dir, 'lib', 'version.cjs');
	return original_resolve.call(this, request, ...rest);
};
require(${JSON.stringify(cli_path)});
`,
		);
		const result = spawnSync(process.execPath, [runner_path, '--noEmit', '-p', 'tsconfig.json'], {
			cwd: workspace,
			encoding: 'utf8',
			timeout: 30_000,
		});
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		const output = result.stdout + result.stderr;
		expect(output).toContain('tsrx-tsc resolved typescript@7.0.2');
		expect(output).toContain('^5.9.3 || ^6.0.0');
		expect(output).toContain('https://github.com/tsrx-org/tsrx/issues/');
		expect(output).not.toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');
	});
});
