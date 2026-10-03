/**
 * Finding the `typescript` package the classic backend runs, in this order:
 *
 * 1. the `typescript.tsdk` initialization option: an editor's choice, the `lib`
 *    directory of a TypeScript installation or the `typescript` package directory
 *    itself (a folder with neither is skipped, and the server warns with
 *    `tsdk_notice`);
 * 2. the project's own `typescript`: `node_modules/typescript` in each open
 *    workspace folder (or, when the client names none, the server's working
 *    directory) and its parent folders, as Node resolves a package, the first
 *    folder that has one wins;
 * 3. the `typescript` next to the server: `node_modules/typescript` from the
 *    server's own folder up. `typescript` is an optional peer dependency, so npm
 *    and pnpm do not install one by themselves.
 *
 * Any version below 7 is used. TypeScript 7's npm package is the native compiler
 * with no JavaScript API, so the server cannot run it.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{ dir: string, lib: string, version: string, source: 'tsdk' | 'workspace' | 'server' }} FoundTypeScript
 *   `dir`: the package's real path. `lib`: its `lib` directory, with `typescript.js`.
 */

/**
 * The version of the `typescript` package in `dir`, or undefined when there is no
 * readable package there.
 * @param {string} dir
 * @returns {string | undefined}
 */
function package_version(dir) {
	try {
		const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
		return manifest.name === 'typescript' && typeof manifest.version === 'string'
			? manifest.version
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * `node_modules/typescript` in `from_dir` or the nearest parent folder that has one.
 * @param {string} from_dir
 * @returns {{ dir: string, lib: string, version: string } | undefined}
 */
export function find_typescript_package(from_dir) {
	for (let dir = path.resolve(from_dir); ; dir = path.dirname(dir)) {
		if (path.basename(dir) !== 'node_modules') {
			const candidate = path.join(dir, 'node_modules', 'typescript');
			const version = package_version(candidate);
			if (version !== undefined) {
				const real = fs.realpathSync(candidate);
				return { dir: real, lib: path.join(real, 'lib'), version };
			}
		}
		if (path.dirname(dir) === dir) {
			return undefined;
		}
	}
}

/**
 * @param {{ tsdk?: string, workspace_dirs: readonly string[], server_dir: string }} options
 *   `tsdk`: the `typescript.tsdk` initialization option. `workspace_dirs`: the open
 *   workspace folders. `server_dir`: the server's own folder.
 * @returns {FoundTypeScript | undefined}
 */
export function find_typescript({ tsdk, workspace_dirs, server_dir }) {
	if (tsdk !== undefined) {
		// The `lib` folder the option asks for, or the package folder above it.
		const folder = path.resolve(tsdk);
		for (const [dir, lib] of [
			[path.dirname(folder), folder],
			[folder, path.join(folder, 'lib')],
		]) {
			const version = package_version(dir);
			if (version !== undefined) {
				return { dir: fs.realpathSync(dir), lib, version, source: 'tsdk' };
			}
		}
	}
	for (const workspace_dir of workspace_dirs) {
		const found = find_typescript_package(workspace_dir);
		if (found) {
			return { ...found, source: 'workspace' };
		}
	}
	const found = find_typescript_package(server_dir);
	return found ? { ...found, source: 'server' } : undefined;
}

/**
 * Whether the server can run the `typescript` package of this version: below 7.
 * @param {string} version
 */
export function is_usable_typescript(version) {
	return Number.parseInt(version, 10) < 7;
}

/** What the server does not give without TypeScript, for the notices. */
const NO_FEATURES =
	'The TSRX language server gives no type checking, hover or completions in .tsrx files.';

/** What still works without TypeScript, for the notices. */
const STILL_WORKS =
	'These features still work: TSRX compile errors, CSS in <style>, the outline, formatting and closing tags.';

/**
 * The notice the server shows when the `typescript.tsdk` option is set but
 * `find_typescript` skipped it: the folder has no `typescript` package.
 * @param {string} tsdk the option's value
 * @param {FoundTypeScript | undefined} found the `typescript` found instead
 * @returns {string}
 */
export function tsdk_notice(tsdk, found) {
	const sentences = [
		'The TSRX language server does not use the typescript.tsdk startup option.',
		`The folder in this option contains no TypeScript: ${path.resolve(tsdk)}.`,
	];
	if (found && is_usable_typescript(found.version)) {
		const from = found.source === 'server' ? 'the server installation' : 'the project';
		sentences.push(
			`The server uses TypeScript ${found.version} from ${from} instead: ${found.dir}.`,
		);
	}
	sentences.push(
		'Set this option to the lib folder of a TypeScript installation, for example /path/to/node_modules/typescript/lib.',
	);
	return sentences.join(' ');
}

/**
 * The notice the server shows when it found no `typescript` it can run.
 * @param {FoundTypeScript | undefined} found
 * @param {readonly string[]} workspace_dirs
 * @returns {string}
 */
export function typescript_notice(found, workspace_dirs) {
	if (found) {
		return [
			NO_FEATURES,
			`The server found TypeScript ${found.version} in ${found.dir}.`,
			'The server cannot run TypeScript 7 or newer.',
			STILL_WORKS,
			'To use TypeScript 7, run the TypeScript 7 language server (tsc --lsp) with @tsrx/content-mapper.',
			'To use a different TypeScript, set the typescript.tsdk startup option to the lib folder of that TypeScript.',
			'For more information, see https://github.com/tsrx-org/tsrx/tree/main/packages/language-server#which-typescript-it-uses',
		].join(' ');
	}
	const where = workspace_dirs.join(', ');
	return [
		NO_FEATURES,
		'The server found no TypeScript.',
		`The server looked in ${where}, in the server installation, and in their parent folders.`,
		STILL_WORKS,
		'Install TypeScript in the project: npm install -D typescript, or pnpm add -D typescript.',
		'Then restart the TSRX language server.',
	].join(' ');
}
