/**
 * Formatting for `.tsrx` files with the project's own Prettier and
 * `@tsrx/prettier-plugin`, so every editor that runs the TSRX language server
 * formats them the same way the project's `prettier` command does.
 *
 * Nothing here depends on Volar or on the editor protocol:
 * `formattingHandler.js` connects it to `textDocument/formatting`.
 *
 * - Both packages come from the project, found from the file's folder. TSRX
 *   bundles no Prettier, so the result matches the project's Prettier version.
 * - The plugin and the `tsrx` parser are always passed, so `.tsrx` files format
 *   even when the Prettier config does not list the plugin. The `prettier`
 *   command still needs it listed.
 * - `.prettierrc` (and the other Prettier config files), `.editorconfig` and the
 *   nearest `.prettierignore` apply as they do on the command line, so the editor
 *   and `prettier --write` give the same result. The editor's indentation applies
 *   only when the project has neither a Prettier config nor an `.editorconfig`.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const PRETTIER_PLUGIN = '@tsrx/prettier-plugin';

/** The oldest Prettier `@tsrx/prettier-plugin` supports (its `prettier` peer range). */
export const MINIMUM_PRETTIER_VERSION = '3.6.0';

/**
 * @typedef {(
 * 	| { status: 'formatted', text: string }
 * 	| { status: 'unchanged' }
 * 	| { status: 'ignored' }
 * 	| { status: 'missing', packages: string[] }
 * 	| { status: 'unsupported', version: string }
 * 	| { status: 'failed', error: unknown }
 * )} FormatResult
 */

/**
 * @typedef {{
 * 	version: string,
 * 	format(text: string, options: Record<string, unknown>): Promise<string>,
 * 	resolveConfig(file: string, options: { editorconfig: boolean }): Promise<Record<string, any> | null>,
 * 	getFileInfo(file: string, options: Record<string, unknown>): Promise<{ ignored: boolean }>,
 * 	clearConfigCache(): Promise<void>,
 * }} Prettier
 */

/**
 * @param {{
 * 	file_path: string,
 * 	text: string,
 * 	tab_size?: number,
 * 	insert_spaces?: boolean,
 * 	range?: { start: number, end: number },
 * }} options `range`: format only the code these offsets cover (Format Selection,
 *   format on paste), as Prettier's `rangeStart` and `rangeEnd` do.
 * @returns {Promise<FormatResult>}
 */
export async function format_tsrx({ file_path, text, tab_size = 2, insert_spaces = true, range }) {
	const prettier_entry = resolve(file_path, 'prettier');
	const plugin_entry = resolve(file_path, PRETTIER_PLUGIN);
	const missing = [
		...(prettier_entry ? [] : ['prettier']),
		...(plugin_entry ? [] : [PRETTIER_PLUGIN]),
	];
	if (!prettier_entry || !plugin_entry) return { status: 'missing', packages: missing };

	try {
		/** @type {Prettier} */
		const prettier = createRequire(prettier_entry)(prettier_entry);
		if (!at_least(prettier.version, MINIMUM_PRETTIER_VERSION)) {
			return { status: 'unsupported', version: prettier.version };
		}
		// Pick up edits to the Prettier config without a restart.
		await prettier.clearConfigCache();
		const ignore_path = find_up(path.dirname(file_path), '.prettierignore');
		const info = await prettier.getFileInfo(file_path, {
			ignorePath: ignore_path,
			plugins: [plugin_entry],
			resolveConfig: false,
		});
		if (info.ignored) return { status: 'ignored' };

		const config = (await prettier.resolveConfig(file_path, { editorconfig: true })) ?? {
			tabWidth: tab_size,
			useTabs: !insert_spaces,
		};
		// Prettier resolves a plugin listed by package name from the process's working
		// directory, which for an editor's language server is not the project, so each
		// one is resolved from the file's node_modules here, as the Prettier extension
		// does. A name it cannot find stays for Prettier to report.
		/** @type {unknown[]} */
		const plugins = (Array.isArray(config.plugins) ? config.plugins : []).map(
			(/** @type {unknown} */ plugin) =>
				typeof plugin === 'string' && is_package_name(plugin)
					? plugin === PRETTIER_PLUGIN
						? plugin_entry
						: (resolve(file_path, plugin) ?? plugin)
					: plugin,
		);
		if (!plugins.includes(plugin_entry)) plugins.push(plugin_entry);
		const formatted = await prettier.format(text, {
			...config,
			filepath: file_path,
			parser: 'tsrx',
			plugins,
			...(range ? { rangeStart: range.start, rangeEnd: range.end } : {}),
		});
		return formatted === text ? { status: 'unchanged' } : { status: 'formatted', text: formatted };
	} catch (error) {
		return { status: 'failed', error };
	}
}

/**
 * Whether a plugin entry is a package name (`@tsrx/prettier-plugin`), not a path or URL.
 * @param {string} specifier
 */
function is_package_name(specifier) {
	return !specifier.startsWith('.') && !path.isAbsolute(specifier) && !/^[a-z]+:/i.test(specifier);
}

/**
 * The nearest folder, from `directory` up, that contains `name`, joined with it.
 * @param {string} directory
 * @param {string} name
 * @returns {string | undefined}
 */
export function find_up(directory, name) {
	for (let current = directory; ; current = path.dirname(current)) {
		const candidate = path.join(current, name);
		if (fs.existsSync(candidate)) return candidate;
		if (path.dirname(current) === current) return undefined;
	}
}

/**
 * The entry of package `name` in the nearest `node_modules` above `file_path`. Only
 * the project's folders count: Node would also look in `NODE_PATH` and global
 * folders, which can hold another copy (pnpm sets `NODE_PATH` for its scripts).
 * @param {string} file_path
 * @param {string} name
 */
function resolve(file_path, name) {
	const manifest = find_up(
		path.dirname(file_path),
		path.join('node_modules', name, 'package.json'),
	);
	if (!manifest) return undefined;
	// The folder that holds that `node_modules`: resolving from there finds this copy first.
	const base = manifest.slice(0, manifest.lastIndexOf(path.join(path.sep, 'node_modules', name)));
	try {
		return createRequire(path.join(base, 'package.json')).resolve(name);
	} catch {
		return undefined;
	}
}

/**
 * Whether `version` is `minimum` or newer, by major, minor and patch.
 * @param {string} version
 * @param {string} minimum
 */
function at_least(version, minimum) {
	const parts = (/** @type {string} */ value) => value.split(/[.+-]/).slice(0, 3).map(Number);
	const [a, b] = [parts(version), parts(minimum)];
	for (let index = 0; index < 3; index++) {
		if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
	}
	return true;
}
