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
 * The `tsconfig.json` files whose sources a `tsc` invocation compiles,
 * mirroring how the compiler picks them: `-p`/`--project` (a file, or a
 * directory holding `tsconfig.json`; TypeScript accepts no `--project=path`
 * form); otherwise `tsconfig.json` in the working directory unless source
 * files are passed, which makes `tsc` ignore every tsconfig. In build mode the
 * roots are each positional argument that is a directory or a config file, or
 * the working directory when there is none, and the result is every project
 * in their `references` graph that compiles something: a solution-style config
 * (`files: []`) only points at other projects and is left out. Paths that do
 * not exist are left out, so `tsc` reports them itself, and `--version`,
 * `--help` and `--init` read none.
 * @param {readonly string[]} args
 * @param {string} cwd
 * @param {import('./config-host.js').ConfigHost} [host]
 * @returns {string[]}
 */
export function project_config_paths(args, cwd, host = NODE_CONFIG_HOST) {
	/** @type {string[]} */
	const configs = [];
	if (args.some((arg) => INFORMATIONAL_FLAGS.has(arg))) {
		return configs;
	}
	/** @param {string} candidate A file or a directory. */
	function add(candidate) {
		const resolved = path.resolve(cwd, candidate);
		const stats = fs.statSync(resolved, { throwIfNoEntry: false });
		if (stats?.isDirectory()) {
			const nested = path.join(resolved, 'tsconfig.json');
			if (fs.existsSync(nested)) configs.push(nested);
		} else if (stats?.isFile()) {
			configs.push(resolved);
		}
	}
	if (is_build_mode(args)) {
		for (const arg of args.slice(1)) {
			if (!arg.startsWith('-') && !SOURCE_FILE_EXTENSIONS.test(arg)) add(arg);
		}
		if (configs.length === 0) add('.');
		return build_graph_projects(configs, host);
	}
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === '-p' || arg === '--project') {
			if (args[index + 1] !== undefined) add(args[index + 1]);
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
 * Walk the `references` graph of the build roots, in build order, and return
 * the projects that compile sources. `references` is the one top-level key
 * TypeScript does not inherit through `extends`, so each config's own entry is
 * read; `files` and `include` are inherited, and a config whose resolved
 * `files` is empty with no `include` is a solution that compiles nothing
 * (TypeScript unions the two lists). Configs that cannot be read are kept for
 * `tsc` to report.
 * @param {readonly string[]} roots
 * @param {import('./config-host.js').ConfigHost} host
 * @returns {string[]}
 */
function build_graph_projects(roots, host) {
	/** @type {string[]} */
	const projects = [];
	const seen = new Set();
	/** @param {string} config_path */
	function visit(config_path) {
		if (seen.has(config_path)) return;
		seen.add(config_path);
		const { layers, diagnostics, extends_failures } = load_tsconfig_layers(host, config_path);
		const own = layers[layers.length - 1];
		const references = get_own_config_value(own.config, ['references']);
		if (references.state === 'found' && Array.isArray(references.value)) {
			for (const reference of references.value) {
				const target = get_own_config_value(reference, ['path']);
				if (target.state !== 'found' || typeof target.value !== 'string') continue;
				const resolved = path.resolve(own.dir, target.value);
				const stats = fs.statSync(resolved, { throwIfNoEntry: false });
				if (stats?.isDirectory()) {
					const nested = path.join(resolved, 'tsconfig.json');
					if (fs.existsSync(nested)) visit(nested);
				} else if (stats?.isFile()) {
					visit(resolved);
				}
			}
		}
		// TypeScript unions `files` and `include`, so a solution is a config
		// whose `files` is empty and that has no `include` to add anything.
		/** @param {'files' | 'include'} key */
		const is_empty_list = (key) => {
			const value = resolve_inherited_config_value(layers, (layer) =>
				get_own_config_value(layer.config, [key]),
			);
			return value.state === 'found' && Array.isArray(value.value) && value.value.length === 0;
		};
		const include = resolve_inherited_config_value(layers, (layer) =>
			get_own_config_value(layer.config, ['include']),
		);
		const is_solution =
			diagnostics.length === 0 &&
			extends_failures.length === 0 &&
			is_empty_list('files') &&
			(include.state === 'absent' || is_empty_list('include'));
		if (!is_solution) projects.push(config_path);
	}
	for (const root of roots) visit(root);
	return projects;
}

/**
 * Whether a tsconfig, through its `extends` chain, declares a content mapper
 * for `.tsrx` files. Without one, native `tsc` never spawns the mapper: `.tsrx`
 * files are silently not checked and their importers report TS2307, which a
 * type-check command must not let pass. A config that does not parse, or whose
 * `extends` chain does not resolve, counts as declared so that `tsc` reports
 * the real problem instead of this guard.
 * @param {string} config_path
 * @param {import('./config-host.js').ConfigHost} [host]
 * @returns {boolean}
 */
export function declares_tsrx_content_mapper(config_path, host = NODE_CONFIG_HOST) {
	const { layers, diagnostics, extends_failures } = load_tsconfig_layers(host, config_path);
	if (diagnostics.length > 0 || extends_failures.length > 0) {
		return true;
	}
	const mappers = resolve_inherited_config_value(layers, (layer) =>
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
	for (const config_path of project_config_paths(options.args, cwd, options.host)) {
		if (!declares_tsrx_content_mapper(config_path, options.host)) {
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
