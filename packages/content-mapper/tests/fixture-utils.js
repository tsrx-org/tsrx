import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const consumer_fixture_dir = fileURLToPath(new URL('./fixtures/consumer/', import.meta.url));

/**
 * @typedef {{
 * 	file: string,
 * 	line: number,
 * 	column: number,
 * 	code: string,
 * 	message: string,
 * }} ExpectedDiagnostic
 */

/**
 * The parity reference shared by the classic (`tsrx-tsc`) and native
 * (`tsc --runExternalCode`) checks of the consumer fixture.
 * @returns {{ exitCode: number, diagnostics: ExpectedDiagnostic[] }}
 */
export function read_expected_diagnostics() {
	return JSON.parse(
		fs.readFileSync(path.join(consumer_fixture_dir, 'expected-diagnostics.json'), 'utf8'),
	);
}

/**
 * Parse `tsc --pretty false` output into comparable records. Codes are
 * `TS2322` for TypeScript's own diagnostics and `tsrx1000` (diagnostic source
 * plus numeric code) for mapper-authored ones. Continuation lines (indented
 * message detail) are folded into the preceding diagnostic.
 * @param {string} output
 * @returns {ExpectedDiagnostic[]}
 */
export function parse_tsc_output(output) {
	/** @type {ExpectedDiagnostic[]} */
	const diagnostics = [];
	for (const line of output.split(/\r?\n/)) {
		const match = /^(.+?)\((\d+),(\d+)\): error ([A-Za-z]+\d+): (.*)$/.exec(line);
		if (match) {
			diagnostics.push({
				file: match[1].replace(/\\/g, '/'),
				line: Number(match[2]),
				column: Number(match[3]),
				code: match[4],
				message: match[5],
			});
		} else if (diagnostics.length > 0 && /^\s+\S/.test(line)) {
			diagnostics[diagnostics.length - 1].message += '\n' + line.trim();
		}
	}
	return diagnostics;
}

export const repo_root = fileURLToPath(new URL('../../../', import.meta.url));
const package_dir = fileURLToPath(new URL('../', import.meta.url));

/**
 * Absolute path of the pinned native TypeScript 7 binary for this platform,
 * resolved from the repository root's `@typescript/typescript-<os>-<arch>`
 * optional dependency. Throws when it is missing: the native path must be
 * exercised in CI, never skipped.
 * @returns {string}
 */
export function native_tsc_path() {
	const package_name = `@typescript/typescript-${process.platform}-${process.arch}`;
	const binary = path.join(
		repo_root,
		'node_modules',
		package_name,
		'lib',
		process.platform === 'win32' ? 'tsc.exe' : 'tsc',
	);
	if (!fs.existsSync(binary)) {
		throw new Error(
			`Native TypeScript binary not found at ${binary}. Install the pinned ${package_name} package (pnpm install).`,
		);
	}
	return binary;
}

/**
 * Create a throwaway project that uses the mapper from source through an
 * inferred-style manifest: `node_modules/@tsrx/content-mapper/package.json`
 * declares `exec: [process.execPath, <src/server.js>]`, so tests always run
 * the current sources rather than a stale `dist/`. Target compilers and
 * runtime type packages are symlinked from this package's `node_modules`.
 * @param {Record<string, string>} files Relative path → content, written into the workspace.
 * @param {{ dependencies?: Array<string | [name: string, provider_dir: string]>, mapperOptions?: Record<string, unknown> }} [options]
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function create_native_workspace(files, options = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-content-mapper-'));
	for (const entry of options.dependencies ?? ['@tsrx/react', 'react', '@types/react']) {
		// A tuple names the workspace package whose node_modules provides the
		// dependency, for packages this package does not declare itself.
		const [dependency, provider] = Array.isArray(entry) ? entry : [entry, package_dir];
		const source = fs.realpathSync(path.join(provider, 'node_modules', dependency));
		const target = path.join(dir, 'node_modules', dependency);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.symlinkSync(source, target, 'junction');
	}
	const mapper_dir = path.join(dir, 'node_modules', '@tsrx', 'content-mapper');
	fs.mkdirSync(mapper_dir, { recursive: true });
	fs.writeFileSync(
		path.join(mapper_dir, 'package.json'),
		JSON.stringify(
			{
				name: '@tsrx/content-mapper',
				version: '0.0.0-test',
				type: 'module',
				typescript: {
					contentMapper: {
						exec: [process.execPath, path.join(package_dir, 'src', 'server.js')],
						dynamicConfig: true,
					},
				},
			},
			null,
			'\t',
		),
	);
	for (const [name, content] of Object.entries(files)) {
		const target = path.join(dir, name);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, content);
	}
	return {
		dir,
		cleanup() {
			fs.rmSync(dir, { recursive: true, force: true });
		},
	};
}

/**
 * Copy the consumer fixture into a workspace object for {@link create_native_workspace}.
 * @param {Record<string, unknown>} [mapper_options]
 * @returns {Record<string, string>}
 */
