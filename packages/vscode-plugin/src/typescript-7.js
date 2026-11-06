import fs from 'node:fs';
import path from 'node:path';
import vscode from 'vscode';
import { is_native_typescript_package } from '@tsrx/typescript-plugin/src/typescript-version.js';

/** The extensions whose presence makes VS Code's own TypeScript stand down for TypeScript 7. */
const TYPESCRIPT_7_EXTENSIONS = [
	'TypeScriptTeam.vscode-typescript',
	'TypeScriptTeam.vscode-typescript-nightly',
	'TypeScriptTeam.native-preview',
];

/** The TypeScript 7 extensions that run a server: the marketplace one, and builds from source. */
export const TYPESCRIPT_7_SERVER_EXTENSIONS = [
	'TypeScriptTeam.native-preview',
	'TypeScriptTeam.vscode-typescript',
];

/** Ships a TypeScript 7 nightly compiler for the TypeScript 7 extension, and nothing else. */
export const TYPESCRIPT_7_NIGHTLY_EXTENSION = 'TypeScriptTeam.vscode-typescript-nightly';

const USE_TSGO = 'experimental.useTsgo';

/** The settings that turn TypeScript 7 on, for `affectsConfiguration`. */
export const USE_TSGO_SETTINGS = [`js/ts.${USE_TSGO}`, `typescript.${USE_TSGO}`];

/**
 * The settings the TypeScript 7 extension reads a compiler location from, in its order.
 * A `nativeOnly` one is skipped when it points at a TypeScript 5 or 6 package.
 */
const TSDK_SETTINGS = [
	{ section: 'js/ts', key: 'tsdk.path', native_only: true },
	{ section: 'typescript', key: 'tsdk', native_only: true },
	{ section: 'typescript.native-preview', key: 'tsdk', native_only: false },
];

/**
 * The packages the TypeScript 7 extension (1.0.2 and newer) looks for in a workspace
 * folder's `node_modules`, in its order. It skips TypeScript 5 and 6.
 */
const WORKSPACE_PACKAGES = ['typescript', '@typescript/native', '@typescript/native-preview'];

/** For `affectsConfiguration`. */
export const TSDK_SETTING_NAMES = TSDK_SETTINGS.map(({ section, key }) => `${section}.${key}`);

/**
 * @param {import('vscode').WorkspaceConfiguration} configuration
 * @param {string} key
 * @returns {boolean}
 */
function is_set(configuration, key) {
	const inspected = configuration.inspect(key);
	return (
		!!inspected &&
		[
			inspected.globalValue,
			inspected.workspaceValue,
			inspected.workspaceFolderValue,
			inspected.globalLanguageValue,
			inspected.workspaceLanguageValue,
			inspected.workspaceFolderLanguageValue,
		].some((value) => value !== undefined)
	);
}

/**
 * Whether TypeScript 7 serves TypeScript files, by the check VS Code's own TypeScript
 * makes to stand down: `js/ts.experimental.useTsgo` (or, when that is not set,
 * `typescript.experimental.useTsgo`) is on and a TypeScript 7 extension is installed.
 * @returns {boolean}
 */
export function typescript_7_on() {
	const unified = vscode.workspace.getConfiguration('js/ts');
	const use_tsgo = is_set(unified, USE_TSGO)
		? unified.get(USE_TSGO)
		: vscode.workspace.getConfiguration('typescript').get(USE_TSGO);
	return !!use_tsgo && TYPESCRIPT_7_EXTENSIONS.some((id) => vscode.extensions.getExtension(id));
}

/** @returns {import('vscode').Extension<unknown> | undefined} */
export function typescript_7_server_extension() {
	for (const id of TYPESCRIPT_7_SERVER_EXTENSIONS) {
		const extension = vscode.extensions.getExtension(id);
		if (extension) return extension;
	}
	return undefined;
}

/**
 * The directory the TypeScript 7 extension resolves a relative `tsdk` setting against:
 * the `.code-workspace` file's directory, or the first workspace folder.
 * @returns {string | undefined}
 */
