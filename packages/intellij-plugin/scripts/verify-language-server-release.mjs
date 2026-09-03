import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script_path = fileURLToPath(import.meta.url);
const package_dir = resolve(dirname(script_path), '..');
const package_name = '@tsrx/language-server';
const launcher_name = 'tsrx-language-server';

export function verifyPublishedLanguageServer({ rootDir = package_dir } = {}) {
	const sourcePackage = JSON.parse(
		readFileSync(resolve(rootDir, '../language-server/package.json'), 'utf8'),
	);
	const expectedVersion = readLanguageServerVersion(sourcePackage);
	const installRoot = mkdtempSync(join(tmpdir(), 'tsrx-language-server-release-'));

	try {
		const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
		const result = spawnSync(
			npm,
			[
				'install',
				`${package_name}@${expectedVersion}`,
				'--prefix',
				installRoot,
				'--no-audit',
				'--no-fund',
				'--ignore-scripts',
			],
			{ encoding: 'utf8' },
		);
		if (result.error) throw result.error;
		if (result.status !== 0) {
			process.stderr.write(result.stderr);
			process.stdout.write(result.stdout);
			throw new Error(`npm install failed with exit code ${result.status}`);
		}

		const installedRoot = resolve(installRoot, 'node_modules/@tsrx/language-server');
		const packageMetadata = JSON.parse(
			readFileSync(resolve(installedRoot, 'package.json'), 'utf8'),
		);
		const launcher = resolve(
			installRoot,
			'node_modules/.bin',
			process.platform === 'win32' ? `${launcher_name}.cmd` : launcher_name,
		);
		validateInstalledLanguageServer({
			packageMetadata,
			expectedVersion,
			launcherExists: statSync(launcher).isFile(),
		});
		process.stdout.write(
			`Verified ${package_name}@${expectedVersion} with lifecycle scripts disabled.\n`,
		);
		return expectedVersion;
	} finally {
		rmSync(installRoot, { recursive: true, force: true });
	}
}

export function readLanguageServerVersion(packageMetadata) {
	if (packageMetadata.name !== package_name) {
		throw new Error(`Expected package ${package_name}, received ${packageMetadata.name}`);
	}
	if (
		typeof packageMetadata.version !== 'string' ||
		!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(packageMetadata.version)
	) {
		throw new Error(`Expected ${package_name} to contain a valid version`);
	}
	return packageMetadata.version;
}

export function validateInstalledLanguageServer({
	packageMetadata,
	expectedVersion,
	launcherExists,
}) {
	if (packageMetadata.name !== package_name) {
		throw new Error(`Expected package ${package_name}, received ${packageMetadata.name}`);
	}
	if (packageMetadata.version !== expectedVersion) {
		throw new Error(`Expected version ${expectedVersion}, received ${packageMetadata.version}`);
	}
	if (packageMetadata.bin?.[launcher_name] !== 'dist/language-server.js') {
		throw new Error(`Expected the ${launcher_name} launcher declaration`);
	}
	if (!launcherExists) throw new Error(`Expected the installed ${launcher_name} launcher`);
}

if (process.argv[1] && resolve(process.argv[1]) === script_path) {
	verifyPublishedLanguageServer();
}
