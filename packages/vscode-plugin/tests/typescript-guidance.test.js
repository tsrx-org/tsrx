import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	activate_typescript_guidance,
	notice_for,
	typescript_status,
} from '../src/typescript-guidance.js';
import { follow_running_compiler } from '../src/typescript-7.js';

const host = vi.hoisted(() => ({
	/** @type {Map<string, Record<string, unknown>>} `section.key` → scope values */
	settings: new Map(),
	/** @type {Map<string, Record<string, unknown>>} lower-case id → packageJSON */
	extensions: new Map(),
	/** @type {string[]} */
	folders: [],
	/** @type {{ document: { uri: { scheme: string, fsPath: string }, languageId: string } } | undefined} */
	active_editor: undefined,
	/** @type {string[]} */
	commands: [],
	executeCommand: vi.fn(),
	/** @type {Array<(event: { affectsConfiguration: (name: string) => boolean }) => void>} */
	configuration_listeners: [],
	/** @type {Array<{ name: string, value: unknown, target: number }>} */
	updates: [],
	showWarningMessage: vi.fn(),
	showInformationMessage: vi.fn(),
	showQuickPick: vi.fn(),
	/** @type {Map<string, () => Promise<unknown>>} */
	registered_commands: new Map(),
	/** @type {Record<string, any>} */
	status_item: {},
}));

vi.mock('vscode', () => {
	/** @param {string} fsPath */
	const file = (fsPath) => ({ scheme: 'file', fsPath, path: fsPath });
	const listener = () => ({ dispose() {} });
	return {
		default: {
			workspace: {
				getConfiguration: (/** @type {string} */ section) => ({
					inspect: (/** @type {string} */ key) => ({
						key,
						...host.settings.get(`${section}.${key}`),
					}),
					get: (/** @type {string} */ key) => {
						const scopes = host.settings.get(`${section}.${key}`) ?? {};
						return scopes.workspaceValue ?? scopes.globalValue;
					},
					// As VS Code does: store the value in its scope, then tell the listeners.
					update: async (
						/** @type {string} */ key,
						/** @type {unknown} */ value,
						/** @type {number} */ target,
					) => {
						const name = `${section}.${key}`;
						host.updates.push({ name, value, target });
						host.settings.set(name, {
							...host.settings.get(name),
							[target === 1 ? 'globalValue' : 'workspaceValue']: value,
						});
						for (const listener of host.configuration_listeners) {
							listener({ affectsConfiguration: (setting) => setting === name });
						}
					},
				}),
				get workspaceFile() {
					return undefined;
				},
				get workspaceFolders() {
					return host.folders.map((folder) => ({ uri: file(folder) }));
				},
				getWorkspaceFolder: (/** @type {{ fsPath: string }} */ uri) => {
					const folder = host.folders.find((candidate) =>
						uri.fsPath.startsWith(candidate + path.sep),
					);
					return folder ? { uri: file(folder) } : undefined;
				},
				onDidChangeConfiguration: (/** @type {any} */ callback) => {
					host.configuration_listeners.push(callback);
					return { dispose() {} };
				},
			},
			extensions: {
				getExtension: (/** @type {string} */ id) => {
					const packageJSON = host.extensions.get(id.toLowerCase());
					return packageJSON ? { id, packageJSON } : undefined;
				},
				onDidChange: listener,
			},
			window: {
				get activeTextEditor() {
					return host.active_editor;
				},
				get visibleTextEditors() {
					return host.active_editor ? [host.active_editor] : [];
				},
				onDidChangeActiveTextEditor: listener,
				showWarningMessage: host.showWarningMessage,
				showInformationMessage: host.showInformationMessage,
				showQuickPick: host.showQuickPick,
			},
			languages: {
				createLanguageStatusItem: () => {
					host.status_item = { dispose() {} };
					return host.status_item;
				},
			},
			commands: {
				executeCommand: host.executeCommand,
				getCommands: async () => host.commands,
				registerCommand: (
					/** @type {string} */ command,
					/** @type {() => Promise<unknown>} */ handler,
				) => {
					host.registered_commands.set(command, handler);
					return { dispose() {} };
				},
			},
			env: { openExternal: vi.fn() },
			Uri: { parse: (/** @type {string} */ value) => value },
			LanguageStatusSeverity: { Information: 0, Warning: 1, Error: 2 },
			ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
		},
	};
});

const NATIVE_PREVIEW = { bundledTypeScriptVersion: '7.0.2' };
const NIGHTLY = { bundledTypeScriptVersion: '7.1.0-dev.20260930.4' };

