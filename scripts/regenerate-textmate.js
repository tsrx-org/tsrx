#!/usr/bin/env node
import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPlist, withoutCapturePatterns } from './textmate-plist.js';

/**
 * @param {string[]} targets
 * @param {string} sourcePath
 * @returns {Promise<void[]>}
 */
function writeTargets(targets, sourcePath) {
	return Promise.all(
		targets.map(async (targetPath) => {
			console.log(`[write] ${targetPath}`);
			targetPath = path.join(rootDir, targetPath);
			await cp(sourcePath, targetPath, { recursive: true });
		}),
	);
}

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.join(path.dirname(__filename), '..');

const sourceJson = path.join(rootDir, 'grammars/textmate/tsrx.tmLanguage.json');
const assetBundleGrammar = path.join(rootDir, 'assets/TSRX.tmbundle/Syntaxes/tsrx.tmLanguage');

const jsonTargetFiles = ['packages/vscode-plugin/syntaxes/tsrx.tmLanguage.json'];

const main = async () => {
	console.log('Copying TextMate grammar files...\n');

	await writeTargets(jsonTargetFiles, sourceJson);
	await writeAssetBundleGrammar(sourceJson, assetBundleGrammar);

	console.log('\nTextMate grammar regeneration complete.');
};

/**
 * Write the `.tmLanguage` plist, which TextMate and Sublime Text read (VS Code and
 * JetBrains IDEs read the JSON grammar). Sublime Text rejects the whole file when
 * a capture has `patterns`, so the plist leaves them out (`withoutCapturePatterns`).
 * @param {string} sourcePath
 * @param {string} targetPath
 * @returns {Promise<void>}
 */
async function writeAssetBundleGrammar(sourcePath, targetPath) {
	const grammar = JSON.parse(await readFile(sourcePath, 'utf8'));
	console.log(`[write] ${path.relative(rootDir, targetPath)}`);
	await writeFile(targetPath, toPlist(withoutCapturePatterns(grammar)), 'utf8');
}

main().catch((error) => {
	console.error('TextMate grammar regeneration failed.');
	console.error(error);
	process.exitCode = 1;
});
