import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveBuildPlatform } from '../../src/config.js';

/** @type {string} */
let directory;

/** @param {string} relative_path @param {string | object} config */
function write_config(relative_path, config) {
	const file_name = path.join(directory, relative_path);
	fs.mkdirSync(path.dirname(file_name), { recursive: true });
	fs.writeFileSync(
		file_name,
		typeof config === 'string' ? config : JSON.stringify(config, null, 2),
	);
	return file_name;
}

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-build-platform-'));
});

afterEach(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe('build platform resolution', () => {
	it.each(['web', 'ios', 'android'])('reads %s from the nearest tsconfig', (platform) => {
		write_config('tsconfig.json', { tsrx: { platform } });
		expect(resolveBuildPlatform({ root: path.join(directory, 'src') })).toBe(platform);
	});

	it('resolves JSONC, inheritance, and the platform key independently from compiler', () => {
		write_config(
			'configs/base.json',
			`{
				// Shared target and platform
				"tsrx": { "compiler": "@tsrx/react", "platform": "ios", },
			}`,
		);
		write_config('tsconfig.json', {
			extends: './configs/base.json',
			tsrx: { compiler: '@tsrx/preact' },
		});

		expect(resolveBuildPlatform({ root: directory })).toBe('ios');
	});

	it('uses TypeScript extends-array precedence', () => {
		write_config('a.json', { tsrx: { platform: 'web' } });
		write_config('b.json', { tsrx: { platform: 'android' } });
		write_config('tsconfig.json', { extends: ['./a.json', './b.json'] });

		expect(resolveBuildPlatform({ root: directory })).toBe('android');
	});

	it('honors an explicit custom tsconfig path', () => {
		write_config('tsconfig.json', { tsrx: { platform: 'web' } });
		write_config('configs/tsconfig.native.json', { tsrx: { platform: 'android' } });

		expect(
			resolveBuildPlatform({ root: directory, tsconfig: 'configs/tsconfig.native.json' }),
		).toBe('android');
	});

	it('uses an explicit integration option only when tsconfig omits the platform', () => {
		write_config('tsconfig.json', { tsrx: { compiler: '@tsrx/react' } });
		expect(resolveBuildPlatform({ root: directory, platform: 'web' })).toBe('web');
	});

	it('rejects a mismatch between tsconfig and an explicit integration option', () => {
		write_config('tsconfig.json', { tsrx: { platform: 'ios' } });
		expect(() =>
			resolveBuildPlatform({
				root: directory,
				platform: 'web',
				integration: 'test builder',
			}),
		).toThrow(/platform mismatch.*tsconfig selects "ios".*option selects "web"/i);
	});

	it.each(['windows', null, true, 1, [], {}])('rejects invalid config value %j', (platform) => {
		write_config('tsconfig.json', { tsrx: { platform } });
		expect(() => resolveBuildPlatform({ root: directory })).toThrow(/Invalid TSRX platform/);
	});
});
