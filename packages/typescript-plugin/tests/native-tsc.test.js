import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NODE_CONFIG_HOST } from '../src/config-host.js';
import {
	declares_tsrx_content_mapper,
	project_config_paths,
	run_native_tsc,
} from '../src/native-tsc.js';

/** @type {string} */
let directory;

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-native-tsc-'));
});

afterEach(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

/** @param {string} relative_path @param {string | object} config */
function write_config(relative_path, config) {
	const config_path = path.join(directory, relative_path);
	fs.mkdirSync(path.dirname(config_path), { recursive: true });
	fs.writeFileSync(
		config_path,
		typeof config === 'string' ? config : `${JSON.stringify(config)}\n`,
	);
	return config_path;
}

const mapper = [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }];

describe('project_config_paths', () => {
	it('honors --project= and -p= instead of the working-directory tsconfig', () => {
		const cwd_config = write_config('tsconfig.json', {});
		const mapped = write_config('tsconfig.mapped.json', { contentMappers: mapper });
		expect(project_config_paths(['--noEmit', `--project=${mapped}`], directory)).toEqual([mapped]);
		expect(project_config_paths(['--noEmit', `-p=${mapped}`], directory)).toEqual([mapped]);
		expect(project_config_paths(['--noEmit', '-p', mapped], directory)).toEqual([mapped]);
		expect(project_config_paths(['--noEmit'], directory)).toEqual([cwd_config]);
	});

	it('resolves --project= to a directory that holds tsconfig.json', () => {
		const nested = write_config('app/tsconfig.json', { contentMappers: mapper });
		expect(project_config_paths(['--project=app'], directory)).toEqual([nested]);
	});
});

describe('declares_tsrx_content_mapper', () => {
	it('treats invalid JSON, a failed read, and a broken extends as declared', () => {
		const invalid = write_config('invalid.json', '{ not json');
		expect(declares_tsrx_content_mapper(invalid)).toBe(true);

		const missing_extends = write_config('missing-extends.json', { extends: './does-not-exist' });
		expect(declares_tsrx_content_mapper(missing_extends)).toBe(true);

		const unread = path.join(directory, 'unread.json');
		const host = {
			...NODE_CONFIG_HOST,
			readFile: () => undefined,
			fileExists: () => true,
		};
		expect(declares_tsrx_content_mapper(unread, host)).toBe(true);
	});

	it('still refuses a readable project that declares no mapper', () => {
		const config = write_config('tsconfig.json', { compilerOptions: { strict: true } });
		expect(declares_tsrx_content_mapper(config)).toBe(false);
	});
});

/**
 * A `typescript@7` launcher plus a platform binary that records how it was
 * called, so `run_native_tsc` can resolve a compiler without spawning the
 * real one.
 * @returns {string} The launcher `package.json` path.
 */
function install_native_stub() {
	const launcher = path.join(directory, 'node_modules', 'typescript');
	fs.mkdirSync(path.join(launcher, 'lib'), { recursive: true });
	fs.writeFileSync(
		path.join(launcher, 'package.json'),
		JSON.stringify({ name: 'typescript', version: '7.1.0-dev.20260918.1' }),
	);
	const platform = path.join(
		directory,
		'node_modules',
		'@typescript',
		`typescript-${process.platform}-${process.arch}`,
	);
	fs.mkdirSync(path.join(platform, 'lib'), { recursive: true });
	fs.writeFileSync(path.join(platform, 'package.json'), '{}');
	const binary = path.join(platform, 'lib', process.platform === 'win32' ? 'tsc.exe' : 'tsc');
	fs.writeFileSync(
		binary,
		`#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.TSRX_TEST_CALL, JSON.stringify(process.argv.slice(2)));
process.exit(0);
`,
	);
	fs.chmodSync(binary, 0o755);
	return path.join(launcher, 'package.json');
}

describe.skipIf(process.platform === 'win32')('run_native_tsc mapper guard', () => {
	/** @param {string[]} args */
	function run(args) {
		/** @type {string} */
		let stderr = '';
		const status = run_native_tsc({
			typescript_package_json_path: install_native_stub(),
			args,
			cwd: directory,
			env: { ...process.env, TSRX_TEST_CALL: path.join(directory, 'call.json') },
			stderr: {
				write: (chunk) => {
					stderr += chunk;
				},
			},
		});
		return { status, stderr, ran: fs.existsSync(path.join(directory, 'call.json')) };
	}

	it('checks the equals-form --project config, not the working-directory tsconfig', () => {
		write_config('tsconfig.json', {});
		write_config('tsconfig.mapped.json', { contentMappers: mapper });
		expect(run(['--noEmit', '--project=tsconfig.mapped.json'])).toMatchObject({
			status: 0,
			ran: true,
		});
		fs.rmSync(path.join(directory, 'call.json'), { force: true });
		expect(run(['--noEmit', '-p=tsconfig.json'])).toMatchObject({
			status: 1,
			ran: false,
		});
	});

	it('walks --build references and skips a solution-style root', () => {
		write_config('tsconfig.json', { files: [], references: [{ path: './pkg' }] });
		write_config('pkg/tsconfig.json', {
			contentMappers: mapper,
			compilerOptions: { composite: true },
		});
		expect(run(['--build'])).toMatchObject({ status: 0, ran: true, stderr: '' });
	});

	it('refuses a referenced project that declares no mapper', () => {
		write_config('tsconfig.json', {
			files: [],
			contentMappers: mapper,
			references: [{ path: './pkg' }],
		});
		const pkg = write_config('pkg/tsconfig.json', { compilerOptions: { composite: true } });
		const result = run(['--build']);
		expect(result.status).toBe(1);
		expect(result.ran).toBe(false);
		expect(result.stderr).toContain(`${pkg} declares no content mapper for .tsrx files`);
	});

	it('lets tsc report an unreadable tsconfig instead of claiming no mapper', () => {
		write_config('tsconfig.json', '{ not json');
		expect(run(['--noEmit', '-p', 'tsconfig.json'])).toMatchObject({
			status: 0,
			ran: true,
			stderr: '',
		});
	});
});