/** @type {string} */
let workspace;

/**
 * The platform package npm installs beside a TypeScript 7 package, which holds the
 * executable the TypeScript 7 extension runs.
 * @param {string} directory The compiler package.
 * @param {string} base_name
 * @param {string} bin
 */
function write_platform_binary(directory, base_name, bin) {
	const platform_package = path.join(
		directory,
		'node_modules',
		'@typescript',
		`${base_name}-${process.platform}-${process.arch}`,
	);
	fs.mkdirSync(path.join(platform_package, 'lib'), { recursive: true });
	fs.writeFileSync(path.join(platform_package, 'package.json'), '{}');
	const executable = process.platform === 'win32' ? `${bin}.exe` : bin;
	fs.writeFileSync(path.join(platform_package, 'lib', executable), '');
}

/**
 * A `typescript` package as npm installs it.
 * @param {string} directory
 * @param {string} version
 */
function write_typescript(directory, version) {
	fs.mkdirSync(path.join(directory, 'lib'), { recursive: true });
	fs.writeFileSync(
		path.join(directory, 'package.json'),
		JSON.stringify({ name: 'typescript', version, bin: { tsc: './bin/tsc' } }),
	);
	// TypeScript 5 and 6 ship tsserver.js; TypeScript 7 does not.
	if (Number.parseInt(version, 10) < 7) {
		fs.writeFileSync(path.join(directory, 'lib', 'tsserver.js'), '');
	} else {
		write_platform_binary(directory, 'typescript', 'tsc');
	}
}

/**
 * A TypeScript 7 package under another name, which runs `tsgo`.
 * @param {string} directory
 * @param {string} name
 * @param {string} version
 * @param {{ binary?: boolean }} [options] `binary: false` leaves out the platform package.
 */
function write_native_package(directory, name, version, { binary = true } = {}) {
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(
		path.join(directory, 'package.json'),
		JSON.stringify({ name, version, bin: { tsgo: './bin/tsgo' } }),
	);
	if (binary) write_platform_binary(directory, name.split('/').pop() ?? name, 'tsgo');
}

/** @type {Array<import('vscode').Disposable | undefined>} */
const followed = [];

/**
 * The API of a TypeScript 7 extension, as TSRX follows it.
 * @returns {(compiler?: { version: string, packageJsonPath?: string, isCurrent?: () => boolean }) => void}
 *   Fires the extension's `onLanguageServerInitialized`, and throws if nothing subscribed.
 */
function follow_extension_api() {
	/** @type {any} */
	let listener;
	followed.push(
		follow_running_compiler({
			onLanguageServerInitialized: (/** @type {any} */ callback) => {
				listener = callback;
				return { dispose() {} };
			},
		}),
	);
	return (compiler) => listener(compiler);
}

/** @param {() => void} run What to do as if on Windows, which only `process.platform` tells. */
function on_windows(run) {
	const { platform } = process;
	Object.defineProperty(process, 'platform', { value: 'win32' });
	try {
		run();
	} finally {
		Object.defineProperty(process, 'platform', { value: platform });
	}
}

/** @param {string} name A setting that changed, as VS Code tells the listeners. */
function changed(name) {
	for (const listener of host.configuration_listeners) {
		listener({ affectsConfiguration: (setting) => setting === name });
	}
}

/** @param {string} section @param {string} key @param {Record<string, unknown>} scopes */
const set = (section, key, scopes) => host.settings.set(`${section}.${key}`, scopes);
const use_tsgo = () => set('js/ts', 'experimental.useTsgo', { globalValue: true });
/** @param {string} id @param {Record<string, unknown>} [packageJSON] */
const install = (id, packageJSON = {}) => host.extensions.set(id.toLowerCase(), packageJSON);

const app_file = () =>
	/** @type {import('vscode').Uri} */ (
		/** @type {unknown} */ ({ scheme: 'file', fsPath: path.join(workspace, 'src', 'App.tsrx') })
	);

beforeEach(() => {
	workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-guidance-'));
	fs.mkdirSync(path.join(workspace, 'src'));
	host.folders = [workspace];
	host.settings.clear();
	host.extensions.clear();
	host.active_editor = undefined;
	host.commands = [];
	host.configuration_listeners = [];
	host.updates = [];
	vi.clearAllMocks();
});

afterEach(() => {
	for (const disposable of followed.splice(0)) disposable?.dispose();
	fs.rmSync(workspace, { recursive: true, force: true });
});

