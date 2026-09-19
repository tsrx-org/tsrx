import { describe, expect, it } from 'vitest';
import {
	TSDK_SETTINGS,
	TYPESCRIPT_7_SETTING,
	TYPESCRIPT_7_SETTING_KEY,
	TYPESCRIPT_7_SETTING_SECTIONS,
	resolve_backend,
	tsdk_candidates,
} from '../src/backend.js';

describe('TypeScript backend resolution', () => {
	it("follows VS Code's TypeScript 7 switch, with no setting of its own", () => {
		expect(resolve_backend(true)).toBe('native');
		expect(resolve_backend(false)).toBe('classic');
	});

	it('reads the setting VS Code itself uses', () => {
		// `js/ts.experimental.useTsgo` is declared by VS Code's built-in TypeScript
		// extension (extensions/typescript-language-features/package.json) and is what
		// its "Select TypeScript Version" picker writes; `typescript.experimental.useTsgo`
		// is the deprecated spelling still honoured.
		expect(TYPESCRIPT_7_SETTING_SECTIONS).toEqual(['js/ts', 'typescript']);
		expect(TYPESCRIPT_7_SETTING_KEY).toBe('experimental.useTsgo');
		expect(TYPESCRIPT_7_SETTING).toBe('js/ts.experimental.useTsgo');
	});
});

describe('TypeScript installation for the classic backend', () => {
	it('tries the configured tsdk paths first, then the TypeScript VS Code ships', () => {
		expect(TSDK_SETTINGS).toEqual([
			{ section: 'js/ts', key: 'tsdk.path' },
			{ section: 'typescript', key: 'tsdk' },
		]);
		expect(
			tsdk_candidates({
				settingPaths: ['node_modules/typescript/lib', '/opt/ts/lib'],
				workspaceFolders: ['/ws/a', '/ws/b/'],
				vscodeTypescriptLib: '/Applications/Code.app/extensions/node_modules/typescript/lib',
			}),
		).toEqual([
			'/ws/a/node_modules/typescript/lib',
			'/ws/b/node_modules/typescript/lib',
			'/opt/ts/lib',
			'/Applications/Code.app/extensions/node_modules/typescript/lib',
		]);
		expect(
			tsdk_candidates({
				settingPaths: [],
				workspaceFolders: ['/ws'],
				vscodeTypescriptLib: undefined,
			}),
		).toEqual([]);
		expect(
			tsdk_candidates({
				settingPaths: ['C:\\ts\\lib', 'node_modules/typescript/lib'],
				workspaceFolders: ['C:\\ws'],
				vscodeTypescriptLib: undefined,
			}),
		).toEqual(['C:/ts/lib', 'C:/ws/node_modules/typescript/lib']);
	});
});
