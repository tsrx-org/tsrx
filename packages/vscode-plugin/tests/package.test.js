import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTRIBUTOR_ID } from '../src/backend.js';

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

	it('exposes one documented TypeScript backend setting defaulting to auto', () => {
		const setting = package_json.contributes.configuration.properties['tsrx.typescript.backend'];
		expect(setting).toMatchObject({
			type: 'string',
			enum: ['auto', 'classic', 'native'],
			default: 'auto',
			scope: 'window',
		});
		expect(setting.enumDescriptions).toHaveLength(3);
	});

	it('bundles @tsrx/content-mapper for inferred projects', () => {
		expect(package_json.dependencies['@tsrx/content-mapper']).toBe('workspace:*');
		expect(existsSync(resolve(__dirname, '../src/content-mapper.js'))).toBe(true);
		const tsdown_config = readFileSync(resolve(__dirname, '../tsdown.config.js'), 'utf8');
		expect(tsdown_config).toContain("'src/content-mapper.js'");
		// The contributor id handed to registerContentMappers is the marketplace identity.
		expect(CONTRIBUTOR_ID).toBe(`${package_json.publisher}.tsrx-vscode-plugin`);
	});
});
