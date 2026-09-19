/**
 * `tsrx-tsc` on TypeScript 7. The `typescript@7` package is a launcher for the
 * native compiler without a JavaScript API, so Volar cannot host it; instead
 * this module runs the platform binary itself with `--runExternalCode`, which
 * lets TypeScript start `@tsrx/content-mapper` for the `.tsrx` files the
 * project's `tsconfig.json` declares under `contentMappers`. The mapper is
 * never enabled on the command line by TypeScript itself (TS100024 without the
 * flag); `tsrx-tsc` turns it on because running it is already the decision to
 * execute the project's TSRX compiler, exactly as the classic path does
 * in-process.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { NODE_CONFIG_HOST } from './config-host.js';
import {
	get_own_config_value,
	load_tsconfig_layers,
	resolve_inherited_config_value,
} from './tsconfig-resolution.js';
import { TYPESCRIPT_7_SUPPORT_NOTE } from './typescript-version.js';

export const RUN_EXTERNAL_CODE_FLAG = '--runExternalCode';
export const CONTENT_MAPPER_PACKAGE = '@tsrx/content-mapper';

/**
 * The platform package the `typescript@7` launcher resolves its binary from:
 * `@typescript/typescript-<os>-<arch>`, listed as an optional dependency of the
 * launcher so package managers install only the matching one.
 * @returns {string}
 */
export function native_platform_package_name() {
	return `@typescript/typescript-${process.platform}-${process.arch}`;
}

/**
 * Locate the native `tsc` binary the way the launcher's `lib/getExePath.js`
 * does, resolving the platform package from the launcher's own location.
 * @param {string} typescript_package_json_path The resolved `typescript/package.json`.
 * @returns {string}
 */
export function resolve_native_tsc_binary(typescript_package_json_path) {
	const platform_package = native_platform_package_name();
	const require = createRequire(typescript_package_json_path);
	/** @type {string} */
	let platform_package_json;
	try {
		platform_package_json = require.resolve(`${platform_package}/package.json`);
	} catch {
		throw new Error(
			`tsrx-tsc could not resolve ${platform_package} next to ${typescript_package_json_path}. Either this platform is unsupported by TypeScript 7, or the package is missing on disk (the typescript package lists it as an optional dependency; reinstall with optional dependencies enabled).`,
		);
	}
	const binary = path.join(
		path.dirname(platform_package_json),
		'lib',
		process.platform === 'win32' ? 'tsc.exe' : 'tsc',
	);
	if (!fs.existsSync(binary)) {
		throw new Error(`tsrx-tsc found ${platform_package} but not its compiler at ${binary}.`);
	}
	return binary;
}

/**
 * The argument list for native `tsc`: the user's arguments with
 * `--runExternalCode` added once. `--build` must stay the first argument, so
 * the flag follows the arguments in build mode and leads otherwise.
 * @param {readonly string[]} args
 * @returns {string[]}
 */
export function native_tsc_arguments(args) {
	if (args.includes(RUN_EXTERNAL_CODE_FLAG)) {
		return [...args];
	}
	return is_build_mode(args)
		? [...args, RUN_EXTERNAL_CODE_FLAG]
		: [RUN_EXTERNAL_CODE_FLAG, ...args];
}

/** @param {readonly string[]} args */
function is_build_mode(args) {
	return args[0] === '--build' || args[0] === '-b';
}

const SOURCE_FILE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|tsrx|d\.[cm]?ts)$/i;

/** Flags after which `tsc` prints or writes something and never reads a project. */
const INFORMATIONAL_FLAGS = new Set(['--version', '-v', '--help', '-h', '--init']);

/**
 * The value of a `-p`/`--project` token, including the `--project=file` and
 * `-p=file` form TypeScript's parser accepts.
 * @param {string} arg
 * @param {string | undefined} next
 * @returns {{ value: string | undefined } | undefined}
 */
function read_project_option(arg, next) {
	if (arg === '-p' || arg === '--project') {
		return { value: next };
	}
	if (arg.startsWith('--project=')) {
		return { value: arg.slice('--project='.length) };
	}
	if (arg.startsWith('-p=')) {
		return { value: arg.slice(3) };
	}
	return undefined;
}

/**
 * The `tsconfig.json` files a `tsc` invocation reads, mirroring how the
 * compiler picks them: `-p`/`--project` (a file, or a directory holding
 * `tsconfig.json`), including `--project=file` / `-p=file`; otherwise
 * `tsconfig.json` in the working directory unless source files are passed,
 * which makes `tsc` ignore every tsconfig; in build mode, each positional
 * argument that is a directory or a config file, or the working directory
 * when there is none. Paths that do not exist are left out, so `tsc` reports
 * them itself, and `--version`, `--help` and `--init` read none.
 * @param {readonly string[]} args
 * @param {string} cwd
 * @returns {string[]}
 */
