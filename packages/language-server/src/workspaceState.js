import path from 'node:path';
import { URI } from 'vscode-uri';

/** Configs and package state, which every backend reacts to (`classifyWorkspaceChanges`). */
const CONFIG_AND_PACKAGE_STATE_PATTERNS = [
	'**/*.json',
	'**/pnpm-lock.yaml',
	'**/pnpm-workspace.yaml',
	'**/yarn.lock',
	'**/bun.lock',
	'**/bun.lockb',
	// Written at the end of an install (`INSTALL_MARKER_FILE_NAMES`).
	'**/node_modules/.modules.yaml',
	'**/node_modules/.package-lock.json',
	'**/node_modules/.yarn-state.yml',
	'**/node_modules/.yarn-integrity',
];

export const WORKSPACE_FILE_PATTERNS = [
	// Volar consumes source-file events itself to refresh filesystem snapshots
	// and TypeScript project versions. These do not trigger the explicit cache
	// invalidation or project reloads classified below.
	'**/*.tsrx',
	'**/*.ts',
	'**/*.tsx',
	'**/*.cts',
	'**/*.mts',
	'**/*.js',
	'**/*.jsx',
	'**/*.cjs',
	'**/*.mjs',
	...CONFIG_AND_PACKAGE_STATE_PATTERNS,
];

/**
 * The files to watch on a backend. Only the classic backend hosts a TypeScript
 * project, which needs the TypeScript and JavaScript source events. On the other
 * backends the editor's TypeScript reads those files, and watching them in a large
 * workspace only floods the server with events from build output and dev servers.
 * @param {import('./backend.js').TypeScriptBackend} backend
 * @returns {string[]}
 */
export function getWorkspaceFilePatterns(backend) {
	return backend === 'classic'
		? WORKSPACE_FILE_PATTERNS
		: ['**/*.tsrx', ...CONFIG_AND_PACKAGE_STATE_PATTERNS];
}

/**
 * Directories that installs, dev servers and builds write, such as Vite's
 * `node_modules/.vite/deps/package.json` or Next.js's `.next/package.json`. No
 * project the TSRX compiler resolves from lives in one. Keep in sync with
 * `file-events.js` in the VS Code extension, which drops the same events.
 */
const GENERATED_DIRECTORY_NAMES = new Set([
	'node_modules',
	'.next',
	'.nuxt',
	'.output',
	'.svelte-kit',
	'.turbo',
	'.vercel',
]);

/**
 * Files that pnpm, npm, Yarn (node-modules linker) and Yarn 1 write directly in
 * `node_modules` at the end of every install.
 */
const INSTALL_MARKER_FILE_NAMES = new Set([
	'.modules.yaml',
	'.package-lock.json',
	'.yarn-state.yml',
	'.yarn-integrity',
]);

const PACKAGE_STATE_FILE_NAMES = new Set([
	'package.json',
	'package-lock.json',
	'pnpm-lock.yaml',
	'pnpm-workspace.yaml',
	'yarn.lock',
	'bun.lock',
	'bun.lockb',
]);

/**
 * @param {string} file_name
 */
export function isTypeScriptConfigFile(file_name) {
	const base_name = path.basename(file_name).toLowerCase();
	return (
		base_name.endsWith('.json') &&
		(base_name.includes('tsconfig') || base_name.includes('jsconfig'))
	);
}

/**
 * @param {string} file_name
 */
export function isTypeDefinitionFile(file_name) {
	return /\.d\.[cm]?ts$/i.test(file_name);
}

/**
 * @param {string} file_name
 */
export function isPackageStateFile(file_name) {
	return PACKAGE_STATE_FILE_NAMES.has(path.basename(file_name).toLowerCase());
}

/**
 * The path segments of a file, relative to the workspace folder that holds it, so a
 * workspace opened inside a `node_modules` folder keeps its own events.
 * @param {string} file_name
 * @param {readonly string[]} workspace_folders
 */
function workspaceRelativeSegments(file_name, workspace_folders) {
	const normalized = normalizeFileName(file_name);
	let relative = normalized;
	for (const folder of workspace_folders) {
		const normalized_folder = normalizeFileName(folder).replace(/[\\/]+$/, '');
		if (
			normalized.startsWith(normalized_folder) &&
			/[\\/]/.test(normalized[normalized_folder.length] ?? '') &&
			normalized.length - normalized_folder.length - 1 < relative.length
		) {
			relative = normalized.slice(normalized_folder.length + 1);
		}
	}
	return relative.split(/[\\/]/);
}

/**
 * @param {string} file_name
 * @param {readonly string[]} [workspace_folders]
 */
export function isGeneratedFile(file_name, workspace_folders = []) {
	return workspaceRelativeSegments(file_name, workspace_folders).some((segment) =>
		GENERATED_DIRECTORY_NAMES.has(segment),
	);
}

/**
 * Whether a file under `node_modules` shows that an install finished: an install
 * marker, or the manifest of a package installed directly in a `node_modules`
 * folder (`node_modules/<name>/package.json`, `node_modules/@scope/<name>/package.json`),
 * which npm and Bun write for each package they install. The lockfile is not enough:
 * `git pull` can change it before the install that changes the TSRX compiler.
 * @param {readonly string[]} segments Path segments relative to the workspace folder.
 */
function isInstallStateFile(segments) {
	const index = segments.indexOf('node_modules');
	if (index === -1 || segments.includes('node_modules', index + 1)) return false;
	const rest = segments.slice(index + 1);
	if (rest.length === 1) return INSTALL_MARKER_FILE_NAMES.has(rest[0]);
	const name = rest.slice(0, rest[0]?.startsWith('@') ? 2 : 1);
	return (
		rest.length === name.length + 1 &&
		rest[rest.length - 1] === 'package.json' &&
		name.every((segment) => !segment.startsWith('.'))
	);
}

