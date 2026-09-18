import { describe, expect, it } from 'vitest';
import {
	BACKEND_SETTING,
	CONTRIBUTOR_ID,
	NATIVE_TYPESCRIPT_EXTENSION_IDS,
	create_content_mapper_contribution,
	normalize_backend_setting,
	resolve_backend,
} from '../src/backend.js';

describe('TypeScript backend resolution', () => {
	it('treats anything but classic/native as auto', () => {
		expect(normalize_backend_setting(undefined)).toBe('auto');
		expect(normalize_backend_setting('tsgo')).toBe('auto');
		expect(normalize_backend_setting('classic')).toBe('classic');
		expect(normalize_backend_setting('native')).toBe('native');
	});

	it('always honours an explicit classic setting', () => {
		for (const nativeExtension of /** @type {const} */ ([
			'missing',
			'installed',
			'available',
			'no-api',
		])) {
			expect(resolve_backend({ setting: 'classic', nativeExtension, useTsgo: true })).toEqual({
				backend: 'classic',
				reason: 'setting-classic',
			});
		}
	});

	it('auto picks native only when TypeScript 7 is installed and enabled', () => {
		expect(
			resolve_backend({ setting: 'auto', nativeExtension: 'installed', useTsgo: true }),
		).toEqual({ backend: 'native', reason: 'auto-native' });
		expect(
			resolve_backend({ setting: undefined, nativeExtension: 'available', useTsgo: true }),
		).toEqual({ backend: 'native', reason: 'auto-native' });
		expect(
			resolve_backend({ setting: 'auto', nativeExtension: 'installed', useTsgo: false }),
		).toEqual({ backend: 'classic', reason: 'auto-classic' });
		expect(resolve_backend({ setting: 'auto', nativeExtension: 'missing', useTsgo: true })).toEqual(
			{ backend: 'classic', reason: 'auto-classic' },
		);
		expect(resolve_backend({ setting: 'auto', nativeExtension: 'no-api', useTsgo: true })).toEqual({
			backend: 'classic',
			reason: 'auto-classic',
		});
	});

	it('explicit native falls back to classic with a reason when TypeScript 7 is unusable', () => {
		expect(
			resolve_backend({ setting: 'native', nativeExtension: 'installed', useTsgo: false }),
		).toEqual({ backend: 'native', reason: 'setting-native' });
		expect(
			resolve_backend({ setting: 'native', nativeExtension: 'missing', useTsgo: true }),
		).toEqual({ backend: 'classic', reason: 'native-extension-missing' });
		expect(
			resolve_backend({ setting: 'native', nativeExtension: 'no-api', useTsgo: true }),
		).toEqual({ backend: 'classic', reason: 'native-api-missing' });
	});

	it('looks up the stable TypeScript 7 extension before the nightly one', () => {
		expect(NATIVE_TYPESCRIPT_EXTENSION_IDS).toEqual([
			'TypeScriptTeam.vscode-typescript',
			'TypeScriptTeam.vscode-typescript-nightly',
		]);
		expect(BACKEND_SETTING).toBe('tsrx.typescript.backend');
	});
});

describe('content mapper contribution', () => {
	it('registers the bundled mapper for .tsrx in inferred projects under this extension id', () => {
		const cwd = { scheme: 'file', fsPath: '/ext' };
		const contribution = create_content_mapper_contribution({
			serverPath: '/ext/dist/content-mapper.js',
			cwd,
			version: '1.2.3',
			execPath: '/usr/bin/node',
		});
		expect(CONTRIBUTOR_ID).toBe('TSRX.tsrx-vscode-plugin');
		expect(contribution.extensions).toEqual(['.tsrx']);
		expect(contribution.inferredProject).toEqual({
			options: {},
			manifest: {
				name: '@tsrx/content-mapper',
				version: '1.2.3',
				exec: ['/usr/bin/node', '/ext/dist/content-mapper.js'],
				cwd,
				dynamicConfig: true,
			},
		});
		// Older TypeScript 7 builds read the serialized field name on the API.
		expect(contribution.inferredProjectContribution).toBe(contribution.inferredProject);
	});
});
