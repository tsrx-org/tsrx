/**
 * Directories that installs, dev servers and builds write, such as Vite's
 * `node_modules/.vite/deps`. The same list as `GENERATED_DIRECTORY_NAMES` in
 * `@tsrx/language-server`'s `workspaceState.js`, which ignores these events.
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

/** Files that package managers write in `node_modules` at the end of every install. */
const INSTALL_MARKER_FILE_NAMES = new Set([
	'.modules.yaml',
	'.package-lock.json',
	'.yarn-state.yml',
	'.yarn-integrity',
]);

/**
 * Whether the TSRX language server needs a file event, from the file's path relative
 * to its workspace folder. VS Code's default `files.watcherExclude` watches
 * `node_modules` and build output, so the server's watcher for JSON files sees every
 * package.json a dev server writes there. vscode-languageclient holds file events
 * until none has arrived for 250 ms, so a steady stream of them grows that queue in
 * the extension host without limit. The server ignores the events in generated
 * directories except the ones kept here: a TypeScript config (a project can extend
 * one, such as `.nuxt/tsconfig.json`), and a file that shows an install finished (an
 * install marker, or the manifest of a package installed directly in a
 * `node_modules` folder).
 * @param {string} relative_path
 * @returns {boolean}
 */
export function is_needed_file_event(relative_path) {
	const segments = relative_path.split(/[\\/]/);
	if (!segments.some((segment) => GENERATED_DIRECTORY_NAMES.has(segment))) return true;
	const base_name = segments[segments.length - 1].toLowerCase();
	if (
		base_name.endsWith('.json') &&
		(base_name.includes('tsconfig') || base_name.includes('jsconfig'))
	) {
		return true;
	}
	const index = segments.indexOf('node_modules');
	if (index === -1 || segments.includes('node_modules', index + 1)) return false;
	const rest = segments.slice(index + 1);
	if (rest.length === 1) return INSTALL_MARKER_FILE_NAMES.has(rest[0]);
	const name = rest.slice(0, rest[0].startsWith('@') ? 2 : 1);
	return (
		rest.length === name.length + 1 &&
		rest[rest.length - 1] === 'package.json' &&
		name.every((segment) => !segment.startsWith('.'))
	);
}

/**
 * The `didChangeWatchedFile` middleware: forward only the file events the server
 * needs (`is_needed_file_event`).
 * @param {(uri: string) => string} relative_path The path of a file URI relative to
 *   its workspace folder (`vscode.workspace.asRelativePath`), or the whole path when no
 *   workspace folder holds it.
 * @returns {(event: import('vscode-languageclient/node').FileEvent, next: (event: import('vscode-languageclient/node').FileEvent) => Promise<void>) => Promise<void>}
 */
export function forward_needed_file_events(relative_path) {
	return (event, next) =>
		is_needed_file_event(relative_path(event.uri)) ? next(event) : Promise.resolve();
}