export function project_config_paths(args, cwd) {
	/** @type {string[]} */
	const configs = [];
	if (args.some((arg) => INFORMATIONAL_FLAGS.has(arg))) {
		return configs;
	}
	/** @param {string} candidate A file or a directory. */
	function add(candidate) {
		const resolved = existing_config_path(path.resolve(cwd, candidate));
		if (resolved !== undefined) configs.push(resolved);
	}
	if (is_build_mode(args)) {
		for (const arg of args.slice(1)) {
			if (!arg.startsWith('-') && !SOURCE_FILE_EXTENSIONS.test(arg)) add(arg);
		}
		if (configs.length === 0) add('.');
		return configs;
	}
	for (let index = 0; index < args.length; index++) {
		const project = read_project_option(args[index], args[index + 1]);
		if (project) {
			if (project.value !== undefined) add(project.value);
			return configs;
		}
	}
	if (args.some((arg) => !arg.startsWith('-') && SOURCE_FILE_EXTENSIONS.test(arg))) {
		return configs;
	}
	add('.');
	return configs;
}

/**
 * @param {string} candidate Absolute path to a file or a directory.
 * @param {import('./config-host.js').ConfigHost} [host]
 * @returns {string | undefined}
 */
function existing_config_path(candidate, host) {
	const nested = path.join(candidate, 'tsconfig.json');
	if (host?.directoryExists?.(candidate) === true) {
		return host.fileExists(nested) ? nested : undefined;
	}
	if (host?.fileExists(candidate)) {
		return candidate;
	}
	if (host?.directoryExists === undefined) {
		const stats = fs.statSync(candidate, { throwIfNoEntry: false });
		if (stats?.isDirectory()) {
			return fs.existsSync(nested) ? nested : undefined;
		}
		if (stats?.isFile()) {
			return candidate;
		}
	}
	return undefined;
}

/**
 * @param {import('./tsconfig-resolution.js').ResolvedTsconfigLayers} loaded
 * @returns {boolean}
 */
function tsconfig_load_failed(loaded) {
	return (
		loaded.layers.length === 0 ||
		loaded.diagnostics.length > 0 ||
		loaded.extends_failures.length > 0 ||
		loaded.layers.some((layer) => layer.raw_source === undefined)
	);
}

/**
 * Whether a project compiles its own files, as opposed to a solution-style
 * `files: []` aggregator that only lists `references`.
 * @param {import('./tsconfig-resolution.js').TsconfigLayer[]} layers
 * @returns {boolean}
 */
function compiles_own_sources(layers) {
	const files = resolve_inherited_config_value(layers, (layer) =>
		get_own_config_value(layer.config, ['files']),
	);
	const include = resolve_inherited_config_value(layers, (layer) =>
		get_own_config_value(layer.config, ['include']),
	);
	const empty_files =
		files.state === 'found' && Array.isArray(files.value) && files.value.length === 0;
	const empty_include =
		include.state === 'found' && Array.isArray(include.value) && include.value.length === 0;
	if (empty_files && (include.state === 'absent' || empty_include)) {
		return false;
	}
	if (files.state === 'absent' && empty_include) {
		return false;
	}
	return true;
}

/**
 * @param {string} config_path
 * @param {import('./config-host.js').ConfigHost} host
 * @returns {string[]}
 */
function referenced_config_paths(config_path, host) {
	const { layers } = load_tsconfig_layers(host, config_path);
	const root = layers[layers.length - 1];
	if (root === undefined) {
		return [];
	}
	const refs = get_own_config_value(root.config, ['references']);
	if (refs.state !== 'found' || !Array.isArray(refs.value)) {
		return [];
	}
	/** @type {string[]} */
	const configs = [];
	for (const entry of refs.value) {
		if (entry === null || typeof entry !== 'object') {
			continue;
		}
		const ref_path = /** @type {{ path?: unknown }} */ (entry).path;
		if (typeof ref_path !== 'string') {
			continue;
		}
		const resolved = existing_config_path(path.resolve(root.dir, ref_path), host);
		if (resolved !== undefined) {
			configs.push(resolved);
		}
	}
	return configs;
}

