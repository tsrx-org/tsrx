/** @import * as AST from 'estree' */
/** @import { Platform } from '../../types/index' */
/** @import { BuildPlatformResolutionOptions } from '../../types/config' */

/**
 * Vite support for compile-time platform flags outside `.tsrx` compilation.
 *
 * - Vite reads `define`, which holds the flag constants for ordinary modules,
 *   once per server start. {@link restartOnPlatformChange} restarts the dev
 *   server when a tsconfig change selects a different platform, so neither the
 *   constants nor the `.tsrx` compile options keep the old selection.
 * - Vite only defines the flags once a platform is configured. Without one, a
 *   flag in a module the TSRX compiler never sees would build and then fail
 *   when it runs (`(void 0).web`). {@link findUnconfiguredPlatformFlag} finds
 *   it so the plugin can reject it, as the compiler rejects one in a `.tsrx`
 *   module.
 */

import { getBuildPlatformConfigFiles, resolveBuildPlatform } from '../config.js';
import { TSRX_ERRORS } from '../diagnostics.js';
import { find_platform_flag } from '../transform/platform.js';

const ORDINARY_MODULE_PATTERN = /\.[cm]?[jt]sx?$/;
const PLATFORM_NAMESPACE_PATTERN = /\bimport\s*\.\s*meta\s*\.\s*env\s*\.\s*platform\b/;

/**
 * Watch the tsconfig files the platform comes from, including an `extends`
 * target or project reference outside the Vite root, and re-resolve the
 * platform whenever a `.json` file changes. The server restarts when the
 * selection differs from the one it started with, or when the configuration
 * no longer resolves, so Vite reports the error.
 *
 * @param {{
 *   watcher: {
 *     add(paths: string[]): unknown,
 *     on(event: 'change' | 'add' | 'unlink', listener: (file: string) => void): unknown,
 *   },
 *   restart(): Promise<void>,
 * }} server
 * @param {BuildPlatformResolutionOptions} options the options the plugin resolved its platform with
 * @param {() => Platform | undefined} current the platform the plugin uses now
 */
export function restartOnPlatformChange(server, options, current) {
	// An edit that keeps the platform can still add an `extends` target.
	const watch_config_files = () => server.watcher.add(getBuildPlatformConfigFiles(options));
	watch_config_files();

	/** @param {string} file */
	function on_change(file) {
		if (!file.endsWith('.json')) return;
		let changed;
		try {
			changed = resolveBuildPlatform(options) !== current();
		} catch {
			changed = true;
		}
		if (changed) void server.restart();
		else watch_config_files();
	}

	server.watcher.on('change', on_change);
	server.watcher.on('add', on_change);
	server.watcher.on('unlink', on_change);
}

/**
 * Find the first recognized platform flag in an ordinary JavaScript or
 * TypeScript module. Call it only while no platform is configured.
 *
 * @param {string} code
 * @param {string} id
 * @param {(filename: string, code: string) => { program: unknown, errors: readonly unknown[] }} parse
 *   Vite's `parseSync`. A module it cannot parse is left to Vite.
 * @returns {{ message: string, code: string, pos: number } | null}
 */
export function findUnconfiguredPlatformFlag(code, id, parse) {
	// A query (`?worker_file`, `?raw`, or another plugin's) leaves the module
	// kind to the path. A flag that only appears in a string stays unmatched.
	const file = id.split('?')[0];
	if (!ORDINARY_MODULE_PATTERN.test(file) || !PLATFORM_NAMESPACE_PATTERN.test(code)) return null;

	const { program, errors } = parse(file, code);
	if (errors.length > 0) return null;

	const flag = find_platform_flag(/** @type {AST.Node} */ (program));
	if (flag === null) return null;
	return {
		message: TSRX_ERRORS.PLATFORM_REQUIRED.message,
		code: TSRX_ERRORS.PLATFORM_REQUIRED.code,
		pos: /** @type {AST.Node & { start: number }} */ (flag).start,
	};
}
