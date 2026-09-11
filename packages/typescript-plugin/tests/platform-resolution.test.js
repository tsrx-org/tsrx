import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	reset_consumer_compiler_resolution_caches,
	resolve_consumer_platform_for_file,
} from '../src/consumer-compiler.js';

/** @type {string} */
let directory;

/** @param {string} relative_path @param {unknown} config */
function write_config(relative_path, config) {
	const config_path = path.join(directory, relative_path);
	fs.mkdirSync(path.dirname(config_path), { recursive: true });
	fs.writeFileSync(config_path, JSON.stringify(config, null, 2) + '\n');
	return config_path;
}

/** @param {string} config_path @param {string[]} [dependencies] */
function resolve_platform(config_path, dependencies) {
	return resolve_consumer_platform_for_file(
		path.join(path.dirname(config_path), 'src', 'App.tsrx'),
		{
			ts,
			configFileName: config_path,
			configHost: ts.sys,
			dependencies: dependencies ? new Set(dependencies) : undefined,
		},
	);
}

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-platform-resolution-'));
	reset_consumer_compiler_resolution_caches();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(directory, { recursive: true, force: true });
});

describe('consumer TSRX platform resolution', () => {
	it.each(['web', 'ios', 'android'])('resolves the %s truth-table selection', (platform) => {
		const config_path = write_config('tsconfig.json', {
			tsrx: { compiler: '@tsrx/react', platform },
		});

		expect(resolve_platform(config_path)).toBe(platform);
	});

	it('allows platform to be omitted', () => {
		const config_path = write_config('tsconfig.json', {
			tsrx: { compiler: '@tsrx/react' },
		});

		expect(resolve_platform(config_path)).toBeUndefined();
	});

	it('resolves inherited and nested project selections with child precedence', () => {
		const base_path = write_config('configs/base.json', {
			tsrx: { compiler: '@tsrx/react', platform: 'web' },
		});
		const root_path = write_config('tsconfig.json', {
			extends: './configs/base.json',
		});
		const nested_path = write_config('native/tsconfig.json', {
			extends: '../tsconfig.json',
			tsrx: { platform: 'android' },
		});
		const dependencies = new Set();

		const platform = resolve_consumer_platform_for_file(
			path.join(directory, 'native', 'src', 'App.tsrx'),
			{
				ts,
				configFileName: nested_path,
				configHost: ts.sys,
				dependencies,
			},
		);

		expect(platform).toBe('android');
		expect(dependencies).toEqual(new Set([nested_path, root_path, base_path]));
	});

	it.each([
		['another string', 'windows'],
		['null', null],
		['boolean', true],
		['number', 1],
		['array', ['web']],
		['object', { name: 'web' }],
	])('rejects a %s platform without coercion', (_, platform) => {
		const config_path = write_config(`invalid-${String(_).replace(/\s/g, '-')}.json`, {
			tsrx: { compiler: '@tsrx/react', platform },
		});
		reset_consumer_compiler_resolution_caches();

		expect(() => resolve_platform(config_path)).toThrow(
			/Invalid TSRX platform declaration.*Expected "web", "ios", or "android"/,
		);
	});
});
