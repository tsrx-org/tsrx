/**
 * `tsrx-tsc` in a project whose only `typescript` is the TypeScript 7 launcher
 * package: the wrapper runs the pinned native binary with `--runExternalCode`
 * and the mapper, so the one command serves the native path too.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MINIMUM_NATIVE_TYPESCRIPT_VERSION } from '@tsrx/typescript-plugin/src/typescript-version.js';
import {
	consumer_fixture_files,
	create_native_workspace,
	native_tsc_path,
	parse_tsc_output,
	read_expected_diagnostics,
	repo_root,
} from './fixture-utils.js';

const classic_cli = path.join(repo_root, 'packages', 'typescript-plugin', 'src', 'tsc.js');

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * The consumer fixture plus a `typescript` launcher package (the shape of
 * `typescript@7`: an export map without `lib/tsc.js`) whose platform package
 * is the pinned native binary.
 * @returns {{ dir: string, version: string }}
 */
function native_typescript_workspace() {
	const created = create_native_workspace(consumer_fixture_files());
	cleanups.push(created.cleanup);
	const platform_dir = path.dirname(path.dirname(native_tsc_path()));
	const platform_manifest = path.join(platform_dir, 'package.json');
	const version = fs.existsSync(platform_manifest)
		? JSON.parse(fs.readFileSync(platform_manifest, 'utf8')).version
		: MINIMUM_NATIVE_TYPESCRIPT_VERSION;
	const platform_link = path.join(
		created.dir,
		'node_modules',
		'@typescript',
		`typescript-${process.platform}-${process.arch}`,
	);
	fs.mkdirSync(path.dirname(platform_link), { recursive: true });
	fs.symlinkSync(platform_dir, platform_link, 'junction');
	const launcher_dir = path.join(created.dir, 'node_modules', 'typescript');
	fs.mkdirSync(path.join(launcher_dir, 'lib'), { recursive: true });
	fs.writeFileSync(
		path.join(launcher_dir, 'package.json'),
		JSON.stringify({
			name: 'typescript',
			version,
			type: 'module',
			bin: { tsc: './bin/tsc' },
			exports: { './package.json': './package.json', '.': './lib/version.cjs' },
		}),
	);
	fs.writeFileSync(
		path.join(launcher_dir, 'lib', 'version.cjs'),
		`module.exports = { version: ${JSON.stringify(version)} };`,
	);
	return { dir: created.dir, version };
}

/**
 * Run `tsrx-tsc` from source with `typescript` resolving to the workspace's
 * launcher package, as it does when the wrapper is installed in that project.
 * @param {string} dir
 * @param {string[]} args
 */
function run_tsrx_tsc(dir, args) {
	const runner_path = path.join(dir, 'tsrx-tsc-runner.cjs');
	const launcher_dir = path.join(dir, 'node_modules', 'typescript');
	fs.writeFileSync(
		runner_path,
		`
const node_module = require('node:module');
const path = require('node:path');
const launcher_dir = ${JSON.stringify(launcher_dir)};
const original_resolve = node_module.Module._resolveFilename;
node_module.Module._resolveFilename = function (request, ...rest) {
	if (request === 'typescript/package.json') return path.join(launcher_dir, 'package.json');
	if (request === 'typescript') return path.join(launcher_dir, 'lib', 'version.cjs');
	return original_resolve.call(this, request, ...rest);
};
require(${JSON.stringify(classic_cli)});
`,
	);
	const result = spawnSync(process.execPath, [runner_path, ...args], {
		cwd: dir,
		encoding: 'utf8',
		timeout: 120_000,
		env: { ...process.env, TSRX_DEBUG: undefined },
	});
	if (result.error) {
		throw result.error;
	}
	return { status: result.status, output: result.stdout + result.stderr };
}

describe('tsrx-tsc on the TypeScript 7 package', () => {
	it('reports the native compiler version', () => {
		const { dir, version } = native_typescript_workspace();
		const result = run_tsrx_tsc(dir, ['--version']);
		expect(result.output).toBe(`Version ${version}\n`);
		expect(result.status).toBe(0);
	});

	it('checks the consumer fixture through the mapper with the classic diagnostics', () => {
		const { dir } = native_typescript_workspace();
		const result = run_tsrx_tsc(dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		const expected = read_expected_diagnostics();
		expect(parse_tsc_output(result.output)).toEqual(expected.diagnostics);
		expect(result.status).toBe(expected.exitCode);
	});

	it('refuses to run a tsconfig without a content mapper rather than skipping .tsrx files', () => {
		const { dir } = native_typescript_workspace();
		const result = run_tsrx_tsc(dir, ['--noEmit', '-p', 'tsconfig.json', '--pretty', 'false']);
		expect(result.status).toBe(1);
		expect(result.output).toContain('tsconfig.json declares no content mapper for .tsrx files');
		expect(result.output).not.toContain('TS2307');
	});
});
