import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const default_root = join(dirname(fileURLToPath(import.meta.url)), '..');
const package_name = '@tsrx/language-server';
// The Neovim plugin accepts only an exact x.y.z pin (packages/nvim-plugin/lua/tsrx/lsp.lua).
const version_pattern = /^\d+\.\d+\.\d+$/;
const lockfile_attempts = 10;
const lockfile_retry_ms = 30_000;

/**
 * Moves the `@tsrx/language-server` version that the Neovim and Sublime Text
 * integrations install to the workspace's server version, and rebuilds the Sublime
 * Text lockfile against it. The version must already be on npm, so the Publish
 * workflow runs this after npm publish and opens a pull request with the result.
 * With `check`, it only verifies that the pins and the lockfile name one version.
 */
export async function synchronizeEditorLanguageServerPins({
	rootDir = default_root,
	check = false,
	logger = console,
	updateLockfile = update_lockfile,
} = {}) {
	const paths = {
		server: join(rootDir, 'packages/language-server/package.json'),
		nvim: join(rootDir, 'packages/nvim-plugin/package.json'),
		sublime: join(rootDir, 'packages/sublime-text-plugin/src/language-server/package.json'),
		lockfile: join(rootDir, 'packages/sublime-text-plugin/src/language-server/package-lock.json'),
	};
	const nvim = read_json(paths.nvim);
	const sublime = read_json(paths.sublime);
	const pins = read_pins(nvim, sublime, read_json(paths.lockfile));

	if (check) {
		const versions = new Set(Object.values(pins));
		const [version] = versions;
		if (versions.size !== 1 || typeof version !== 'string' || !version_pattern.test(version)) {
			throw new Error(
				`Neovim and Sublime Text must pin one exact ${package_name} version:\n${format_pins(pins)}`,
			);
		}
		logger.log(`Neovim and Sublime Text pin ${package_name}@${version}.`);
		return { changed: false, version };
	}

	const version = read_server_version(paths.server);
	if (Object.values(pins).every((pin) => pin === version)) {
		logger.log(`Neovim and Sublime Text already pin ${package_name}@${version}.`);
		return { changed: false, version };
	}

	nvim.config = { ...nvim.config, [package_name]: version };
	sublime.dependencies = { ...sublime.dependencies, [package_name]: version };
	write_json(paths.nvim, nvim);
	write_json(paths.sublime, sublime);
	await updateLockfile({ directory: dirname(paths.lockfile), version, logger });

	const updated = read_pins(nvim, sublime, read_json(paths.lockfile));
	if (!Object.values(updated).every((pin) => pin === version)) {
		throw new Error(
			`The Sublime Text lockfile did not move to ${version}:\n${format_pins(updated)}`,
		);
	}
	logger.log(`Neovim and Sublime Text: ${format_previous(pins)} → ${version}`);
	return { changed: true, version };
}

function read_pins(nvim, sublime, lockfile) {
	return {
		'packages/nvim-plugin/package.json config': nvim.config?.[package_name],
		'packages/sublime-text-plugin/src/language-server/package.json dependencies':
			sublime.dependencies?.[package_name],
		'package-lock.json root dependencies': lockfile.packages?.['']?.dependencies?.[package_name],
		'package-lock.json installed version':
			lockfile.packages?.[`node_modules/${package_name}`]?.version,
	};
}

function format_pins(pins) {
	return Object.entries(pins)
		.map(([where, version]) => `- ${where}: ${version ?? 'missing'}`)
		.join('\n');
}

function format_previous(pins) {
	return [...new Set(Object.values(pins).map((version) => version ?? 'missing'))].join(', ');
}

function read_server_version(path) {
	const server = read_json(path);
	if (server.name !== package_name) {
		throw new Error(`Expected ${path} to define package ${package_name}`);
	}
	if (typeof server.version !== 'string' || !version_pattern.test(server.version)) {
		throw new Error(
			`Expected ${path} to contain an x.y.z version; the Neovim plugin installs only exact versions`,
		);
	}
	return server.version;
}

async function update_lockfile({ directory, version, logger }) {
	const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const args = ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'];
	// npm can take a little while to serve a version it has just published.
	for (let attempt = 1; ; attempt++) {
		const result = spawnSync(npm, args, { cwd: directory, encoding: 'utf8' });
		if (result.error) throw result.error;
		if (result.status === 0) return;
		if (attempt === lockfile_attempts) {
			throw new Error(
				`npm ${args.join(' ')} failed with exit code ${result.status}:\n${result.stderr}${result.stdout}`,
			);
		}
		logger.log(
			`npm cannot resolve ${package_name}@${version} yet (attempt ${attempt} of ${lockfile_attempts}); retrying in ${lockfile_retry_ms / 1000} seconds.`,
		);
		await sleep(lockfile_retry_ms);
	}
}

function read_json(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

function write_json(path, value) {
	writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

const invoked_path = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked_path === fileURLToPath(import.meta.url)) {
	await synchronizeEditorLanguageServerPins({ check: process.argv.slice(2).includes('--check') });
}