export function consumer_fixture_files(mapper_options) {
	/** @type {Record<string, string>} */
	const files = {};
	for (const name of ['Panel.tsrx', 'Button.tsrx', 'main.ts', 'tsconfig.json']) {
		files[name] = fs.readFileSync(path.join(consumer_fixture_dir, name), 'utf8');
	}
	files['tsconfig.native.json'] = JSON.stringify(
		{
			extends: './tsconfig.json',
			contentMappers: [
				{
					package: '@tsrx/content-mapper',
					extensions: ['.tsrx'],
					...(mapper_options ? { options: mapper_options } : null),
				},
			],
		},
		null,
		'\t',
	);
	return files;
}

/**
 * Run the native `tsc` with content mappers enabled.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ status: number | null, stdout: string, stderr: string, output: string }}
 */
export function run_native_tsc(cwd, args) {
	// `--build` has to be the first argument; `--runExternalCode` can follow anywhere.
	const argv =
		args[0] === '--build' ? [...args, '--runExternalCode'] : ['--runExternalCode', ...args];
	const result = spawnSync(native_tsc_path(), argv, {
		cwd,
		encoding: 'utf8',
		timeout: 120_000,
		env: { ...process.env, TSRX_DEBUG: undefined },
	});
	if (result.error) {
		throw result.error;
	}
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		output: result.stdout + result.stderr,
	};
}

const classic_cli = path.join(repo_root, 'packages', 'typescript-plugin', 'src', 'tsc.js');

/**
 * Run the classic Volar-based `tsrx-tsc` from source.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ status: number | null, output: string }}
 */
export function run_classic_tsc(cwd, args) {
	const result = spawnSync(process.execPath, [classic_cli, ...args], {
		cwd,
		encoding: 'utf8',
		timeout: 120_000,
	});
	if (result.error) {
		throw result.error;
	}
	return { status: result.status, output: result.stdout + result.stderr };
}

/**
 * Read every file of a fixture directory (non-recursive) into a workspace
 * object and add a `tsconfig.native.json` sidecar that enables the mapper.
 * @param {string} fixture_dir
 * @param {Record<string, unknown>} [mapper_options]
 * @returns {Record<string, string>}
 */
export function fixture_files_with_native_config(fixture_dir, mapper_options) {
	/** @type {Record<string, string>} */
	const files = {};
	for (const name of fs.readdirSync(fixture_dir)) {
		if (fs.statSync(path.join(fixture_dir, name)).isFile()) {
			files[name] = fs.readFileSync(path.join(fixture_dir, name), 'utf8');
		}
	}
	files['tsconfig.native.json'] = JSON.stringify(
		{
			extends: './tsconfig.json',
			contentMappers: [
				{
					package: '@tsrx/content-mapper',
					extensions: ['.tsrx'],
					...(mapper_options ? { options: mapper_options } : null),
				},
			],
		},
		null,
		'\t',
	);
	return files;
}