export function workspace_config_base() {
	const file = vscode.workspace.workspaceFile;
	if (file?.scheme === 'file') return path.dirname(file.fsPath);
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * The version of the TypeScript 7 package a `tsdk` setting names, as the TypeScript 7
 * extension finds it: the package at that path or its parent (the path may name its
 * `lib` directory), which must be `typescript` with a `tsc` bin or another package, such
 * as `@typescript/native-preview`, with a `tsgo` bin.
 * @param {string} tsdk
 * @returns {string | undefined}
 */
function tsdk_version(tsdk) {
	const base = workspace_config_base();
	let resolved = path.isAbsolute(tsdk) || !base ? tsdk : path.join(base, tsdk);
	try {
		resolved = fs.realpathSync(resolved);
	} catch {
		return undefined;
	}
	for (const directory of [resolved, path.dirname(resolved)]) {
		try {
			const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
			const base_name =
				typeof manifest.name === 'string' ? manifest.name.split('/').pop() : undefined;
			const bin = base_name === 'typescript' ? 'tsc' : 'tsgo';
			if (base_name && manifest.bin && typeof manifest.bin === 'object' && bin in manifest.bin) {
				return typeof manifest.version === 'string' ? manifest.version : 'unknown';
			}
		} catch {}
	}
	return undefined;
}

/** @param {string} tsdk */
function has_tsserver(tsdk) {
	const base = workspace_config_base();
	const resolved = path.isAbsolute(tsdk) || !base ? tsdk : path.join(base, tsdk);
	return [path.join(resolved, 'tsserver.js'), path.join(resolved, 'lib', 'tsserver.js')].some(
		(file) => fs.existsSync(file),
	);
}

/**
 * The explicit values of the `tsdk` settings in the TypeScript 7 extension's order: the
 * most specific scope first, language-specific values before plain ones, then the
 * settings' own order. Scope 1 is the user settings, 2 and 3 the workspace's.
 * @returns {Array<{ value: string, scope: number }>}
 */
function tsdk_candidates() {
	/** @type {Array<{ value: string, scope: number, order: number }>} */
	const candidates = [];
	TSDK_SETTINGS.forEach(({ section, key, native_only }, setting_index) => {
		const inspected = vscode.workspace.getConfiguration(section).inspect(key);
		if (!inspected) return;
		/** @type {Array<[unknown, number]>} */
		const values = [
			[inspected.workspaceFolderLanguageValue, 3],
			[inspected.workspaceFolderValue, 3],
			[inspected.workspaceLanguageValue, 2],
			[inspected.workspaceValue, 2],
			[inspected.globalLanguageValue, 1],
			[inspected.globalValue, 1],
		];
		values.forEach(([value, scope], order) => {
			if (typeof value !== 'string' || !value) return;
			if (native_only && has_tsserver(value)) return;
			candidates.push({ value, scope, order: order + setting_index * 10 });
		});
	});
	return candidates.sort((a, b) => b.scope - a.scope || a.order - b.order);
}

/**
 * Whether a `tsdk` setting is set in the workspace's settings, where it outranks the
 * user settings.
 * @returns {boolean}
 */
export function workspace_tsdk_set() {
	return tsdk_candidates().some((candidate) => candidate.scope > 1);
}

/** @param {import('vscode').Extension<unknown> | undefined} extension */
function bundled_version(extension) {
	const version = /** @type {{ bundledTypeScriptVersion?: unknown }} */ (extension?.packageJSON)
		?.bundledTypeScriptVersion;
	return typeof version === 'string' ? version : 'unknown';
}

/**
 * `scope` and `tsdk` say where a compiler from a setting comes from.
 * @typedef {{
 * 	version: string,
 * 	from: 'setting' | 'nightly-extension' | 'bundled',
 * 	scope?: 'user' | 'workspace',
 * 	tsdk?: string,
 * }} TypeScript7Compiler
 */

/**
 * The compiler the TypeScript 7 extension runs, chosen the way it chooses: the first
 * `tsdk` setting that names a TypeScript 7 package, then the TypeScript 7 Nightly
 * extension's compiler, then its own bundled one. A setting in the workspace counts
 * as chosen although the TypeScript 7 extension first asks the user to allow it (it
 * remembers the answer where other extensions cannot read it).
 *
 * A package in `node_modules` does not count. The TypeScript 7 extension only offers
 * one, and runs it once the user accepts, which writes it to `js/ts.tsdk.path` in the
 * workspace settings. Counting it here would name a compiler that is not running.
 * @returns {TypeScript7Compiler | undefined} `undefined` when no TypeScript 7 server
 *   extension is installed.
 */
export function typescript_7_compiler() {
	const server = typescript_7_server_extension();
	if (!server) return undefined;
	for (const candidate of tsdk_candidates()) {
		const version = tsdk_version(candidate.value);
		if (version) {
			return {
				version,
				from: 'setting',
				scope: candidate.scope > 1 ? 'workspace' : 'user',
				tsdk: candidate.value,
			};
		}
	}
	const nightly = vscode.extensions.getExtension(TYPESCRIPT_7_NIGHTLY_EXTENSION);
	if (nightly) return { version: bundled_version(nightly), from: 'nightly-extension' };
	return { version: bundled_version(server), from: 'bundled' };
}

/**
 * The package a directory's `node_modules` offers the TypeScript 7 extension: the first
 * TypeScript 7 one in `WORKSPACE_PACKAGES`, or else the TypeScript 5 or 6 it has.
 * @param {string} directory
 * @returns {{ name: string, version: string, directory: string } | undefined}
 */
function installed_typescript(directory) {
	const installed = [];
	for (const name of WORKSPACE_PACKAGES) {
		const package_directory = path.join(directory, 'node_modules', name);
		const version = tsdk_version(package_directory);
		if (version) installed.push({ name, version, directory: package_directory });
	}
	return installed.find(({ version }) => is_native_typescript_package(version)) ?? installed[0];
}

/**
 * The TypeScript package a file's project installs: the nearest one from the file's
 * directory up to its workspace folder.
 * @param {import('vscode').Uri} uri
 * @returns {{ name: string, version: string, directory: string } | undefined}
 */
export function project_typescript(uri) {
	if (uri.scheme !== 'file') return undefined;
	const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
	let directory = path.dirname(uri.fsPath);
	for (;;) {
		const installed = installed_typescript(directory);
		if (installed) return installed;
		const parent = path.dirname(directory);
		if (directory === folder || parent === directory) return undefined;
		directory = parent;
	}
}

/**
 * The TypeScript package the open folder installs at its root: what a relative
 * `"js/ts.tsdk.path": "node_modules/typescript"` names.
 * @returns {{ name: string, version: string, directory: string } | undefined}
 */
export function workspace_typescript() {
	const base = workspace_config_base();
	return base ? installed_typescript(base) : undefined;
}