describe('which TypeScript serves .tsrx files', () => {
	it("is VS Code's own TypeScript while TypeScript 7 is off, and finds the project's TypeScript", () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		expect(typescript_status(app_file())).toEqual({
			kind: 'vscode',
			project: {
				name: 'typescript',
				version: '7.1.0-dev.20260930.4',
				directory: path.join(workspace, 'node_modules', 'typescript'),
			},
		});
	});

	it("finds the project's TypeScript 7 in the TypeScript 7 extension's order", () => {
		const modules = path.join(workspace, 'node_modules');
		write_native_package(
			path.join(modules, '@typescript', 'native-preview'),
			'@typescript/native-preview',
			'7.1.0-dev.20260923.1',
		);
		expect(typescript_status(app_file()).project?.name).toBe('@typescript/native-preview');
		write_native_package(
			path.join(modules, '@typescript', 'native'),
			'@typescript/native',
			'7.1.0-dev.20260924.1',
		);
		expect(typescript_status(app_file()).project?.name).toBe('@typescript/native');
		write_typescript(path.join(modules, 'typescript'), '7.1.0-dev.20260930.4');
		expect(typescript_status(app_file()).project?.name).toBe('typescript');
	});

	it('skips TypeScript 5 or 6 for a TypeScript 7 package beside it, as the TypeScript 7 extension does', () => {
		const modules = path.join(workspace, 'node_modules');
		write_typescript(path.join(modules, 'typescript'), '6.0.3');
		expect(typescript_status(app_file()).project?.version).toBe('6.0.3');
		write_native_package(
			path.join(modules, '@typescript', 'native-preview'),
			'@typescript/native-preview',
			'7.1.0-dev.20260923.1',
		);
		expect(typescript_status(app_file()).project).toMatchObject({
			name: '@typescript/native-preview',
			version: '7.1.0-dev.20260923.1',
		});
	});

	it('skips a package whose platform package an install left out', () => {
		const modules = path.join(workspace, 'node_modules');
		// Not `typescript`: the NODE_PATH pnpm sets for vitest finds the repository's own
		// `@typescript/typescript-<os>-<arch>` from anywhere.
		write_native_package(
			path.join(modules, '@typescript', 'native'),
			'@typescript/native',
			'7.1.0-dev.20260924.1',
			{ binary: false },
		);
		write_native_package(
			path.join(modules, '@typescript', 'native-preview'),
			'@typescript/native-preview',
			'7.1.0-dev.20260923.1',
		);
		expect(typescript_status(app_file()).project?.name).toBe('@typescript/native-preview');
	});

	it('skips a platform package that lacks the executable', () => {
		const directory = path.join(workspace, 'node_modules', '@typescript', 'native-preview');
		write_native_package(directory, '@typescript/native-preview', '7.1.0-dev.20260923.1');
		fs.rmSync(
			path.join(
				directory,
				'node_modules',
				'@typescript',
				`native-preview-${process.platform}-${process.arch}`,
				'lib',
				process.platform === 'win32' ? 'tsgo.exe' : 'tsgo',
			),
		);
		expect(typescript_status(app_file()).project).toBeUndefined();
	});

	it('finds the platform package beside a symlinked package, as pnpm lays them out', () => {
		const store = path.join(workspace, 'node_modules', '.pnpm', 'native-preview@7.1');
		const real_directory = path.join(store, 'node_modules', '@typescript', 'native-preview');
		write_native_package(real_directory, '@typescript/native-preview', '7.1.0-dev.20260923.1', {
			binary: false,
		});
		write_platform_binary(store, 'native-preview', 'tsgo');
		const link = path.join(workspace, 'node_modules', '@typescript', 'native-preview');
		fs.mkdirSync(path.dirname(link), { recursive: true });
		fs.symlinkSync(real_directory, link);
		expect(typescript_status(app_file()).project).toMatchObject({
			name: '@typescript/native-preview',
			directory: link,
		});
	});

	it.skipIf(process.platform === 'win32')(
		'finds a platform package with the Windows executable name',
		() => {
			const directory = path.join(workspace, 'node_modules', '@typescript', 'native-preview');
			on_windows(() => {
				write_native_package(directory, '@typescript/native-preview', '7.1.0-dev.20260923.1');
				expect(typescript_status(app_file()).project?.name).toBe('@typescript/native-preview');
			});
			// That is `tsgo.exe`, which an executable named `tsgo` is not.
			expect(typescript_status(app_file()).project).toBeUndefined();
		},
	);

	it('skips a package without the command the TypeScript 7 extension runs', () => {
		const modules = path.join(workspace, 'node_modules');
		write_native_package(
			path.join(modules, '@typescript', 'native-preview'),
			'@typescript/native-preview',
			'7.1.0-dev.20260923.1',
		);
		const native = path.join(modules, '@typescript', 'native');
		fs.mkdirSync(native, { recursive: true });
		fs.writeFileSync(
			path.join(native, 'package.json'),
			JSON.stringify({ name: '@typescript/native', version: '7.1.0-dev.20260924.1' }),
		);
		expect(typescript_status(app_file()).project?.name).toBe('@typescript/native-preview');
	});

	it("takes the project's nearest TypeScript and looks no higher than the workspace folder", () => {
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '6.0.3');
		write_typescript(
			path.join(workspace, 'src', 'node_modules', 'typescript'),
			'7.1.0-dev.20260930.4',
		);
		expect(typescript_status(app_file()).project?.version).toBe('7.1.0-dev.20260930.4');
		host.folders = [path.join(workspace, 'src')];
		fs.rmSync(path.join(workspace, 'src', 'node_modules'), { recursive: true });
		expect(typescript_status(app_file()).project).toBeUndefined();
	});

	it("cannot check .tsrx files with the TypeScript 7 extension's bundled 7.0", () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
		});
	});

	it('checks them with the TypeScript 7 Nightly extension, which it prefers to its bundled compiler', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		install('TypeScriptTeam.vscode-typescript-nightly', NIGHTLY);
		use_tsgo();
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260930.4',
		});
	});

	it('prefers a tsdk setting naming a TypeScript 7 package, resolved against the workspace folder', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		install('TypeScriptTeam.vscode-typescript-nightly', NIGHTLY);
		use_tsgo();
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260923.1');
		set('js/ts', 'tsdk.path', { workspaceValue: 'node_modules/typescript' });
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260923.1',
		});
	});

	it('does not count a package in node_modules, which the extension only offers', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
		});
	});

	it('names the compiler the server reports, not the workspace setting it has not allowed', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		set('js/ts', 'tsdk.path', { workspaceValue: 'node_modules/typescript' });
		const report = follow_extension_api();
		// Until the server reports, the settings are all there is.
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260930.4',
		});
		report({ version: '7.0.2' });
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
			workspace_tsdk_ignored: true,
		});
	});

	it('takes a workspace setting as allowed once the server reports its package', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		const directory = path.join(workspace, 'node_modules', 'typescript');
		write_typescript(directory, '7.1.0-dev.20260930.4');
		set('js/ts', 'tsdk.path', { workspaceValue: 'node_modules/typescript' });
		// Another version than the manifest says now, so the status must come from the report.
		follow_extension_api()({
			version: '7.1.0-dev.20260923.1',
			packageJsonPath: path.join(directory, 'package.json'),
		});
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260923.1',
			workspace_tsdk_ignored: false,
		});
	});

	it('tells a workspace compiler it ignores from a fallback of the same version', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		const bundled = path.join(workspace, 'bundled');
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.0.2');
		write_typescript(bundled, '7.0.2');
		set('js/ts', 'tsdk.path', { workspaceValue: 'node_modules/typescript' });
		follow_extension_api()({
			version: '7.0.2',
			packageJsonPath: path.join(bundled, 'package.json'),
		});
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
			workspace_tsdk_ignored: true,
		});
	});

	it('never calls a user setting ignored', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		set('js/ts', 'tsdk.path', { globalValue: 'node_modules/typescript' });
		follow_extension_api()({ version: '7.0.2' });
		expect(typescript_status(app_file()).workspace_tsdk_ignored).toBe(false);
	});

	it('keeps to the settings on extension 1.0.1, whose event passes nothing', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		follow_extension_api()();
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
		});
	});

	it('follows no compiler through an API without the event', () => {
		expect(follow_running_compiler({})).toBeUndefined();
		expect(follow_running_compiler(undefined)).toBeUndefined();
	});

	it('treats a local build the server reports as able to check .tsrx files', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		follow_extension_api()({ version: 'local' });
		expect(typescript_status(app_file())).toMatchObject({ kind: 'typescript-7', version: 'local' });
	});

	it('finds a local build, a directory with a bare compiler, with no report to go by', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		const build = path.join(workspace, 'built', 'local');
		fs.mkdirSync(build, { recursive: true });
		fs.writeFileSync(path.join(build, process.platform === 'win32' ? 'tsgo.exe' : 'tsgo'), '');
		set('js/ts', 'tsdk.path', { globalValue: build });
		expect(typescript_status(app_file())).toMatchObject({ kind: 'typescript-7', version: 'local' });
	});

	it.skipIf(process.platform === 'win32')(
		'finds a local build by its Windows executable name',
		() => {
			install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
			use_tsgo();
			const build = path.join(workspace, 'built', 'local');
			fs.mkdirSync(build, { recursive: true });
			fs.writeFileSync(path.join(build, 'tsc.exe'), '');
			set('js/ts', 'tsdk.path', { globalValue: build });
			on_windows(() => expect(typescript_status(app_file()).version).toBe('local'));
			expect(typescript_status(app_file()).version).toBe('7.0.2');
		},
	);

	it('matches a workspace local build by version, which is all its report has', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		const build = path.join(workspace, 'built', 'local');
		fs.mkdirSync(build, { recursive: true });
		fs.writeFileSync(path.join(build, process.platform === 'win32' ? 'tsc.exe' : 'tsc'), '');
		set('js/ts', 'tsdk.path', { workspaceValue: build });
		const report = follow_extension_api();
		report({ version: 'local' });
		expect(typescript_status(app_file()).workspace_tsdk_ignored).toBe(false);
		report({ version: '7.0.2' });
		expect(typescript_status(app_file()).workspace_tsdk_ignored).toBe(true);
	});

	it('skips a tsdk setting whose platform package an install left out', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		// Not `typescript`, as above.
		const directory = path.join(workspace, 'node_modules', '@typescript', 'native-preview');
		write_native_package(directory, '@typescript/native-preview', '7.1.0-dev.20260930.4', {
			binary: false,
		});
		set('js/ts', 'tsdk.path', { globalValue: 'node_modules/@typescript/native-preview' });
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
		});
		write_platform_binary(directory, 'native-preview', 'tsgo');
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260930.4',
		});
	});

	it('resolves a relative tsdk setting against the first of several workspace folders', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		// Not the repository's own version: a path left relative would find that one.
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260923.1');
		host.folders = [workspace, path.join(workspace, 'src')];
		set('js/ts', 'tsdk.path', { workspaceValue: 'node_modules/typescript' });
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260923.1',
		});
	});

	it('takes the most specific tsdk setting, and skips ones naming TypeScript 5 or 6', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
		const old_nightly = path.join(workspace, 'old');
		const current_nightly = path.join(workspace, 'current');
		const typescript_6 = path.join(workspace, 'six');
		write_typescript(old_nightly, '7.1.0-dev.20260918.1');
		write_typescript(current_nightly, '7.1.0-dev.20260930.4');
		write_typescript(typescript_6, '6.0.3');
		set('js/ts', 'tsdk.path', { globalValue: current_nightly, workspaceValue: old_nightly });
		expect(typescript_status(app_file())).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.1.0-dev.20260918.1',
		});
		set('js/ts', 'tsdk.path', { workspaceValue: path.join(typescript_6, 'lib') });
		expect(typescript_status(app_file()).version).toBe('7.0.2');
	});

	it("leaves .tsrx files to VS Code's TypeScript when TypeScript 7 is on with only the Nightly extension, which has no server", () => {
		install('TypeScriptTeam.vscode-typescript-nightly', NIGHTLY);
		use_tsgo();
		expect(typescript_status(app_file()).kind).toBe('vscode');
		expect(notice_for(typescript_status(app_file()))).toBeUndefined();
	});

	it('reads typescript.experimental.useTsgo only while js/ts.experimental.useTsgo is not set', () => {
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		set('typescript', 'experimental.useTsgo', { globalValue: true });
		expect(typescript_status(app_file()).kind).toBe('typescript-7-unsupported');
		set('js/ts', 'experimental.useTsgo', { workspaceValue: false });
		expect(typescript_status(app_file()).kind).toBe('vscode');
	});
});

