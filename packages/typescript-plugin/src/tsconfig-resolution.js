import path from 'node:path';
import { parse_jsonc } from './jsonc.js';
import { resolve_extends_target } from './package-resolution.js';

/**
 * What the tooling needs from a file system to read tsconfig files: the
 * subset of TypeScript's `sys` that `config-host.js` also provides on
 * `node:fs`, so no TypeScript is needed to resolve a config chain.
 * @typedef {object} TsconfigHost
 * @property {(file_name: string) => boolean} fileExists
 * @property {(file_name: string) => string | undefined} readFile
 * @property {boolean | (() => boolean)} useCaseSensitiveFileNames
 * @property {(file_name: string) => Date | undefined} [getModifiedTime]
 */

/**
 * A problem reading or resolving a config file. `code` follows TypeScript's
 * numbering for the cases it has one for (5024 invalid `extends` entry,
 * 6053 file not found, 18000 circular `extends`), so callers that filter on
 * codes keep working on both paths.
 * @typedef {object} TsconfigDiagnostic
 * @property {number} code
 * @property {string} message
 * @property {string} [file] The config file the problem is in.
 */

/**
 * @typedef {object} TsconfigLayer
 * @property {string} path
 * @property {string} dir
 * @property {Record<string, unknown>} config
 * @property {string | undefined} raw_source
 * @property {TsconfigDiagnostic[]} parse_diagnostics
 */

/** @typedef {TsconfigLayer & { extends_values: unknown[] }} ParsedTsconfigLayer */

/**
 * @typedef {object} TsconfigExtendsFailure
 * @property {string} config_path
 * @property {unknown} extends_value
 * @property {string | undefined} resolved_path
 * @property {TsconfigDiagnostic[]} diagnostics
 */

/**
 * @typedef {object} ResolvedTsconfigLayers
 * @property {TsconfigLayer[]} layers
 * @property {string[]} dependencies
 * @property {TsconfigDiagnostic[]} diagnostics
 * @property {TsconfigExtendsFailure[]} extends_failures
 */

/**
 * @template TValue
 * @typedef {{state: 'absent'} | {state: 'found', value: TValue}} ConfigValueResult
 */

/** @typedef {{config_path: string, config_dir: string}} TsconfigValueOrigin */

export const INVALID_EXTENDS_DIAGNOSTIC_CODE = 5024;
export const FILE_NOT_FOUND_DIAGNOSTIC_CODE = 6053;
export const CIRCULARITY_DIAGNOSTIC_CODE = 18000;
const PARSE_ERROR_DIAGNOSTIC_CODE = 1005;

/**
 * Load a tsconfig and its explicit inheritance graph from lowest to highest
 * precedence. Parsed files are cached, but traversal intentionally does not
 * deduplicate layers because a shared base must be reapplied in every branch.
 * `extends` entries follow TypeScript's rules (see `resolve_extends_target`).
 *
 * @param {TsconfigHost} host
 * @param {string} config_file_name
 * @returns {ResolvedTsconfigLayers}
 */
