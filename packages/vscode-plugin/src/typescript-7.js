import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vscode from 'vscode';
import { is_native_typescript_package } from '@tsrx/typescript-plugin/src/typescript-version.js';

/**
 * The TypeScript 7 extensions that run a server: the marketplace one, and builds from source.
 * VS Code's own TypeScript stands down for TypeScript 7 only when one of these is installed.
 */
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
 * `typescript.experimental.useTsgo`) is on and a TypeScript 7 extension with a server is
 * installed. The TypeScript 7 Nightly extension alone does not count, so VS Code's own
 * TypeScript goes on serving.
 * @returns {boolean}
 */
export function typescript_7_on() {
	const unified = vscode.workspace.getConfiguration('js/ts');
	const use_tsgo = is_set(unified, USE_TSGO)
		? unified.get(USE_TSGO)
		: vscode.workspace.getConfiguration('typescript').get(USE_TSGO);
	return !!use_tsgo && !!typescript_7_server_extension();
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
 * The compiler package in a directory, by its manifest: `typescript` with a `tsc` bin or
 * another package, such as `@typescript/native-preview`, with a `tsgo` bin.
 * @param {string} directory
 * @returns {{ version: string, manifest: string, base_name: string, bin: string } | undefined}
 */
function compiler_package(directory) {
	const manifest_path = path.join(directory, 'package.json');
	try {
		const manifest = JSON.parse(fs.readFileSync(manifest_path, 'utf8'));
		const base_name =
			typeof manifest.name === 'string' ? manifest.name.split('/').pop() : undefined;
		const bin = base_name === 'typescript' ? 'tsc' : 'tsgo';
		if (base_name && manifest.bin && typeof manifest.bin === 'object' && bin in manifest.bin) {
			const version = typeof manifest.version === 'string' ? manifest.version : 'unknown';
			return { version, manifest: manifest_path, base_name, bin };
		}
	} catch {}
	return undefined;
}

/** @param {string} bin */
function executable_name(bin) {
	return process.platform === 'win32' ? `${bin}.exe` : bin;
}

/**
 * Whether a compiler package's executable is there, as the TypeScript 7 extension checks
 * before it runs one: `@typescript/<name>-<os>-<arch>` holds it, resolved from the
 * package, and an install can leave that optional dependency out.
 * @param {{ manifest: string, base_name: string, bin: string }} compiler
 * @returns {boolean}
 */
function has_platform_binary({ manifest, base_name, bin }) {
	try {
		const platform_package = `@typescript/${base_name}-${process.platform}-${process.arch}`;
		const platform_manifest = createRequire(manifest).resolve(`${platform_package}/package.json`);
		return fs.existsSync(path.join(path.dirname(platform_manifest), 'lib', executable_name(bin)));
	} catch {
		return false;
	}
}

/**
 * The compiler a `tsdk` setting names, as the TypeScript 7 extension finds it: a package
 * with its platform binary at that path or its parent (the path may name its `lib`
 * directory), or else a local build, a directory with a bare `tsc` or `tsgo`, which has
 * no manifest and the version `local`.
 * @param {string} tsdk
 * @returns {{ version: string, manifest?: string } | undefined}
 */
function tsdk_compiler(tsdk) {
	const base = workspace_config_base();
	let resolved = path.isAbsolute(tsdk) || !base ? tsdk : path.join(base, tsdk);
	try {
		resolved = fs.realpathSync(resolved);
	} catch {
		return undefined;
	}
	for (const directory of [resolved, path.dirname(resolved)]) {
		const compiler = compiler_package(directory);
		if (compiler && has_platform_binary(compiler)) {
			return { version: compiler.version, manifest: compiler.manifest };
		}
	}
	const is_local_build = ['tsc', 'tsgo'].some((bin) =>
		fs.existsSync(path.join(resolved, executable_name(bin))),
	);
	return is_local_build ? { version: 'local' } : undefined;
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
 * `scope`, `tsdk` and `manifest` say where a compiler from a setting comes from.
 * @typedef {{
 * 	version: string,
 * 	from: 'setting' | 'nightly-extension' | 'bundled',
 * 	scope?: 'user' | 'workspace',
 * 	tsdk?: string,
 * 	manifest?: string,
 * }} TypeScript7Compiler
 */

/**
 * The compiler the settings tell the TypeScript 7 extension to run, chosen the way it
 * chooses: the first `tsdk` setting that names a TypeScript 7 package, then the
 * TypeScript 7 Nightly extension's compiler, then its own bundled one. This is a
 * prediction: a setting in the workspace counts as chosen although the TypeScript 7
 * extension runs it only once the user allows it, which it remembers where other
 * extensions cannot read it. `running_compiler_version` says what actually runs.
 *
 * A package in `node_modules` does not count. The TypeScript 7 extension only offers
 * one, and runs it once the user accepts, which writes it to `js/ts.tsdk.path` in the
 * workspace settings.
 * @returns {TypeScript7Compiler | undefined} `undefined` when no TypeScript 7 server
 *   extension is installed.
 */
export function typescript_7_compiler() {
	const server = typescript_7_server_extension();
	if (!server) return undefined;
	for (const candidate of tsdk_candidates()) {
		const compiler = tsdk_compiler(candidate.value);
		if (compiler) {
			return {
				...compiler,
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
 * What the TypeScript 7 server last reported about itself. A local build has no
 * `packageJsonPath`. `superseded` says a change of setting has asked for a restart.
 * @typedef {{
 * 	version: string,
 * 	packageJsonPath?: string,
 * 	isCurrent?: () => boolean,
 * 	superseded?: boolean,
 * }} ReportedCompiler
 */

/** @type {ReportedCompiler | undefined} */
let reported_compiler;

/** @type {Set<() => void>} */
const compiler_report_listeners = new Set();

function notify_compiler_report() {
	for (const listener of compiler_report_listeners) listener();
}

/**
 * Follow the compiler the TypeScript 7 server runs, through the TypeScript 7 extension's
 * API. `onLanguageServerInitialized` passes the running compiler on every start, and at
 * once if the server already runs. Extension 1.0.1 has the event but passes nothing, so
 * there `running_compiler` stays undefined.
 *
 * Subscribing has a cost: the extension then remembers the version in the compiler's
 * `package.json`, and when that changes on disk its restart command asks to restart the
 * extension host instead of restarting the server.
 * @param {unknown} api
 * @returns {import('vscode').Disposable | undefined}
 */
export function follow_running_compiler(api) {
	const { onLanguageServerInitialized: on_initialized } = /** @type {{
		onLanguageServerInitialized?: (
			listener: (compiler?: Omit<ReportedCompiler, 'version'> & { version?: unknown }) => void,
		) => import('vscode').Disposable,
	}} */ (api ?? {});
	if (typeof on_initialized !== 'function') return undefined;
	const subscription = on_initialized((compiler) => {
		if (typeof compiler?.version !== 'string') return;
		const { version, packageJsonPath, isCurrent } = compiler;
		reported_compiler = { version, packageJsonPath, isCurrent };
		notify_compiler_report();
	});
	return {
		dispose() {
			subscription.dispose();
			if (!reported_compiler) return;
			reported_compiler = undefined;
			notify_compiler_report();
		},
	};
}

/**
 * The compiler the TypeScript 7 server runs, if it has said so and has not started to
 * restart since.
 * @returns {ReportedCompiler | undefined}
 */
export function running_compiler() {
	return reported_compiler?.isCurrent?.() === false ? undefined : reported_compiler;
}

/**
 * Note that a changed setting has asked for a restart. The report stays, because that
 * server runs until the restart starts, and goes on running if it fails or the user
 * declines it.
 */
export function supersede_running_compiler() {
	if (reported_compiler) reported_compiler.superseded = true;
}

/**
 * Whether the server runs the compiler a setting names. Two packages can share a version,
 * so a report is matched by its `package.json`. Only a local build goes by its version.
 * @param {ReportedCompiler} running
 * @param {TypeScript7Compiler} compiler
 * @returns {boolean}
 */
export function runs_compiler(running, compiler) {
	if (!running.packageJsonPath || !compiler.manifest) return running.version === compiler.version;
	try {
		return (
			fs.realpathSync.native(running.packageJsonPath) === fs.realpathSync.native(compiler.manifest)
		);
	} catch {
		return false;
	}
}

/**
 * Call `listener` whenever the TypeScript 7 server reports its compiler.
 * @param {() => void} listener
 * @returns {import('vscode').Disposable}
 */
export function on_running_compiler_reported(listener) {
	compiler_report_listeners.add(listener);
	return { dispose: () => compiler_report_listeners.delete(listener) };
}

/**
 * The package a directory's `node_modules` offers the TypeScript 7 extension: the first
 * TypeScript 7 one in `WORKSPACE_PACKAGES` with its platform binary, or else the
 * TypeScript 5 or 6 it has, which has no platform binary to find.
 * @param {string} directory
 * @returns {{ name: string, version: string, directory: string } | undefined}
 */
function installed_typescript(directory) {
	const installed = [];
	for (const name of WORKSPACE_PACKAGES) {
		const package_directory = path.join(directory, 'node_modules', name);
		let real_directory;
		try {
			real_directory = fs.realpathSync(package_directory);
		} catch {
			continue;
		}
		const compiler = compiler_package(real_directory);
		if (!compiler) continue;
		if (is_native_typescript_package(compiler.version) && !has_platform_binary(compiler)) continue;
		installed.push({ name, version: compiler.version, directory: package_directory });
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
 * The TypeScript package installed at `workspace_config_base`: what a relative
 * `"js/ts.tsdk.path": "node_modules/typescript"` names. That is one directory, while the
 * TypeScript 7 extension's own prompt looks at the root of every workspace folder.
 * @returns {{ name: string, version: string, directory: string } | undefined}
 */
export function workspace_typescript() {
	const base = workspace_config_base();
	return base ? installed_typescript(base) : undefined;
}