/**
 * Command-line configs plus, in `--build` mode, every project in their
 * `references` graph.
 * @param {readonly string[]} args
 * @param {string} cwd
 * @param {import('./config-host.js').ConfigHost} host
 * @returns {string[]}
 */
function mapper_guard_config_paths(args, cwd, host) {
	const roots = project_config_paths(args, cwd);
	if (!is_build_mode(args)) {
		return roots;
	}
	/** @type {string[]} */
	const configs = [];
	const seen = new Set();
	/** @param {string} config_path */
	function visit(config_path) {
		const key = path.resolve(config_path);
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		configs.push(config_path);
		for (const referenced of referenced_config_paths(config_path, host)) {
			visit(referenced);
		}
	}
	for (const root of roots) {
		visit(root);
	}
	return configs;
}

/**
 * Whether a tsconfig, through its `extends` chain, declares a content mapper
 * for `.tsrx` files. Without one, native `tsc` never spawns the mapper: `.tsrx`
 * files are silently not checked and their importers report TS2307, which a
 * type-check command must not let pass. Unreadable configs count as declared
 * so that `tsc` reports the real problem.
 * @param {string} config_path
 * @param {import('./config-host.js').ConfigHost} [host]
 * @returns {boolean}
 */
export function declares_tsrx_content_mapper(config_path, host = NODE_CONFIG_HOST) {
	const loaded = load_tsconfig_layers(host, config_path);
	if (tsconfig_load_failed(loaded)) {
		return true;
	}
	const mappers = resolve_inherited_config_value(loaded.layers, (layer) =>
		get_own_config_value(layer.config, ['contentMappers']),
	);
	if (mappers.state === 'absent') {
		return false;
	}
	if (!Array.isArray(mappers.value)) {
		// Let TypeScript report the malformed entry.
		return true;
	}
	return mappers.value.some(
		(entry) =>
			entry !== null &&
			typeof entry === 'object' &&
			Array.isArray(/** @type {{ extensions?: unknown }} */ (entry).extensions) &&
			/** @type {{ extensions: unknown[] }} */ (entry).extensions.some(
				(extension) => typeof extension === 'string' && extension.toLowerCase() === '.tsrx',
			),
	);
}

/**
 * @param {string} config_path
 * @returns {string}
 */
export function missing_content_mapper_message(config_path) {
	return `tsrx-tsc: ${config_path} declares no content mapper for .tsrx files, so TypeScript 7 would not check them. Install ${CONTENT_MAPPER_PACKAGE} next to the project and add "contentMappers": [{ "package": "${CONTENT_MAPPER_PACKAGE}", "extensions": [".tsrx"] }] at the top level of tsconfig.json (TypeScript 5 and 6 ignore the key, so the same file keeps working with the classic path). ${TYPESCRIPT_7_SUPPORT_NOTE}`;
}

/**
 * Run native `tsc --runExternalCode` for a `tsrx-tsc` invocation and return the
 * exit code. Output streams through untouched.
 * @param {{
 * 	typescript_package_json_path: string,
 * 	args: readonly string[],
 * 	cwd?: string,
 * 	env?: NodeJS.ProcessEnv,
 * 	host?: import('./config-host.js').ConfigHost,
 * 	stderr?: { write: (chunk: string) => unknown },
 * }} options
 * @returns {number}
 */
export function run_native_tsc(options) {
	const cwd = options.cwd ?? process.cwd();
	const stderr = options.stderr ?? process.stderr;
	/** @type {string} */
	let binary;
	try {
		binary = resolve_native_tsc_binary(options.typescript_package_json_path);
	} catch (error) {
		stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
	const host = options.host ?? NODE_CONFIG_HOST;
	const build_mode = is_build_mode(options.args);
	for (const config_path of mapper_guard_config_paths(options.args, cwd, host)) {
		if (build_mode && !compiles_own_sources(load_tsconfig_layers(host, config_path).layers)) {
			continue;
		}
		if (!declares_tsrx_content_mapper(config_path, host)) {
			stderr.write(`${missing_content_mapper_message(config_path)}\n`);
			return 1;
		}
	}
	const result = spawnSync(binary, native_tsc_arguments(options.args), {
		cwd,
		env: options.env ?? process.env,
		stdio: 'inherit',
		windowsHide: true,
	});
	if (result.error) {
		stderr.write(`tsrx-tsc could not start ${binary}: ${result.error.message}\n`);
		return 1;
	}
	if (result.status === null) {
		stderr.write(`tsrx-tsc: ${binary} was terminated by signal ${result.signal}.\n`);
		return 1;
	}
	return result.status;
}
