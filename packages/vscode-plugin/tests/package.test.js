import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const package_json = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

describe('@tsrx/vscode-plugin package contract', () => {
	it('uses the TSRX marketplace identity', () => {
		expect(package_json).toMatchObject({
			name: '@tsrx/vscode-plugin',
			displayName: 'TSRX Syntax for VS Code',
			publisher: 'TSRX',
		});
		expect(package_json.scripts['pkg-name-release']).toContain('name tsrx-vscode-plugin');
		expect(JSON.stringify(package_json.contributes)).not.toMatch(/ripple/i);
	});

	it('enables Emmet completions for TSRX files by default', () => {
		const languages = /** @type {{ id: string, extensions: string[] }[]} */ (
			package_json.contributes.languages
		);
		const tsrx_language = languages.find((language) => language.extensions.includes('.tsrx'));

		expect(tsrx_language?.id).toBe('tsrx');
		expect(package_json.contributes.configurationDefaults).toMatchObject({
			'emmet.includeLanguages': {
				tsrx: 'html',
			},
			'emmet.showExpandedAbbreviation': 'always',
		});
	});

	it('activates when only a .tsrx file is open, not just for workspaces containing one', () => {
		expect(package_json.activationEvents).toEqual(
			expect.arrayContaining(['onLanguage:tsrx', 'workspaceContains:**/*.tsrx']),
		);
	});

	it('never runs in untrusted workspaces (compilers and the mapper execute workspace code)', () => {
		expect(package_json.capabilities.untrustedWorkspaces).toMatchObject({ supported: false });
	});

	it('contributes no TypeScript backend setting: the backend follows VS Code', () => {
		const properties = package_json.contributes.configuration.properties;
		expect(Object.keys(properties).filter((key) => /backend/i.test(key))).toEqual([]);
	});

	it('ships no content mapper of its own and depends on no other extension', () => {
		// On the native backend TypeScript 7 runs the mapper each tsconfig.json declares under
		// `contentMappers`; the extension neither bundles a copy nor registers one through the
		// TypeScript 7 extension's API.
		expect(package_json.dependencies['@tsrx/content-mapper']).toBeUndefined();
		expect(existsSync(resolve(__dirname, '../src/content-mapper.js'))).toBe(false);
		const tsdown_config = readFileSync(resolve(__dirname, '../tsdown.config.js'), 'utf8');
		expect(tsdown_config).not.toContain('content-mapper');
		expect(package_json.extensionDependencies).toBeUndefined();
		expect(package_json.extensionPack).toBeUndefined();
	});
});