describe('notices', () => {
	const project = { version: '7.1.0-dev.20260930.4', directory: '' };
	const labels = (/** @type {ReturnType<typeof notice_for>} */ notice) =>
		notice?.actions.map((action) => action.label);

	beforeEach(() => {
		project.directory = path.join(workspace, 'node_modules', 'typescript');
	});

	it('suggest the TypeScript 7 extension to a TypeScript 7 project that lacks it', () => {
		const notice = notice_for({ kind: 'vscode', project });
		expect(notice?.message).toBe(
			'This project uses TypeScript 7, but VS Code type-checks .tsrx files with its built-in TypeScript. To use TypeScript 7, click Install TypeScript 7.',
		);
		expect(labels(notice)).toEqual(['Install TypeScript 7', 'Learn More']);
	});

	it('stay quiet while TypeScript 7 is off by choice, or the project is not on TypeScript 7', () => {
		expect(
			notice_for({ kind: 'vscode', project: { version: '6.0.3', directory: '' } }),
		).toBeUndefined();
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		expect(notice_for({ kind: 'vscode', project })).toBeUndefined();
		expect(
			notice_for({ kind: 'typescript-7', version: '7.1.0-dev.20260930.4', project }),
		).toBeUndefined();
	});

	it("offer the project's TypeScript when TypeScript 7 cannot check .tsrx files", () => {
		write_typescript(project.directory, project.version);
		const notice = notice_for({ kind: 'typescript-7-unsupported', version: '7.0.2', project });
		expect(notice?.message).toBe(
			'TypeScript 7 uses version 7.0.2. This version cannot type-check .tsrx files. Your project has version 7.1.0-dev.20260930.4. To use it, click Use Project TypeScript.',
		);
		expect(labels(notice)).toEqual(['Use Project TypeScript', 'Turn Off TypeScript 7']);
	});

	it('send a workspace setting TypeScript 7 ignores to its version picker, where writing it again would do nothing', () => {
		write_typescript(project.directory, project.version);
		const notice = notice_for({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
			project,
			workspace_tsdk_ignored: true,
		});
		expect(notice?.message).toBe(
			'TypeScript 7 uses version 7.0.2. This version cannot type-check .tsrx files. The workspace settings name another compiler, which TypeScript 7 has not been allowed to use. To allow it, click Select TypeScript Version and choose Use Workspace Version. That also turns TypeScript 7 on in the workspace settings.',
		);
		expect(labels(notice)).toEqual(['Select TypeScript Version', 'Turn Off TypeScript 7']);
	});

	it('tell a project without TypeScript 7.1 to install typescript@next', () => {
		const notice = notice_for({ kind: 'typescript-7-unsupported', version: '7.0.2' });
		expect(notice?.message).toBe(
			"TypeScript 7 uses version 7.0.2. This version cannot type-check .tsrx files. Please use version 7.1.0-dev.20260923.1 or newer. To get it, install typescript@next in your project. To use VS Code's built-in TypeScript instead, click Turn Off TypeScript 7.",
		);
		expect(labels(notice)).toEqual(['Learn More', 'Turn Off TypeScript 7']);
	});
});

