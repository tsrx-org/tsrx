#!/usr/bin/env node

import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.join(path.dirname(__filename), '..');
const sourceDir = path.join(rootDir, 'grammars', 'tree-sitter', 'queries');

/** @typedef {'zed'|'nvim'} TreeSittableCodeEditor */
/** @typedef {`indents.{VariableEditor}.scm`} IndentVariant */
/**
 * @typedef {Object} Target
 * @property {string} name
 * @property {string} dir
 * @property {IndentVariant} indentVariant
 */
/**
 * @param {TreeSittableCodeEditor} name
 * @param {string} subdir
 * @param {string} lang
 * @return {Target}
 */
function createTarget(name, subdir, lang) {
	return {
		name,
		dir: path.join(rootDir, 'packages', `${name}-plugin`, subdir, lang),
		indentVariant: `indents.${name}.scm`,
	};
}

/** @type {Target[]} */
const allTargets = [
	createTarget('zed', 'languages', 'tsrx'),
	createTarget('nvim', 'queries', 'tsrx'),
];

const extraIndentFiles = allTargets.map((v) => v.indentVariant);

// Zed builds the grammar at the commit pinned in packages/zed-plugin/extension.toml,
// and a query that names a node or token that grammar lacks fails to load, which
// turns off highlighting. So Zed's copy changes only with `--zed`, which
// `sync-zed-grammar-rev.js` passes when it moves the pin. Neovim builds the
// grammar from the repository's default branch and always takes these queries.
const includeZed = process.argv.includes('--zed');
const targets = allTargets.filter((target) => includeZed || target.name !== 'zed');

/**
 * @param {string[]} files
 * @param {string} destinationDir
 * @returns {Promise<void>}
 */
async function copyAll(files, destinationDir) {
	await Promise.all(
		files.map((fileName) =>
			copyFile(path.join(sourceDir, fileName), path.join(destinationDir, fileName)),
		),
	);
}

try {
	const queryFiles = (await readdir(sourceDir)).filter((fileName) => fileName.endsWith('.scm'));

	for (const target of targets) {
		await mkdir(target.dir, { recursive: true });
		await copyAll(queryFiles, target.dir);

		await copyFile(
			path.join(sourceDir, target.indentVariant),
			path.join(target.dir, 'indents.scm'),
		);

		await Promise.all(
			extraIndentFiles.map((fileName) => rm(path.join(target.dir, fileName), { force: true })),
		);

		console.log(`[copy-tree-sitter-queries] Updated ${target.name} queries`);
	}

	if (!includeZed) {
		console.log(
			'[copy-tree-sitter-queries] Left zed queries as they are: they follow the grammar rev in packages/zed-plugin/extension.toml, and pnpm sync-zed-grammar-rev copies them when it moves the rev',
		);
	}
} catch (error) {
	console.error(`[copy-tree-sitter-queries] ${/** @type {Error} */ (error).message}`);
	process.exitCode = 1;
}
