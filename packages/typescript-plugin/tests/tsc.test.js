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

/**
 * Stand in for what `typescript@7` resolves to: a launcher with an export map
 * without `lib/tsc.js` and a main that only carries the version. With
 * `platform_binary`, a fake `@typescript/typescript-<os>-<arch>` package whose
 * `lib/tsc` records how it was called is installed beside it.
 * @param {string} version
 * @param {{ platform_binary?: string }} [options] The fake binary's source.
 */
function install_typescript_7_stub(version, options = {}) {
	const stub_dir = path.join(workspace, 'node_modules', 'typescript');
	fs.mkdirSync(path.join(stub_dir, 'lib'), { recursive: true });
	fs.writeFileSync(
		path.join(stub_dir, 'package.json'),
		JSON.stringify({
			name: 'typescript',
			version,
			type: 'module',
			bin: { tsc: './bin/tsc' },
			exports: { './package.json': './package.json', '.': './lib/version.cjs' },
		}),
	);
	fs.writeFileSync(
		path.join(stub_dir, 'lib', 'version.cjs'),
		`module.exports = { version: ${JSON.stringify(version)}, versionMajorMinor: "7.0" };`,
	);
	if (options.platform_binary !== undefined) {
		const platform_dir = path.join(
			workspace,
			'node_modules',
			'@typescript',
			`typescript-${process.platform}-${process.arch}`,
		);
		fs.mkdirSync(path.join(platform_dir, 'lib'), { recursive: true });
		fs.writeFileSync(
			path.join(platform_dir, 'package.json'),
			JSON.stringify({
				name: `@typescript/typescript-${process.platform}-${process.arch}`,
				version,
			}),
		);
		const binary = path.join(platform_dir, 'lib', 'tsc');
		fs.writeFileSync(binary, `#!/usr/bin/env node\n${options.platform_binary}`);
		fs.chmodSync(binary, 0o755);
	}
	return stub_dir;
}

