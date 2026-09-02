import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { synchronizeIntellijPluginVersions } from '../../../scripts/sync-intellij-plugin-version.js';
import {
	readLanguageServerVersion,
	validateInstalledLanguageServer,
} from '../scripts/verify-language-server-release.mjs';

const test_dir = dirname(fileURLToPath(import.meta.url));
const repository_dir = resolve(test_dir, '../../..');
const temporary_dirs = [];

afterEach(() => {
	for (const directory of temporary_dirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('@tsrx/intellij-plugin release contract', () => {
	it('versions the private package and keeps Gradle metadata synchronized', () => {
		const package_json = read_json(
			resolve(repository_dir, 'packages/intellij-plugin/package.json'),
		);
		const language_server = read_json(
			resolve(repository_dir, 'packages/language-server/package.json'),
		);
		const changesets = read_json(resolve(repository_dir, '.changeset/config.json'));
		const gradle_properties = read_properties(
			readFileSync(resolve(repository_dir, 'packages/intellij-plugin/gradle.properties'), 'utf8'),
		);
		const gradle_build = readFileSync(
			resolve(repository_dir, 'packages/intellij-plugin/build.gradle.kts'),
			'utf8',
		);

		expect(package_json.private).toBe(true);
		expect(changesets.ignore).not.toContain('@tsrx/intellij-plugin');
		expect(changesets.privatePackages).toEqual({ version: true, tag: false });
		expect(gradle_properties.pluginVersion).toBe(package_json.version);
		expect(gradle_properties).not.toHaveProperty('tsrxLspVersion');
		expect(gradle_build).toContain('../language-server/package.json');
		expect(gradle_build).not.toContain('providers.gradleProperty("tsrxLspVersion")');
		expect(readLanguageServerVersion(language_server)).toBe(language_server.version);
		expect(() =>
			synchronizeIntellijPluginVersions({ rootDir: repository_dir, check: true }),
		).not.toThrow();
	});

	it('updates only the owned Gradle property and is idempotent', () => {
		const fixture = create_fixture({
			pluginVersion: '1.2.3',
			gradleProperties: [
				'org.gradle.caching=true',
				'pluginVersion=0.0.1',
				'customProperty=preserved',
				'',
			].join('\n'),
		});

		synchronizeIntellijPluginVersions({ rootDir: fixture });
		const first_pass = readFileSync(
			resolve(fixture, 'packages/intellij-plugin/gradle.properties'),
			'utf8',
		);
		synchronizeIntellijPluginVersions({ rootDir: fixture });
		const second_pass = readFileSync(
			resolve(fixture, 'packages/intellij-plugin/gradle.properties'),
			'utf8',
		);

		expect(first_pass).toContain('pluginVersion=1.2.3');
		expect(first_pass).toContain('customProperty=preserved');
		expect(second_pass).toBe(first_pass);
	});

	it('reports drift in check mode without rewriting files', () => {
		const fixture = create_fixture({
			pluginVersion: '1.2.3',
			gradleProperties: 'pluginVersion=0.0.1\n',
		});
		const properties_path = resolve(fixture, 'packages/intellij-plugin/gradle.properties');
		const before = readFileSync(properties_path, 'utf8');

		expect(() => synchronizeIntellijPluginVersions({ rootDir: fixture, check: true })).toThrow(
			/out of sync.*pluginVersion/is,
		);
		expect(readFileSync(properties_path, 'utf8')).toBe(before);
	});

	it.each([
		['missing', '', /pluginVersion.*exactly once/i],
		['duplicate', 'pluginVersion=1.2.3\npluginVersion=1.2.3\n', /pluginVersion.*exactly once/i],
		['malformed', 'pluginVersion =1.2.3\n', /pluginVersion.*exactly once/i],
	])('rejects a %s owned Gradle property', (_name, gradleProperties, expected) => {
		const fixture = create_fixture({
			pluginVersion: '1.2.3',
			gradleProperties,
		});

		expect(() => synchronizeIntellijPluginVersions({ rootDir: fixture })).toThrow(expected);
	});

	it('uses a fresh Marketplace identity without renaming Kotlin packages', () => {
		const descriptor = readFileSync(
			resolve(repository_dir, 'packages/intellij-plugin/src/main/resources/META-INF/plugin.xml'),
			'utf8',
		);
		const provider = readFileSync(
			resolve(
				repository_dir,
				'packages/intellij-plugin/src/main/kotlin/dev/tsrx/intellij_plugin/TsrxTextMateBundleProvider.kt',
			),
			'utf8',
		);
		const ignored = readFileSync(
			resolve(repository_dir, 'packages/intellij-plugin/plugin-verifier-ignored-problems.txt'),
			'utf8',
		);

		expect(descriptor).toContain('<id>tsrx.intellij-plugin</id>');
		expect(provider).toContain(
			'PluginManager.getPluginByClass(TsrxTextMateBundleProvider::class.java)',
		);
		expect(provider).not.toContain('PluginManagerCore');
		expect(ignored).toBe(
			"tsrx.intellij-plugin::Package 'com\\.intellij\\.platform\\.lsp' is not found.*\n",
		);
	});

	it('keeps pull-request verification in one job and one reference IDE', () => {
		const workflow = readFileSync(
			resolve(repository_dir, '.github/workflows/intellij-plugin.yml'),
			'utf8',
		);
		const gradle = readFileSync(
			resolve(repository_dir, 'packages/intellij-plugin/build.gradle.kts'),
			'utf8',
		);

		expect(workflow.match(/^    runs-on:/gm)).toHaveLength(1);
		expect(workflow).toContain('test verifyPluginProjectConfiguration buildPlugin');
		expect(workflow).toContain('verifyPluginStructure verifyPlugin');
		expect(workflow).not.toContain('strategy:');
		expect(workflow).not.toContain('workflow_call:');
		expect(workflow).not.toMatch(/^\s*uses: (?!\.\/).*@v\d+/m);
		expect(gradle).toContain('create(IntelliJPlatformType.WebStorm, targetPlatformVersion)');
		expect(gradle).not.toContain('advertisedProductTypes');
	});

	it('publishes in one Changesets-gated job after npm publication', () => {
		const workflow = readFileSync(resolve(repository_dir, '.github/workflows/publish.yml'), 'utf8');
		const publish_job_start = workflow.indexOf('  publish:');
		const zed_job_start = workflow.indexOf('  publish-zed:');
		const intellij_job_start = workflow.indexOf('  publish-intellij-plugin:');
		const workflow_header = workflow.slice(0, publish_job_start);
		const publish_job = workflow.slice(publish_job_start, zed_job_start);
		const zed_job = workflow.slice(zed_job_start, intellij_job_start);
		const intellij_job = workflow.slice(intellij_job_start);

		expect(intellij_job.match(/^    runs-on:/gm)).toHaveLength(1);
		expect(workflow).toContain("contains(github.event.head_commit.message, 'Version Packages')");
		expect(workflow).toContain('packages/intellij-plugin/package.json');
		expect(workflow).toContain('intellij-version-changed: ${{ steps.intellij.outputs.changed }}');
		expect(workflow_header).not.toContain('concurrency:');
		expect(publish_job).toContain('group: npm-publish');
		expect(publish_job).not.toContain('Submit Zed extension update');
		expect(zed_job).toContain('needs: publish');
		expect(zed_job).toContain('group: zed-publish');
		expect(intellij_job).toContain('needs: publish');
		expect(intellij_job).toContain("needs.publish.result == 'success'");
		expect(intellij_job).toContain("needs.publish.outputs.intellij-version-changed == 'true'");
		expect(intellij_job).toContain('environment: jetbrains-marketplace');
		expect(intellij_job).toContain('group: intellij-plugin-publish');
		expect(intellij_job).toContain('verify-language-server-release.mjs');
		expect(intellij_job).toContain('signPlugin');
		expect(intellij_job).toContain('publishPlugin');
		expect(intellij_job).toContain('secrets.JETBRAINS_MARKETPLACE_CERTIFICATE_CHAIN');
		expect(intellij_job).toContain('secrets.JETBRAINS_MARKETPLACE_PRIVATE_KEY');
		expect(intellij_job).toContain('secrets.JETBRAINS_MARKETPLACE_PRIVATE_KEY_PASSWORD');
		expect(intellij_job).toContain('secrets.JETBRAINS_MARKETPLACE_PUBLISH_TOKEN');
		expect(intellij_job).toContain('Upload signed plugin archive');
		expect(intellij_job).not.toContain('secrets.CERTIFICATE_CHAIN');
		expect(intellij_job).not.toContain('secrets.PRIVATE_KEY');
		expect(intellij_job).not.toContain('secrets.PRIVATE_KEY_PASSWORD');
		expect(intellij_job).not.toContain('secrets.PUBLISH_TOKEN');
		expect(intellij_job).not.toContain('verify-marketplace-state.mjs');
		expect(intellij_job).not.toContain('steps.marketplace.outputs');
		expect(intellij_job).not.toMatch(/^\s*uses: (?!\.\/).*@v\d+/m);
	});

	it('accepts only the exact published language-server package and launcher', () => {
		const valid = {
			packageMetadata: {
				name: '@tsrx/language-server',
				version: '1.2.3',
				bin: { 'tsrx-language-server': 'dist/language-server.js' },
			},
			expectedVersion: '1.2.3',
			launcherExists: true,
		};

		expect(() => validateInstalledLanguageServer(valid)).not.toThrow();
		expect(() =>
			validateInstalledLanguageServer({
				...valid,
				packageMetadata: { ...valid.packageMetadata, version: '1.2.4' },
			}),
		).toThrow(/Expected version 1\.2\.3/);
		expect(() => validateInstalledLanguageServer({ ...valid, launcherExists: false })).toThrow(
			/installed tsrx-language-server launcher/,
		);
	});

	it('documents the Marketplace submission', () => {
		const readme = readFileSync(
			resolve(repository_dir, 'packages/intellij-plugin/README.md'),
			'utf8',
		);
		const release = readFileSync(
			resolve(repository_dir, 'packages/intellij-plugin/MARKETPLACE_RELEASE.md'),
			'utf8',
		);

		expect(readme).toContain('https://plugins.jetbrains.com/plugin/33991-tsrx');
		expect(release).toContain('Status: **under review — version 0.0.82**');
		expect(release).toContain('Plugin XML ID: `tsrx.intellij-plugin`');
		expect(release).toContain('Marketplace ID: `33991`');
		expect(release).toContain('https://plugins.jetbrains.com/plugin/33991-tsrx');
		expect(release).toContain('`dev.tsrx.intellij_plugin` XML');
		expect(release).toContain('ID were deleted');
	});
});

function create_fixture({ pluginVersion, gradleProperties }) {
	const root = mkdtempSync(resolve(tmpdir(), 'tsrx-intellij-version-'));
	temporary_dirs.push(root);
	mkdirSync(resolve(root, 'packages/intellij-plugin'), { recursive: true });
	writeFileSync(
		resolve(root, 'packages/intellij-plugin/package.json'),
		JSON.stringify({ name: '@tsrx/intellij-plugin', version: pluginVersion }),
	);
	writeFileSync(resolve(root, 'packages/intellij-plugin/gradle.properties'), gradleProperties);
	return root;
}

function read_json(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

function read_properties(content) {
	return Object.fromEntries(
		content
			.split(/\r?\n/)
			.filter((line) => line && !line.startsWith('#'))
			.map((line) => line.split('=', 2)),
	);
}
