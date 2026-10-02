/**
 * Finding the `typescript` package the classic backend runs, in this order:
 *
 * 1. the `typescript.tsdk` initialization option: an editor's choice, the `lib`
 *    directory of a TypeScript installation;
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
		const lib = path.resolve(tsdk);
		const dir = path.dirname(lib);
		const version = package_version(dir);
		if (version !== undefined) {
			return { dir: fs.realpathSync(dir), lib, version, source: 'tsdk' };
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

/** What still works without TypeScript, for the notices. */
const STILL_WORKS =
	'TSRX compile errors, CSS in <style>, the outline, formatting and closing tags still work.';

/**
 * The notice the server shows when it found no `typescript` it can run.
 * @param {FoundTypeScript | undefined} found
 * @param {readonly string[]} workspace_dirs
 * @returns {string}
 */
export function typescript_notice(found, workspace_dirs) {
	if (found) {
		return [
			`The TSRX language server found typescript ${found.version} at ${found.dir}.`,
			'It cannot run TypeScript 7 or newer, so type checking, hover and completions in .tsrx files are off.',
			STILL_WORKS,
			'For TypeScript 7, run its own language server (tsc --lsp) with @tsrx/content-mapper. To use another TypeScript, set the typescript.tsdk startup option to its lib folder.',
			'See https://github.com/tsrx-org/tsrx/tree/main/packages/language-server#which-typescript-it-uses',
		].join(' ');
	}
	const where = workspace_dirs.join(', ');
	return [
		`The TSRX language server found no typescript package in ${where}, its parent folders, or next to the server,`,
		'so type checking, hover and completions in .tsrx files are off.',
		STILL_WORKS,
		'Install typescript in the project (npm install -D typescript, or pnpm add -D typescript), then restart the language server.',
	].join(' ');
}
