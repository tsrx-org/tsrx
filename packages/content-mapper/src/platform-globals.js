/** @import {CodeMapping} from '@tsrx/core/types' */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The editor-only `ImportMetaEnv` / `ImportMeta` globals that `withPlatformTypes`
 * in `@tsrx/core` appends to the generated TSX of a module that keeps a platform
 * flag, exactly as it prints them, with the three flag value types captured.
 */
const PLATFORM_GLOBALS =
	/\ndeclare global \{\n\tinterface ImportMetaEnv \{\n\t\treadonly platform: string & \{\n\t\t\treadonly web: (true|false|boolean);\n\t\t\treadonly ios: (true|false|boolean);\n\t\t\treadonly android: (true|false|boolean);\n\t\t\};\n\t\}\n\tinterface ImportMeta \{\n\t\treadonly \[key: `env\$\{string\}`\]: ImportMetaEnv;\n\t\}\n\}\n/;

/** The `platform-globals/` file that declares each set of flag value types. */
const PLATFORM_FILES = new Map([
	['true,false,false', 'web'],
	['false,true,false', 'ios'],
	['false,false,true', 'android'],
	['boolean,boolean,boolean', 'unconfigured'],
]);

/** @type {Map<string, string | null>} */
const files = new Map();

/**
 * Replace a module's copy of the platform globals in its generated TSX with a
 * reference to the shared file that declares the same globals. Native
 * TypeScript merges every module's copy into one `ImportMeta` and reports the
 * repeated index signature (TS2374), and declaration output keeps every
 * `declare global` block. The shared file is in the program once, and
 * declaration output drops a `/// <reference path>` directive.
 *
 * The copy is blanked in place, and the directive goes at the start of the
 * text, where TypeScript reads it, so every generated offset moves by its
 * length. A directive is not an import: organize imports and auto-import still
 * see only the module's own imports, and TypeScript 7 maps their edits only
 * when the last of them is the module's last import. Text without the exact
 * copy (another TSRX version, a third-party compiler), or that starts with a
 * hashbang, comes back unchanged.
 * @param {string} text
 * @param {readonly CodeMapping[]} mappings
 * @returns {{ text: string, mappings: readonly CodeMapping[] }}
 */
export function share_platform_globals(text, mappings) {
	const match = PLATFORM_GLOBALS.exec(text);
	const name = match && PLATFORM_FILES.get(match.slice(1).join(','));
	const file = name && !text.startsWith('#!') ? platform_globals_file(name) : null;
	if (!match || !file) return { text, mappings };
	const directive = `/// <reference path="${file}" />\n`;
	const end = match.index + match[0].length;
	return {
		text: `${directive}${text.slice(0, match.index)}${match[0].replace(/[^\n]/g, ' ')}${text.slice(end)}`,
		mappings: mappings.map((mapping) => ({
			...mapping,
			generatedOffsets: mapping.generatedOffsets.map((offset) => offset + directive.length),
		})),
	};
}

/**
 * The path of a `platform-globals/` file, with forward slashes. The directory
 * sits next to `src/` and `dist/`, so one relative URL serves both. A file
 * missing from the installed package, or a path a directive cannot quote,
 * leaves the copy in place.
 * @param {string} name
 * @returns {string | null}
 */
function platform_globals_file(name) {
	let file = files.get(name);
	if (file === undefined) {
		const path = fileURLToPath(new URL(`../platform-globals/${name}.d.cts`, import.meta.url));
		file = fs.existsSync(path) && !/["\r\n]/.test(path) ? path.replace(/\\/g, '/') : null;
		files.set(name, file);
	}
	return file;
}