describe('status item and notices in the editor', () => {
	function context() {
		/** @type {Map<string, unknown>} */
		const state = new Map();
		return /** @type {import('vscode').ExtensionContext} */ (
			/** @type {unknown} */ ({
				subscriptions: [],
				workspaceState: {
					get: (/** @type {string} */ key) => state.get(key),
					update: async (/** @type {string} */ key, /** @type {unknown} */ value) => {
						state.set(key, value);
					},
				},
			})
		);
	}

	beforeEach(() => {
		host.active_editor = { document: { uri: app_file(), languageId: 'tsrx' } };
		install('TypeScriptTeam.native-preview', NATIVE_PREVIEW);
		use_tsgo();
	});

	it('names the TypeScript, and points to the fix when it cannot check the file', () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		const guidance = activate_typescript_guidance(context());
		expect(guidance.status()?.kind).toBe('typescript-7-unsupported');
		expect(host.status_item).toMatchObject({
			name: 'TSRX: TypeScript',
			severity: 1,
			text: 'TypeScript 7.0.2',
			detail: 'cannot type-check this file',
			command: { title: 'Fix…', command: 'tsrx.typescript.fix' },
		});
	});

	it('shows a notice once per window, and never again after "Don\'t Show Again"', async () => {
		host.showWarningMessage.mockResolvedValue("Don't Show Again");
		const workspace_context = context();
		const first = activate_typescript_guidance(workspace_context);
		expect(first.shown.map((notice) => notice.id)).toEqual(['typescript-7-unsupported']);
		expect(host.showWarningMessage).toHaveBeenCalledWith(
			expect.stringContaining('TypeScript 7 uses version 7.0.2'),
			'Learn More',
			'Turn Off TypeScript 7',
			"Don't Show Again",
		);
		await vi.waitFor(() =>
			expect(
				workspace_context.workspaceState.get(
					'tsrx.typescriptNotice.typescript-7-unsupported.dismissed',
				),
			).toBe(true),
		);
		const second = activate_typescript_guidance(workspace_context);
		expect(second.shown).toEqual([]);
	});

	it('runs the chosen action', async () => {
		host.showWarningMessage.mockResolvedValue('Turn Off TypeScript 7');
		activate_typescript_guidance(context());
		await vi.waitFor(() =>
			expect(host.executeCommand).toHaveBeenCalledWith('typescript.experimental.disableTsgo'),
		);
	});

	it("turns TypeScript 7 off through its extension, or through VS Code's TypeScript without it", async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		const guidance = activate_typescript_guidance(context());
		await guidance.run('turn-off-typescript-7');
		expect(host.executeCommand).toHaveBeenLastCalledWith('typescript.experimental.disableTsgo');
		host.commands = ['typescript.native-preview.disable'];
		await guidance.run('turn-off-typescript-7');
		expect(host.executeCommand).toHaveBeenLastCalledWith('typescript.native-preview.disable');
	});

	it("points TypeScript 7 at the folder's TypeScript through the user settings, and restarts it", async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		const guidance = activate_typescript_guidance(context());
		await guidance.run('use-project-typescript');
		expect(host.updates).toEqual([
			{ name: 'js/ts.tsdk.path', value: 'node_modules/typescript', target: 1 },
		]);
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith(
			'typescript.native-preview.restart',
		);
		expect(guidance.status()).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260930.4',
		});
	});

	it('refreshes the status by itself on a report, and uses the settings while a report is not current', () => {
		const report = follow_extension_api();
		const guidance = activate_typescript_guidance(context());
		let current = true;
		report({ version: '7.1.0-dev.20260930.4', isCurrent: () => current });
		expect(guidance.status()?.version).toBe('7.1.0-dev.20260930.4');
		current = false;
		changed('js/ts.experimental.useTsgo');
		expect(guidance.status()?.version).toBe('7.0.2');
		report({ version: '7.1.0-dev.20260923.1' });
		expect(guidance.status()?.version).toBe('7.1.0-dev.20260923.1');
	});

	it('stops listening for reports on dispose', () => {
		const report = follow_extension_api();
		const extension_context = context();
		const guidance = activate_typescript_guidance(extension_context);
		for (const subscription of extension_context.subscriptions) subscription.dispose();
		report({ version: '7.1.0-dev.20260930.4' });
		expect(guidance.status()?.version).toBe('7.0.2');
	});

	it('keeps naming the old server after a setting changes, without calling the setting ignored', () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		const old_nightly = path.join(workspace, 'old');
		const new_nightly = path.join(workspace, 'new');
		write_typescript(old_nightly, '7.1.0-dev.20260923.1');
		write_typescript(new_nightly, '7.1.0-dev.20260930.4');
		set('js/ts', 'tsdk.path', { workspaceValue: old_nightly });
		const report = follow_extension_api();
		const guidance = activate_typescript_guidance(context());
		report({
			version: '7.1.0-dev.20260923.1',
			packageJsonPath: path.join(old_nightly, 'package.json'),
		});
		expect(guidance.status()?.workspace_tsdk_ignored).toBe(false);
		set('js/ts', 'tsdk.path', { workspaceValue: new_nightly });
		changed('js/ts.tsdk.path');
		// The restart can fail, or the user can decline it, so this server may stay.
		expect(guidance.status()).toMatchObject({
			version: '7.1.0-dev.20260923.1',
			workspace_tsdk_ignored: false,
		});
		expect(guidance.shown).toEqual([]);
		report({
			version: '7.1.0-dev.20260930.4',
			packageJsonPath: path.join(new_nightly, 'package.json'),
		});
		expect(guidance.status()).toMatchObject({
			version: '7.1.0-dev.20260930.4',
			workspace_tsdk_ignored: false,
		});
	});

	it('goes back to the settings when the extension it follows goes, and says so', () => {
		const report = follow_extension_api();
		const guidance = activate_typescript_guidance(context());
		report({ version: '7.1.0-dev.20260930.4' });
		expect(guidance.status()?.version).toBe('7.1.0-dev.20260930.4');
		for (const disposable of followed.splice(0)) disposable?.dispose();
		expect(guidance.status()?.version).toBe('7.0.2');
	});

	it('restarts TypeScript 7 for a change of tsdk setting that only a local build sees', () => {
		const build = path.join(workspace, 'built', 'local');
		fs.mkdirSync(build, { recursive: true });
		activate_typescript_guidance(context());
		fs.writeFileSync(path.join(build, process.platform === 'win32' ? 'tsgo.exe' : 'tsgo'), '');
		set('js/ts', 'tsdk.path', { globalValue: build });
		changed('js/ts.tsdk.path');
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith(
			'typescript.native-preview.restart',
		);
	});

	it('lists the version picker once in the Fix… menu', async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		set('js/ts', 'tsdk.path', { workspaceValue: 'node_modules/typescript' });
		const report = follow_extension_api();
		activate_typescript_guidance(context());
		report({ version: '7.0.2' });
		await host.registered_commands.get('tsrx.typescript.fix')?.();
		const items = host.showQuickPick.mock.calls[0][0];
		expect(items.map((/** @type {{ label: string }} */ item) => item.label)).toEqual([
			'Select TypeScript Version',
			'Turn Off TypeScript 7',
			'Restart Language Server',
		]);
	});

	it('keeps the version picker in the Fix… menu of a notice that has none', async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		activate_typescript_guidance(context());
		await host.registered_commands.get('tsrx.typescript.fix')?.();
		const items = host.showQuickPick.mock.calls[0][0];
		expect(items.map((/** @type {{ label: string }} */ item) => item.label)).toContain(
			'Select TypeScript Version…',
		);
	});

	it("shows the notice once the server reports a compiler the settings did not predict, and opens the extension's version picker", async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		set('js/ts', 'tsdk.path', { workspaceValue: 'node_modules/typescript' });
		const guidance = activate_typescript_guidance(context());
		expect(guidance.status()?.kind).toBe('typescript-7');
		expect(guidance.shown).toEqual([]);
		follow_extension_api()({ version: '7.0.2' });
		expect(guidance.status()).toMatchObject({
			kind: 'typescript-7-unsupported',
			version: '7.0.2',
		});
		expect(guidance.shown.map((notice) => notice.actions[0])).toEqual([
			'Select TypeScript Version',
		]);
		await guidance.run('select-typescript-version');
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith(
			'typescript.native-preview.selectVersion',
		);
	});

	it("points TypeScript 7 at the folder's package under its own name", async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		write_native_package(
			path.join(workspace, 'node_modules', '@typescript', 'native'),
			'@typescript/native',
			'7.1.0-dev.20260930.4',
		);
		const guidance = activate_typescript_guidance(context());
		await guidance.run('use-project-typescript');
		expect(host.updates).toEqual([
			{ name: 'js/ts.tsdk.path', value: 'node_modules/@typescript/native', target: 1 },
		]);
		expect(guidance.status()).toMatchObject({
			kind: 'typescript-7',
			version: '7.1.0-dev.20260930.4',
		});
	});

	it('uses the workspace settings for a TypeScript only a subfolder installs, and restarts the extension host so TypeScript 7 asks to allow it', async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		write_typescript(
			path.join(workspace, 'src', 'node_modules', 'typescript'),
			'7.1.0-dev.20260930.4',
		);
		const guidance = activate_typescript_guidance(context());
		await guidance.run('use-project-typescript');
		expect(host.updates).toEqual([
			{
				name: 'js/ts.tsdk.path',
				value: path.join('src', 'node_modules', 'typescript'),
				target: 2,
			},
		]);
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith(
			'workbench.action.restartExtensionHost',
		);
	});

	it('replaces a tsdk setting already in the workspace there, where it outranks the user settings', async () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		write_typescript(path.join(workspace, 'old'), '7.1.0-dev.20260918.1');
		set('js/ts', 'tsdk.path', { workspaceValue: 'old' });
		const guidance = activate_typescript_guidance(context());
		await guidance.run('use-project-typescript');
		expect(host.updates).toEqual([
			{ name: 'js/ts.tsdk.path', value: 'node_modules/typescript', target: 2 },
		]);
	});

	it('restarts TypeScript 7 when a hand edit changes its compiler, and only then', () => {
		host.showWarningMessage.mockResolvedValue(undefined);
		write_typescript(path.join(workspace, 'node_modules', 'typescript'), '7.1.0-dev.20260930.4');
		activate_typescript_guidance(context());
		set('js/ts', 'tsdk.path', { globalValue: 'node_modules/typ' });
		changed('js/ts.tsdk.path');
		expect(host.executeCommand).not.toHaveBeenCalled();
		set('js/ts', 'tsdk.path', { globalValue: 'node_modules/typescript' });
		changed('js/ts.tsdk.path');
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith(
			'typescript.native-preview.restart',
		);
		set('js/ts', 'experimental.useTsgo', { globalValue: false });
		changed('js/ts.experimental.useTsgo');
		set('js/ts', 'tsdk.path', {});
		changed('js/ts.tsdk.path');
		expect(host.executeCommand).toHaveBeenCalledOnce();
	});
});