/**
 * @param {string} file_name
 */
function normalizeFileName(file_name) {
	const is_windows_path =
		process.platform === 'win32' || /^[a-z]:[\\/]/i.test(file_name) || file_name.startsWith('\\\\');
	const path_api = is_windows_path ? path.win32 : path;
	const normalized = path_api.normalize(path_api.resolve(file_name));
	return is_windows_path ? normalized.toLowerCase() : normalized;
}

/**
 * Record every config file that contributed to a parsed TypeScript project.
 * This set is intentionally additive across project reloads because Volar
 * recreates projects lazily. TypeScript allows both `extends` and
 * project-reference configs to use names other than tsconfig.json, so filename
 * matching alone is not sufficient.
 * @param {Set<string>} config_files
 * @param {{
 *   configFileName?: string,
 *   compilerOptions?: import('typescript').CompilerOptions,
 *   projectReferences?: readonly import('typescript').ProjectReference[],
 *   configDependencies?: Iterable<string>,
 * }} project
 */
export function trackTypeScriptConfigDependencies(config_files, project) {
	if (project.configFileName) {
		config_files.add(normalizeFileName(project.configFileName));
	}

	const config_file = /** @type {import('typescript').TsConfigSourceFile | undefined} */ (
		project.compilerOptions?.configFile
	);
	for (const extended_file of config_file?.extendedSourceFiles ?? []) {
		config_files.add(normalizeFileName(extended_file));
	}

	for (const reference of project.projectReferences ?? []) {
		config_files.add(normalizeFileName(reference.path));
	}

	for (const dependency of project.configDependencies ?? []) {
		config_files.add(normalizeFileName(dependency));
	}
}

/**
 * Classify watched changes before mutating project state. Package changes need
 * a process restart because Node does not expose a supported way to evict a
 * loaded ESM compiler and its transitive module graph. A file in a generated
 * directory restarts the server only when it shows that an install finished
 * (`isInstallStateFile`), and reloads projects only when a project loaded it as a
 * config: dev servers rewrite such files all the time, and restarting on each one
 * kept a large workspace restarting the server.
 * @param {import('@volar/language-server').FileEvent[]} changes
 * @param {ReadonlySet<string>} [tracked_config_files]
 * @param {readonly string[]} [workspace_folders] File system paths of the workspace folders.
 */
export function classifyWorkspaceChanges(
	changes,
	tracked_config_files = new Set(),
	workspace_folders = [],
) {
	let reloadProjects = false;
	let restartLanguageServer = false;
	/** @type {Set<string>} */
	const changedTypeDefinitions = new Set();

	for (const change of changes) {
		const uri = URI.parse(change.uri);
		const file_name = uri.scheme === 'file' ? uri.fsPath : uri.path;
		const segments = workspaceRelativeSegments(file_name, workspace_folders);
		const generated = segments.some((segment) => GENERATED_DIRECTORY_NAMES.has(segment));

		if (
			(!generated && isTypeScriptConfigFile(file_name)) ||
			tracked_config_files.has(normalizeFileName(file_name))
		) {
			reloadProjects = true;
		}

		if (generated ? isInstallStateFile(segments) : isPackageStateFile(file_name)) {
			restartLanguageServer = true;
		} else if (isTypeDefinitionFile(file_name)) {
			changedTypeDefinitions.add(file_name);
		}
	}

	return {
		restartLanguageServer,
		reloadProjects: reloadProjects && !restartLanguageServer,
		changedTypeDefinitions: restartLanguageServer ? [] : [...changedTypeDefinitions],
	};
}

/**
 * Run `restart` once, after package changes have stopped for `delay` ms, so a burst
 * of them, such as an install, restarts the server once; or `max_delay` ms after
 * the first change at the latest, so a steady stream cannot hold it off.
 * @param {() => void} restart
 * @param {number} [delay]
 * @param {number} [max_delay]
 * @returns {() => void} Call on each change that needs a restart.
 */
export function createRestartScheduler(restart, delay = 1000, max_delay = 10_000) {
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	/** @type {number | undefined} */
	let first_change;
	let restarted = false;
	return () => {
		if (restarted) return;
		const now = Date.now();
		first_change ??= now;
		clearTimeout(timer);
		timer = setTimeout(
			() => {
				restarted = true;
				restart();
			},
			Math.min(delay, first_change + max_delay - now),
		);
	};
}

/**
 * @param {import('@volar/language-server').FileEvent[]} changes
 * @param {{
 *   restartLanguageServer: () => void,
 *   invalidateCompilerResolutionCaches?: () => void,
 *   reloadProjects: () => void,
 *   requestRefresh: (clearDiagnostics: boolean) => unknown,
 *   invalidateTypeDefinitions: (file_name?: string) => void,
 * }} hooks
 * @param {ReadonlySet<string>} [tracked_config_files]
 * @param {readonly string[]} [workspace_folders]
 */
export function handleWorkspaceChanges(changes, hooks, tracked_config_files, workspace_folders) {
	const effects = classifyWorkspaceChanges(changes, tracked_config_files, workspace_folders);

	if (effects.restartLanguageServer) {
		hooks.restartLanguageServer();
		return effects;
	}

	for (const file_name of effects.changedTypeDefinitions) {
		hooks.invalidateTypeDefinitions(file_name);
	}

	if (effects.reloadProjects) {
		hooks.invalidateCompilerResolutionCaches?.();
		hooks.reloadProjects();
		void hooks.requestRefresh(true);
	}

	return effects;
}
