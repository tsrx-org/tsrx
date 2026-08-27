#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (rootPackage.name !== 'tsrx-monorepo') {
	throw new Error(`Refusing to clean Zed artifacts outside the TSRX repository: ${root}`);
}

const zedPlugin = join(root, 'packages/zed-plugin');

function installedExtensionPaths() {
	if (platform() === 'darwin') {
		return ['Zed', 'Zed Preview'].map((app) =>
			join(homedir(), 'Library', 'Application Support', app, 'extensions', 'installed', 'tsrx'),
		);
	}

	if (platform() === 'win32') {
		const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
		return [join(localAppData, 'Zed', 'extensions', 'installed', 'tsrx')];
	}

	const dataRoot = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
	return ['zed', 'zed-preview'].map((app) =>
		join(dataRoot, app, 'extensions', 'installed', 'tsrx'),
	);
}

const source = realpathSync(zedPlugin);
const directInstall = installedExtensionPaths().find(
	(installedPath) =>
		existsSync(installedPath) &&
		lstatSync(installedPath).isSymbolicLink() &&
		realpathSync(installedPath) === source,
);

if (directInstall) {
	console.error(`Zed is still linked directly to ${source}.`);
	console.error('Install the staged extension before cleaning the working tree.');
	process.exit(1);
}

const generatedPaths = [
	join(zedPlugin, 'target'),
	join(zedPlugin, 'grammars'),
	join(zedPlugin, 'extension.wasm'),
];

let removed = 0;

for (const generatedPath of generatedPaths) {
	if (!existsSync(generatedPath)) {
		continue;
	}

	rmSync(generatedPath, { recursive: true, force: true });
	console.log(`Removed ${generatedPath}`);
	removed += 1;
}

if (removed === 0) {
	console.log('No in-repository Zed build artifacts found.');
}
