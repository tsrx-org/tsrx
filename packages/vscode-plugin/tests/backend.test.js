import { describe, expect, it } from 'vitest';
import {
	BACKEND_SETTING,
	TYPESCRIPT_7_SETTING,
	TYPESCRIPT_7_SETTING_KEY,
	TYPESCRIPT_7_SETTING_SECTIONS,
	normalize_backend_setting,
	resolve_backend,
} from '../src/backend.js';

describe('TypeScript backend resolution', () => {
	it('treats anything but classic/native as auto', () => {
		expect(normalize_backend_setting(undefined)).toBe('auto');
		expect(normalize_backend_setting('typescript7')).toBe('auto');
		expect(normalize_backend_setting('classic')).toBe('classic');
		expect(normalize_backend_setting('native')).toBe('native');
	});

	it('always honours an explicit setting', () => {
		for (const typescript7Enabled of [true, false]) {
			expect(resolve_backend({ setting: 'classic', typescript7Enabled })).toEqual({
				backend: 'classic',
				reason: 'setting-classic',
			});
			expect(resolve_backend({ setting: 'native', typescript7Enabled })).toEqual({
				backend: 'native',
				reason: 'setting-native',
			});
		}
	});

	it('auto follows the TypeScript 7 setting', () => {
		expect(resolve_backend({ setting: 'auto', typescript7Enabled: true })).toEqual({
			backend: 'native',
			reason: 'auto-native',
		});
		expect(resolve_backend({ setting: undefined, typescript7Enabled: true })).toEqual({
			backend: 'native',
			reason: 'auto-native',
		});
		expect(resolve_backend({ setting: 'auto', typescript7Enabled: false })).toEqual({
			backend: 'classic',
			reason: 'auto-classic',
		});
	});

	it('reads the setting VS Code and the TypeScript 7 extension use', () => {
		// `js/ts.experimental.useTsgo` is declared by VS Code's built-in TypeScript
		// extension (extensions/typescript-language-features/package.json) and is what
		// its "Select TypeScript Version" picker writes; `typescript.experimental.useTsgo`
		// is the deprecated spelling both extensions still honour.
		expect(TYPESCRIPT_7_SETTING_SECTIONS).toEqual(['js/ts', 'typescript']);
		expect(TYPESCRIPT_7_SETTING_KEY).toBe('experimental.useTsgo');
		expect(TYPESCRIPT_7_SETTING).toBe('js/ts.experimental.useTsgo');
		expect(BACKEND_SETTING).toBe('tsrx.typescript.backend');
	});
});