export function load_tsconfig_layers(host, config_file_name) {
	/** @type {Map<string, ParsedTsconfigLayer>} */
	const parsed_file_cache = new Map();
	/** @type {TsconfigLayer[]} */
	const layers = [];
	/** @type {string[]} */
	const dependencies = [];
	const dependency_keys = new Set();
	/** @type {TsconfigDiagnostic[]} */
	const diagnostics = [];
	/** @type {TsconfigExtendsFailure[]} */
	const extends_failures = [];
	const diagnostic_keys = new Set();
	/** The chain of configs being visited, root first, for cycle reporting. */
	/** @type {string[]} */
	const active_stack = [];
	const active_keys = new Set();
	const use_case_sensitive_file_names =
		typeof host.useCaseSensitiveFileNames === 'function'
			? host.useCaseSensitiveFileNames()
			: host.useCaseSensitiveFileNames;

	/** @param {string} file_name */
	function normalize_path(file_name) {
		return path.normalize(path.resolve(file_name));
	}

	/** @param {string} file_name */
	function get_path_key(file_name) {
		const normalized_path = normalize_path(file_name);
		return use_case_sensitive_file_names ? normalized_path : normalized_path.toLowerCase();
	}

	/** @param {TsconfigDiagnostic[]} next_diagnostics */
	function add_diagnostics(next_diagnostics) {
		for (const diagnostic of next_diagnostics) {
			const key = `${diagnostic.code}\0${diagnostic.file ?? ''}\0${diagnostic.message}`;
			if (!diagnostic_keys.has(key)) {
				diagnostic_keys.add(key);
				diagnostics.push(diagnostic);
			}
		}
	}

	/** @param {string} file_name */
	function add_dependency(file_name) {
		const normalized_path = normalize_path(file_name);
		const key = get_path_key(normalized_path);
		if (!dependency_keys.has(key)) {
			dependency_keys.add(key);
			dependencies.push(normalized_path);
		}
	}

	/** @param {string} file_name */
	function parse_file(file_name) {
		const normalized_path = normalize_path(file_name);
		const key = get_path_key(normalized_path);
		const cached = parsed_file_cache.get(key);
		if (cached) {
			return cached;
		}

		const raw_source = host.readFile(normalized_path);
		/** @type {TsconfigDiagnostic[]} */
		const parse_diagnostics = [];
		/** @type {Record<string, unknown>} */
		let config = {};
		if (raw_source !== undefined) {
			const parsed = parse_jsonc(raw_source);
			if (parsed.error) {
				parse_diagnostics.push({
					code: PARSE_ERROR_DIAGNOSTIC_CODE,
					message: `Failed to parse ${normalized_path}: ${parsed.error.message}`,
					file: normalized_path,
				});
			} else if (
				parsed.value !== null &&
				typeof parsed.value === 'object' &&
				!Array.isArray(parsed.value)
			) {
				config = /** @type {Record<string, unknown>} */ (parsed.value);
			} else {
				parse_diagnostics.push({
					code: PARSE_ERROR_DIAGNOSTIC_CODE,
					message: `The root value of ${normalized_path} must be an object.`,
					file: normalized_path,
				});
			}
		}
		const extends_value = config.extends;
		const extends_values = Array.isArray(extends_value)
			? extends_value
			: extends_value !== undefined
				? [extends_value]
				: [];
		const parsed = {
			path: normalized_path,
			dir: path.dirname(normalized_path),
			config,
			raw_source,
			parse_diagnostics,
			extends_values,
		};
		parsed_file_cache.set(key, parsed);
		add_diagnostics(parse_diagnostics);
		return parsed;
	}

	/**
	 * Resolve one immediate extends entry. The conventional JSON candidate of an
	 * unresolved relative entry is still recorded as a dependency so creating it
	 * later invalidates caches and language-server projects.
	 * @param {ParsedTsconfigLayer} parsed
	 * @param {unknown} extends_value
	 */
	function resolve_extends_path(parsed, extends_value) {
		if (typeof extends_value !== 'string') {
			const diagnostic = {
				code: INVALID_EXTENDS_DIAGNOSTIC_CODE,
				message: `Compiler option 'extends' requires a value of type string.`,
				file: parsed.path,
			};
			add_diagnostics([diagnostic]);
			extends_failures.push({
				config_path: parsed.path,
				extends_value,
				resolved_path: undefined,
				diagnostics: [diagnostic],
			});
			return undefined;
		}
		const target = resolve_extends_target(extends_value, parsed.dir, host);
		const dependency_path = target.path ?? target.candidate;
		if (dependency_path !== undefined) {
			add_dependency(dependency_path);
		}
		if (target.path === undefined) {
			const diagnostic = {
				code: FILE_NOT_FOUND_DIAGNOSTIC_CODE,
				message: `File '${target.candidate ?? extends_value}' not found.`,
				file: parsed.path,
			};
			add_diagnostics([diagnostic]);
			extends_failures.push({
				config_path: parsed.path,
				extends_value,
				resolved_path: dependency_path,
				diagnostics: [diagnostic],
			});
			return undefined;
		}
		if (active_keys.has(get_path_key(target.path))) {
			const chain = [...active_stack, normalize_path(target.path)];
			const diagnostic = {
				code: CIRCULARITY_DIAGNOSTIC_CODE,
				message: `Circularity detected while resolving configuration: ${chain.join(' -> ')}`,
				file: parsed.path,
			};
			add_diagnostics([diagnostic]);
			extends_failures.push({
				config_path: parsed.path,
				extends_value,
				resolved_path: dependency_path,
				diagnostics: [diagnostic],
			});
			return undefined;
		}
		return target.path;
	}

	/** @param {string} file_name */
	function visit(file_name) {
		const normalized_path = normalize_path(file_name);
		const key = get_path_key(normalized_path);
		active_keys.add(key);
		active_stack.push(normalized_path);
		add_dependency(normalized_path);
		const parsed = parse_file(normalized_path);
		for (const extends_value of parsed.extends_values) {
			const extended_path = resolve_extends_path(parsed, extends_value);
			if (extended_path !== undefined) {
				visit(extended_path);
			}
		}
		layers.push({
			path: parsed.path,
			dir: parsed.dir,
			config: parsed.config,
			raw_source: parsed.raw_source,
			parse_diagnostics: parsed.parse_diagnostics,
		});
		active_stack.pop();
		active_keys.delete(key);
	}

	visit(config_file_name);
	return { layers, dependencies, diagnostics, extends_failures };
}

/**
 * Read a nested config value only when every segment is an own property.
 *
 * @param {unknown} config
 * @param {readonly PropertyKey[]} path_parts
 * @returns {ConfigValueResult<unknown>}
 */
export function get_own_config_value(config, path_parts) {
	let current = config;
	for (const path_part of path_parts) {
		if (
			current === null ||
			(typeof current !== 'object' && typeof current !== 'function') ||
			!Object.prototype.hasOwnProperty.call(current, path_part)
		) {
			return { state: 'absent' };
		}
		current = /** @type {Record<PropertyKey, unknown>} */ (current)[path_part];
	}
	return { state: 'found', value: current };
}

/**
 * Resolve a caller-defined value across layers. The last result whose state is
 * not absent wins and is annotated with the config that declared it.
 *
 * @template {{state: string}} TResult
 * @param {readonly TsconfigLayer[]} layers
 * @param {(layer: TsconfigLayer) => TResult} read_layer
 * @returns {{state: 'absent'} | (TResult & TsconfigValueOrigin)}
 */
export function resolve_inherited_config_value(layers, read_layer) {
	/** @type {{state: 'absent'} | (TResult & TsconfigValueOrigin)} */
	let resolved = { state: 'absent' };
	for (const layer of layers) {
		const value = read_layer(layer);
		if (value.state !== 'absent') {
			resolved = {
				...value,
				config_path: layer.path,
				config_dir: layer.dir,
			};
		}
	}
	return resolved;
}
