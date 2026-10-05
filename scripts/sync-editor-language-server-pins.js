import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const default_root = join(dirname(fileURLToPath(import.meta.url)), '..');
const package_name = '@tsrx/language-server';
// The Neovim plugin accepts only an exact x.y.z pin (packages/nvim-plugin/lua/tsrx/lsp.lua).
const version_pattern = /^\d+\.\d+\.\d+$/;
const npm_attempts = 10;
const npm_retry_ms = 30_000;

/**
 * Moves the `@tsrx/language-server` version that the Neovim and Sublime Text
 * integrations install to the workspace's server version, and rebuilds the Sublime
 * Text lockfile against it. It first waits until npm serves that version, for about
 * five minutes. When the pins move, it adds a changeset that releases both editors.
 * The Publish workflow runs this after npm publish and opens a pull request with
 * the result. With `check`, it only verifies that the pins and the lockfile name
 * one version.
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
	write_changeset(rootDir, version);
	logger.log(`Neovim and Sublime Text: ${format_previous(pins)} → ${version}`);
	return { changed: true, version };
}

/**
 * Adds a changeset for both editors, so the next Version Packages pull request
 * releases them with the new pin.
 */
function write_changeset(rootDir, version) {
	const directory = join(rootDir, '.changeset');
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, `editor-language-server-${version.replaceAll('.', '-')}.md`),
		[
			'---',
			"'@tsrx/nvim-plugin': patch",
			"'@tsrx/sublime-text-plugin': patch",
			'---',
			'',
			`Install \`${package_name}\` ${version} when a project has no server of its own.`,
			'',
		].join('\n'),
	);
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
	const spec = `${package_name}@${version}`;
	// npm can take a little while to serve a version it has just published.
	for (let attempt = 1; ; attempt++) {
		const result = run_npm(['view', spec, 'version', '--prefer-online'], directory);
		if (result.status === 0 && result.stdout.trim() === version) break;
		if (attempt === npm_attempts) {
			throw new Error(`npm does not serve ${spec}:\n${result.stderr}${result.stdout}`);
		}
		logger.log(
			`npm does not serve ${spec} yet (attempt ${attempt} of ${npm_attempts}); checking again in ${npm_retry_ms / 1000} seconds.`,
		);
		await sleep(npm_retry_ms);
	}

	const args = [
		'install',
		'--package-lock-only',
		'--prefer-online',
		'--ignore-scripts',
		'--no-audit',
		'--no-fund',
	];
	const result = run_npm(args, directory);
	if (result.status !== 0) {
		throw new Error(
			`npm ${args.join(' ')} failed with exit code ${result.status}:\n${result.stderr}${result.stdout}`,
		);
	}
}

function run_npm(args, cwd) {
	const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const result = spawnSync(npm, args, { cwd, encoding: 'utf8' });
	if (result.error) throw result.error;
	return result;
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
