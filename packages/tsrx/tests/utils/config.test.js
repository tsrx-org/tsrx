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

	it('finds the platform in a referenced active application config', () => {
		write_config('configs/base.json', { tsrx: { platform: 'ios' } });
		write_config('tsconfig.app.json', {
			extends: './configs/base.json',
			tsrx: { compiler: '@tsrx/react' },
		});
		write_config('tsconfig.node.json', { compilerOptions: { types: ['node'] } });
		write_config('tsconfig.json', {
			files: [],
			references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
		});

		expect(resolveBuildPlatform({ root: directory })).toBe('ios');
	});

	it('follows nested directory project references', () => {
		write_config('apps/native/tsconfig.json', { tsrx: { platform: 'android' } });
		write_config('apps/tsconfig.json', { references: [{ path: './native' }] });
		write_config('tsconfig.json', { references: [{ path: './apps' }] });

		expect(resolveBuildPlatform({ root: directory })).toBe('android');
	});

	it('rejects ambiguous platforms from referenced projects', () => {
		write_config('tsconfig.web.json', { tsrx: { platform: 'web' } });
		write_config('tsconfig.native.json', { tsrx: { platform: 'android' } });
		write_config('tsconfig.json', {
			references: [{ path: './tsconfig.web.json' }, { path: './tsconfig.native.json' }],
		});

		expect(() => resolveBuildPlatform({ root: directory })).toThrow(
			/referenced TypeScript projects select multiple TSRX platforms/i,
		);
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
