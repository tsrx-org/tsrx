/**
 * Package lookups without TypeScript's module resolver: the runtime entry of a
 * TSRX compiler package, and the file a `tsconfig.json` `extends` entry names.
 * Both walk `node_modules` directories upwards from a starting directory and
 * read every `package.json` fresh, so they also serve as the retry path when
 * Node's own `require.resolve` keeps a negative lookup after a package is
 * installed.
 */

import path from 'node:path';
import { resolveExports } from 'resolve-pkg-maps';
import { NODE_CONFIG_HOST } from './config-host.js';

/** @typedef {import('./config-host.js').ConfigHost} ConfigHost */

/**
 * @typedef {object} ParsedSpecifier
 * @property {string} name `pkg` or `@scope/pkg`.
 * @property {string} subpath The part after the package name, without a leading slash; empty for the package root.
 */

/**
 * @param {string} specifier
 * @returns {ParsedSpecifier | undefined} `undefined` for relative, absolute or empty specifiers.
 */
export function parse_bare_specifier(specifier) {
	if (specifier === '' || specifier.startsWith('.') || path.isAbsolute(specifier)) {
		return undefined;
	}
	const segments = specifier.split('/');
	const name_segments = specifier.startsWith('@') ? 2 : 1;
	if (segments.length < name_segments || segments.slice(0, name_segments).some((s) => s === '')) {
		return undefined;
	}
	return {
		name: segments.slice(0, name_segments).join('/'),
		subpath: segments.slice(name_segments).join('/'),
	};
}

/**
 * A directory exists when the host says so, or (for hosts without
 * `directoryExists`) when it holds a `package.json`.
 * @param {ConfigHost} host
 * @param {string} directory_name
 * @returns {boolean}
 */
function is_directory(host, directory_name) {
	return host.directoryExists
		? host.directoryExists(directory_name)
		: host.fileExists(path.join(directory_name, 'package.json'));
}

/**
 * Read a package manifest through the host, never through Node's cached reader.
 * @param {ConfigHost} host
 * @param {string} package_dir
 * @returns {Record<string, unknown> | undefined}
 */
