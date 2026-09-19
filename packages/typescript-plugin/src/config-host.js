/**
 * The file-system host the TSRX tooling reads `tsconfig.json` files and
 * package manifests through when no TypeScript `sys` is supplied. It covers
 * the subset of `ts.sys` that `tsconfig-resolution.js` and
 * `consumer-compiler.js` use, on `node:fs`, so the native TypeScript 7 path
 * (whose `typescript` package has no JavaScript API) needs no TypeScript at
 * all. `ts.sys` still satisfies the same interface for the classic path.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {object} ConfigHost
 * @property {(file_name: string) => boolean} fileExists
 * @property {(file_name: string) => string | undefined} readFile
 * @property {(directory_name: string) => boolean} [directoryExists]
 * @property {boolean | (() => boolean)} useCaseSensitiveFileNames
 * @property {(file_name: string) => Date | undefined} [getModifiedTime]
 * @property {(path_name: string) => string} [realpath]
 */

/**
 * Whether the file system distinguishes letter case, probed the way
 * TypeScript's `sys` does: this module's own path with its case swapped exists
 * only on a case-insensitive file system.
 * @returns {boolean}
 */
function detect_case_sensitive_file_names() {
	const own_path = fileURLToPath(import.meta.url);
	const swapped = own_path.replace(/[a-zA-Z]/g, (letter) =>
		letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase(),
	);
	if (swapped === own_path) {
		return true;
	}
	return !fs.existsSync(swapped);
}

/** @type {boolean | undefined} */
let case_sensitive_file_names;

/** @returns {boolean} */
export function use_case_sensitive_file_names() {
	case_sensitive_file_names ??= detect_case_sensitive_file_names();
	return case_sensitive_file_names;
}

/**
 * @param {string} file_name
 * @returns {fs.Stats | undefined}
 */
function stat(file_name) {
	try {
		return fs.statSync(file_name, { throwIfNoEntry: false });
	} catch {
		return undefined;
	}
}

/** @returns {ConfigHost} */
export function create_config_host() {
	return {
		fileExists: (file_name) => stat(file_name)?.isFile() === true,
		directoryExists: (directory_name) => stat(directory_name)?.isDirectory() === true,
		readFile: (file_name) => {
			try {
				return fs.readFileSync(file_name, 'utf8');
			} catch {
				return undefined;
			}
		},
		useCaseSensitiveFileNames: use_case_sensitive_file_names,
		getModifiedTime: (file_name) => stat(file_name)?.mtime,
		realpath: (path_name) => {
			try {
				return fs.realpathSync(path_name);
			} catch {
				return path_name;
			}
		},
	};
}

/** The shared default host; one instance so per-host caches are reused. */
export const NODE_CONFIG_HOST = create_config_host();