/**
 * Run the CLI with `typescript` resolving to the stub launcher, the way it does
 * in a project whose only TypeScript is the native compiler's package.
 * @param {string} stub_dir
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
function run_cli_with_typescript_7(stub_dir, args, env = {}) {
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
	const result = spawnSync(process.execPath, [runner_path, ...args], {
		cwd: workspace,
		encoding: 'utf8',
		timeout: 30_000,
		env: { ...process.env, ...env },
	});
	expect(result.error).toBeUndefined();
	return { status: result.status, output: result.stdout + result.stderr };
}

describe('tsrx-tsc with a TypeScript 7 package', () => {
	it('explains that a build without the content-mapper protocol cannot be used instead of failing on its export map', () => {
		const stub_dir = install_typescript_7_stub('7.0.2');
		const result = run_cli_with_typescript_7(stub_dir, ['--noEmit', '-p', 'tsconfig.json']);
		expect(result.status).toBe(1);
		expect(result.output).toContain('tsrx-tsc resolved typescript@7.0.2');
		expect(result.output).toContain('^5.9.3 || ^6.0.0');
		expect(result.output).toContain('7.1.0-dev.20260822.1');
		expect(result.output).toContain('https://github.com/tsrx-org/tsrx/issues/');
		expect(result.output).not.toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');
	});

	it('explains a missing platform package instead of crashing', () => {
		const stub_dir = install_typescript_7_stub('7.1.0-dev.20260918.1');
		const result = run_cli_with_typescript_7(stub_dir, ['--version']);
		expect(result.status).toBe(1);
		expect(result.output).toContain(
			`could not resolve @typescript/typescript-${process.platform}-${process.arch}`,
		);
	});

	describe.skipIf(process.platform === 'win32')('with a content-mapper build', () => {
		const record_call = `
const fs = require('node:fs');
fs.writeFileSync(process.env.TSRX_TEST_CALL, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));
process.stdout.write('native tsc ran\\n');
process.exit(Number(process.env.TSRX_TEST_EXIT ?? 0));
`;

		/** @param {Record<string, unknown>} config */
		function write_tsconfig(config) {
			fs.writeFileSync(path.join(workspace, 'tsconfig.json'), JSON.stringify(config));
		}

		const mapper_entry = { package: '@tsrx/content-mapper', extensions: ['.tsrx'] };

		it('runs the native binary with --runExternalCode and passes the exit code through', () => {
			const stub_dir = install_typescript_7_stub('7.1.0-dev.20260918.1', {
				platform_binary: record_call,
			});
			write_tsconfig({ tsrx: { compiler: '@tsrx/preact' }, contentMappers: [mapper_entry] });
			const call_file = path.join(workspace, 'call.json');
			const result = run_cli_with_typescript_7(
				stub_dir,
				['--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'],
				{ TSRX_TEST_CALL: call_file, TSRX_TEST_EXIT: '2' },
			);
			expect(result.output).toBe('native tsc ran\n');
			expect(result.status).toBe(2);
			const call = JSON.parse(fs.readFileSync(call_file, 'utf8'));
			expect(call.argv).toEqual([
				'--runExternalCode',
				'--noEmit',
				'-p',
				'tsconfig.json',
				'--pretty',
				'false',
			]);
			expect(fs.realpathSync(call.cwd)).toBe(fs.realpathSync(workspace));
		});

		it('keeps --build first and finds the mapper through extends', () => {
			const stub_dir = install_typescript_7_stub('7.1.0-dev.20260918.1', {
				platform_binary: record_call,
			});
			fs.writeFileSync(
				path.join(workspace, 'tsconfig.base.json'),
				JSON.stringify({ contentMappers: [mapper_entry] }),
			);
			write_tsconfig({ extends: './tsconfig.base.json', compilerOptions: { composite: true } });
			const call_file = path.join(workspace, 'call.json');
			const result = run_cli_with_typescript_7(stub_dir, ['--build', '.', '--verbose'], {
				TSRX_TEST_CALL: call_file,
			});
			expect(result.status).toBe(0);
			expect(JSON.parse(fs.readFileSync(call_file, 'utf8')).argv).toEqual([
				'--build',
				'.',
				'--verbose',
				'--runExternalCode',
			]);
		});

		it('refuses a files:[] project that still compiles through inherited include', () => {
			const stub_dir = install_typescript_7_stub('7.1.0-dev.20260918.1', {
				platform_binary: record_call,
			});
			// `files: []` only disables the default glob; an inherited include still
			// compiles those matches, so this leaf needs a mapper.
			fs.writeFileSync(
				path.join(workspace, 'tsconfig.base.json'),
				JSON.stringify({ include: ['**/*'] }),
			);
			write_tsconfig({
				extends: './tsconfig.base.json',
				files: [],
				references: [{ path: './lib' }],
			});
			fs.mkdirSync(path.join(workspace, 'lib'));
			fs.writeFileSync(
				path.join(workspace, 'lib', 'tsconfig.json'),
				JSON.stringify({
					contentMappers: [mapper_entry],
					compilerOptions: { composite: true },
				}),
			);
			const call_file = path.join(workspace, 'call.json');
			const refused = run_cli_with_typescript_7(stub_dir, ['--build'], {
				TSRX_TEST_CALL: call_file,
			});
			expect(refused.status).toBe(1);
			expect(refused.output).toContain(
				`${path.join(workspace, 'tsconfig.json')} declares no content mapper`,
			);
			expect(fs.existsSync(call_file)).toBe(false);
		});

		it('checks every compiling project of a --build graph and skips solution configs', () => {
			const stub_dir = install_typescript_7_stub('7.1.0-dev.20260918.1', {
				platform_binary: record_call,
			});
			// A solution root only points at projects; it has no mapper and needs none.
			write_tsconfig({ files: [], references: [{ path: './lib' }, { path: './app' }] });
			fs.mkdirSync(path.join(workspace, 'lib'));
			fs.mkdirSync(path.join(workspace, 'app'));
			fs.writeFileSync(
				path.join(workspace, 'lib', 'tsconfig.json'),
				JSON.stringify({ contentMappers: [mapper_entry], compilerOptions: { composite: true } }),
			);
			fs.writeFileSync(
				path.join(workspace, 'app', 'tsconfig.json'),
				JSON.stringify({ compilerOptions: { composite: true }, references: [{ path: '../lib' }] }),
			);
			const call_file = path.join(workspace, 'call.json');
			const refused = run_cli_with_typescript_7(stub_dir, ['--build'], {
				TSRX_TEST_CALL: call_file,
			});
			expect(refused.status).toBe(1);
			expect(refused.output).toContain(
				`${path.join(workspace, 'app', 'tsconfig.json')} declares no content mapper`,
			);
			expect(fs.existsSync(call_file)).toBe(false);

			fs.writeFileSync(
				path.join(workspace, 'app', 'tsconfig.json'),
				JSON.stringify({
					contentMappers: [mapper_entry],
					compilerOptions: { composite: true },
					references: [{ path: '../lib' }],
				}),
			);
			const accepted = run_cli_with_typescript_7(stub_dir, ['--build'], {
				TSRX_TEST_CALL: call_file,
			});
			expect(accepted.status).toBe(0);
			expect(JSON.parse(fs.readFileSync(call_file, 'utf8')).argv).toEqual([
				'--build',
				'--runExternalCode',
			]);
		});

		it('leaves a tsconfig that does not parse to the compiler instead of refusing it', () => {
			const stub_dir = install_typescript_7_stub('7.1.0-dev.20260918.1', {
				platform_binary: record_call,
			});
			fs.writeFileSync(path.join(workspace, 'tsconfig.json'), '{ "contentMappers": [ oops');
			const call_file = path.join(workspace, 'call.json');
			const result = run_cli_with_typescript_7(stub_dir, ['--noEmit', '-p', 'tsconfig.json'], {
				TSRX_TEST_CALL: call_file,
			});
			expect(result.status).toBe(0);
			expect(result.output).not.toContain('declares no content mapper');
			expect(fs.existsSync(call_file)).toBe(true);
		});

		it('refuses a project that declares no content mapper for .tsrx files', () => {
			const stub_dir = install_typescript_7_stub('7.1.0-dev.20260918.1', {
				platform_binary: record_call,
			});
			write_tsconfig({ tsrx: { compiler: '@tsrx/preact' } });
			const call_file = path.join(workspace, 'call.json');
			const result = run_cli_with_typescript_7(stub_dir, ['--noEmit', '-p', 'tsconfig.json'], {
				TSRX_TEST_CALL: call_file,
			});
			expect(result.status).toBe(1);
			expect(result.output).toContain('declares no content mapper for .tsrx files');
			expect(result.output).toContain('@tsrx/content-mapper');
			expect(fs.existsSync(call_file)).toBe(false);
		});

		it('leaves --version and explicit source files to the binary', () => {
			const stub_dir = install_typescript_7_stub('7.1.0-dev.20260918.1', {
				platform_binary: record_call,
			});
			// The tsconfig here declares no mapper; neither invocation reads it.
			write_tsconfig({});
			const call_file = path.join(workspace, 'call.json');
			expect(
				run_cli_with_typescript_7(stub_dir, ['--version'], { TSRX_TEST_CALL: call_file }).status,
			).toBe(0);
			expect(JSON.parse(fs.readFileSync(call_file, 'utf8')).argv).toEqual([
				'--runExternalCode',
				'--version',
			]);
			expect(
				run_cli_with_typescript_7(stub_dir, ['main.ts', '--noEmit'], { TSRX_TEST_CALL: call_file })
					.status,
			).toBe(0);
			expect(JSON.parse(fs.readFileSync(call_file, 'utf8')).argv).toEqual([
				'--runExternalCode',
				'main.ts',
				'--noEmit',
			]);
		});
	});
});