export function read_package_manifest(host, package_dir) {
	const text = host.readFile(path.join(package_dir, 'package.json'));
	if (text === undefined) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(text);
		return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Every `node_modules/<name>` directory that exists on the way up from `from_dir`.
 * @param {ConfigHost} host
 * @param {string} from_dir
 * @param {string} name
 * @returns {string[]}
 */
export function package_directories(host, from_dir, name) {
	/** @type {string[]} */
	const directories = [];
	let current = path.resolve(from_dir);
	while (true) {
		if (path.basename(current) !== 'node_modules') {
			const candidate = path.join(current, 'node_modules', name);
			if (is_directory(host, candidate)) {
				directories.push(candidate);
			}
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return directories;
		}
		current = parent;
	}
}

/**
 * Targets of `exports` for a subpath under the given conditions, in order;
 * empty when the package has no `exports` or does not export the subpath.
 * @param {Record<string, unknown> | undefined} manifest
 * @param {string} subpath
 * @param {readonly string[]} conditions
 * @returns {string[]}
 */
function exports_targets(manifest, subpath, conditions) {
	const exports = manifest?.exports;
	if (exports === undefined || exports === null) {
		return [];
	}
	try {
		return resolveExports(
			/** @type {import('resolve-pkg-maps').PathConditions} */ (exports),
			subpath,
			conditions,
		);
	} catch {
		return [];
	}
}

/**
 * The file a bare specifier loads at runtime: the package's `exports` (under
 * `conditions`), else its `main`, else `index.js`, with the extension probing
 * Node's CommonJS loader applies; a subpath is resolved the same way.
 * @param {string} specifier
 * @param {string} from_dir
 * @param {{ conditions?: readonly string[], host?: ConfigHost }} [options]
 * @returns {string | undefined}
 */
export function resolve_package_entry(specifier, from_dir, options = {}) {
	const parsed = parse_bare_specifier(specifier);
	if (!parsed) {
		return undefined;
	}
	const host = options.host ?? NODE_CONFIG_HOST;
	const conditions = options.conditions ?? ['node', 'require', 'default'];
	for (const package_dir of package_directories(host, from_dir, parsed.name)) {
		const manifest = read_package_manifest(host, package_dir);
		for (const target of exports_targets(manifest, parsed.subpath, conditions)) {
			const resolved = path.resolve(package_dir, target);
			if (host.fileExists(resolved)) {
				return resolved;
			}
		}
		if (manifest?.exports !== undefined && manifest.exports !== null) {
			// `exports` is authoritative: nothing else in the package is reachable.
			continue;
		}
		const main = typeof manifest?.main === 'string' ? manifest.main : undefined;
		const targets =
			parsed.subpath !== '' ? [parsed.subpath] : main !== undefined ? [main, 'index'] : ['index'];
		for (const target of targets) {
			const base = path.resolve(package_dir, target);
			for (const candidate of [
				base,
				`${base}.js`,
				`${base}.cjs`,
				`${base}.mjs`,
				`${base}.json`,
				path.join(base, 'index.js'),
			]) {
				if (host.fileExists(candidate)) {
					return candidate;
				}
			}
		}
	}
	return undefined;
}

/**
 * The config a package directory stands for: its `package.json` `tsconfig`
 * field (with `.json` appended when the file is missing without it, as
 * TypeScript's file loader does) or its `tsconfig.json`.
 * @param {ConfigHost} host
 * @param {string} directory
 * @param {Record<string, unknown> | undefined} manifest
 * @returns {string | undefined}
 */
function tsconfig_field_target(host, directory, manifest) {
	const field = typeof manifest?.tsconfig === 'string' ? manifest.tsconfig : 'tsconfig.json';
	let resolved = path.resolve(directory, field);
	if (!host.fileExists(resolved) && !resolved.endsWith('.json')) {
		resolved = `${resolved}.json`;
	}
	return host.fileExists(resolved) ? resolved : undefined;
}

/**
 * The JSON file a `tsconfig.json` `extends` entry names. The rules and their
 * order are those of get-tsconfig's `resolveExtendsPath` (MIT, privatenumber),
 * which are tested against `tsc`:
 *
 * 1. `..` means `../tsconfig.json`; an entry starting with `.` is relative to
 *    the config's directory; an absolute path is used as is. A missing path
 *    without a `.json` extension gets one appended.
 * 2. Otherwise the entry names a package (`name` or `@scope/name`, plus an
 *    optional subpath) found by walking `node_modules` upwards. A package with
 *    `exports` is resolved only through them (conditions `require`, `types`);
 *    an unexported subpath is a hard stop. Without `exports`, the package
 *    root's `tsconfig` field or its `tsconfig.json` is used; a subpath is tried
 *    with `.json` appended, as a `.json` file, then as a directory whose
 *    `package.json` `tsconfig` field or `tsconfig.json` is the target.
 *
 * @param {string} extends_value
 * @param {string} config_dir
 * @param {ConfigHost} [host]
 * @returns {{ path: string, candidate?: string } | { path?: undefined, candidate?: string }}
 *   `path` when found; `candidate` is the location TypeScript would have read
 *   for a path entry, whether or not it exists (so a watcher can wait for it).
 */
export function resolve_extends_target(extends_value, config_dir, host = NODE_CONFIG_HOST) {
	let file_path = extends_value === '..' ? path.join('..', 'tsconfig.json') : extends_value;
	if (file_path.startsWith('.')) {
		file_path = path.resolve(config_dir, file_path);
	}
	if (path.isAbsolute(file_path)) {
		if (host.fileExists(file_path)) {
			return { path: file_path, candidate: file_path };
		}
		const candidate =
			!is_directory(host, file_path) && !file_path.endsWith('.json')
				? `${file_path}.json`
				: file_path;
		return host.fileExists(candidate) ? { path: candidate, candidate } : { candidate };
	}
	const parsed = parse_bare_specifier(extends_value);
	if (!parsed) {
		return {};
	}
	for (const found_dir of package_directories(host, config_dir, parsed.name)) {
		const package_dir = host.realpath ? host.realpath(found_dir) : found_dir;
		const manifest = read_package_manifest(host, package_dir);
		if (manifest?.exports !== undefined && manifest.exports !== null) {
			const [target] = exports_targets(manifest, parsed.subpath, ['require', 'types']);
			if (target === undefined) {
				return {};
			}
			const resolved = path.resolve(package_dir, target);
			return host.fileExists(resolved) ? { path: resolved } : {};
		}
		if (parsed.subpath === '') {
			const resolved = tsconfig_field_target(host, package_dir, manifest);
			if (resolved !== undefined) {
				return { path: resolved };
			}
		}
		const full_path = path.join(package_dir, parsed.subpath);
		if (!full_path.endsWith('.json') && host.fileExists(`${full_path}.json`)) {
			return { path: `${full_path}.json` };
		}
		if (is_directory(host, full_path)) {
			const resolved = tsconfig_field_target(
				host,
				full_path,
				read_package_manifest(host, full_path),
			);
			if (resolved !== undefined) {
				return { path: resolved };
			}
		} else if (full_path.endsWith('.json') && host.fileExists(full_path)) {
			return { path: full_path };
		}
	}
	return {};
}
