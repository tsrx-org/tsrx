import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const default_root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version_pattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function synchronizeIntellijPluginVersions({
	rootDir = default_root,
	check = false,
	logger = console,
} = {}) {
	const plugin_package_path = join(rootDir, 'packages/intellij-plugin/package.json');
	const gradle_properties_path = join(rootDir, 'packages/intellij-plugin/gradle.properties');
	const plugin_package = read_package(plugin_package_path, '@tsrx/intellij-plugin');
	const original_properties = readFileSync(gradle_properties_path, 'utf8');
	let properties = original_properties;
	const changes = [];

	for (const [property, expected] of [['pluginVersion', plugin_package.version]]) {
		const result = synchronize_property(properties, property, expected, gradle_properties_path);
		properties = result.content;
		if (result.previous !== expected) {
			changes.push(`${property}: ${result.previous} → ${expected}`);
		}
	}

	if (changes.length === 0) {
		logger.log('IntelliJ plugin versions are synchronized.');
		return { changed: false, changes: [] };
	}

	if (check) {
		throw new Error(
			`IntelliJ plugin Gradle properties are out of sync:\n- ${changes.join('\n- ')}`,
		);
	}

	writeFileSync(gradle_properties_path, properties);
	for (const change of changes) logger.log(change);
	return { changed: true, changes };
}

function read_package(path, expected_name) {
	const package_json = JSON.parse(readFileSync(path, 'utf8'));
	if (package_json.name !== expected_name) {
		throw new Error(`Expected ${path} to define package ${expected_name}`);
	}
	if (typeof package_json.version !== 'string' || !version_pattern.test(package_json.version)) {
		throw new Error(`Expected ${path} to contain a valid version`);
	}
	return package_json;
}

function synchronize_property(content, property, expected, path) {
	const pattern = new RegExp(`^${property}=([^\\r\\n]*)$`, 'gm');
	const matches = [...content.matchAll(pattern)];
	if (matches.length !== 1) {
		throw new Error(`Expected ${property} exactly once in ${path}, found ${matches.length}`);
	}
	const previous = matches[0][1];
	return {
		previous,
		content: content.replace(pattern, `${property}=${expected}`),
	};
}

const invoked_path = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked_path === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	const root_index = args.indexOf('--root');
	if (root_index >= 0 && !args[root_index + 1]) {
		throw new Error('--root requires a directory');
	}
	synchronizeIntellijPluginVersions({
		rootDir: root_index >= 0 ? resolve(args[root_index + 1]) : default_root,
		check: args.includes('--check'),
	});
}
