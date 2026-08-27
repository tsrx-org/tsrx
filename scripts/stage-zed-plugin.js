#!/usr/bin/env node

import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const stageMarkerName = '.tsrx-zed-dev-stage.json';
const stageMarkerKind = 'tsrx-zed-plugin-dev-stage';
const generatedEntries = new Set(['extension.wasm', 'grammars', 'target']);

const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const source = realpathSync(join(root, 'packages/zed-plugin'));

function defaultStageDirectory() {
	if (platform() === 'darwin') {
		return join(homedir(), 'Library', 'Caches', 'tsrx', 'zed-plugin-dev');
	}

	if (platform() === 'win32') {
		const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
		return join(localAppData, 'tsrx', 'zed-plugin-dev');
	}

	const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache');
	return join(cacheRoot, 'tsrx', 'zed-plugin-dev');
}

function isWithin(parent, child) {
	const pathFromParent = relative(parent, child);
	return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
}

function assertSafeStageDirectory(directory) {
	if (directory === parse(directory).root || directory === homedir()) {
		throw new Error(`Refusing to use broad staging directory: ${directory}`);
	}

	if (isWithin(root, directory) || isWithin(directory, root)) {
		throw new Error(`The Zed staging directory must be outside the repository: ${directory}`);
	}
}

const requestedStageDirectory = resolve(process.env.TSRX_ZED_DEV_DIR ?? defaultStageDirectory());
assertSafeStageDirectory(requestedStageDirectory);

if (existsSync(requestedStageDirectory) && lstatSync(requestedStageDirectory).isSymbolicLink()) {
	throw new Error(
		`Refusing to use a symbolic link as the staging directory: ${requestedStageDirectory}`,
	);
}

mkdirSync(requestedStageDirectory, { recursive: true });
const stageDirectory = realpathSync(requestedStageDirectory);
assertSafeStageDirectory(stageDirectory);

const markerPath = join(stageDirectory, stageMarkerName);
const existingEntries = readdirSync(stageDirectory);

if (existingEntries.length > 0 && !existsSync(markerPath)) {
	throw new Error(
		`Refusing to overwrite non-empty directory without a TSRX staging marker: ${stageDirectory}`,
	);
}

if (existsSync(markerPath)) {
	const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
	if (marker.kind !== stageMarkerKind) {
		throw new Error(`Invalid TSRX staging marker in ${stageDirectory}`);
	}
}

writeFileSync(
	markerPath,
	JSON.stringify({ kind: stageMarkerKind, source, version: 1 }, null, 2) + '\n',
);

for (const entry of readdirSync(stageDirectory, { withFileTypes: true })) {
	if (entry.name === stageMarkerName || generatedEntries.has(entry.name)) {
		continue;
	}

	rmSync(join(stageDirectory, entry.name), { recursive: true, force: true });
}

for (const entry of readdirSync(source, { withFileTypes: true })) {
	if (generatedEntries.has(entry.name)) {
		continue;
	}

	cpSync(join(source, entry.name), join(stageDirectory, entry.name), {
		recursive: entry.isDirectory(),
		force: true,
	});
}

console.log('Staged the TSRX Zed extension outside the repository:');
console.log(stageDirectory);
console.log('');
console.log('In Zed, run "zed: install dev extension" and select that directory.');
console.log('After later source changes, rerun this command and use "zed: rebuild dev extension".');
