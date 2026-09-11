/** @import { Platform } from '../types/index' */

import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { findTsconfig, getExtendsChain } from 'get-tsconfig';
import { validate_platform } from './transform/platform.js';

/**
 * @typedef {object} BuildPlatformResolutionOptions
 * @property {string} [root]
 * @property {string} [tsconfig]
 * @property {unknown} [platform]
 * @property {string} [integration]
 */

/** @param {unknown} value @returns {string} */
function render_value(value) {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/**
 * Read one layer's own `tsrx.platform` declaration. `undefined` means this
 * layer does not declare the key, while every other invalid value throws.
 *
 * @param {{ path: string, config: unknown }} layer
 * @returns {Platform | undefined}
 */
function read_layer_platform(layer) {
	const config = layer.config;
	if (!config || typeof config !== 'object' || Array.isArray(config)) return undefined;
	if (!Object.prototype.hasOwnProperty.call(config, 'tsrx')) return undefined;

	const tsrx = /** @type {Record<string, unknown>} */ (config).tsrx;
	if (!tsrx || typeof tsrx !== 'object' || Array.isArray(tsrx)) {
		throw new TypeError(
			`Invalid TSRX declaration ${render_value(tsrx)} in ${layer.path}. Expected an object.`,
		);
	}
	if (!Object.prototype.hasOwnProperty.call(tsrx, 'platform')) return undefined;

	try {
		return validate_platform(/** @type {Record<string, unknown>} */ (tsrx).platform);
	} catch (error) {
		throw new TypeError(
			`${error instanceof Error ? error.message : String(error)} Declared in ${layer.path}.`,
			{ cause: error },
		);
	}
}

/**
 * @param {string} config_path
 * @param {unknown} reference
 * @returns {string}
 */
function resolve_reference_path(config_path, reference) {
	if (
		!reference ||
		typeof reference !== 'object' ||
		Array.isArray(reference) ||
		typeof (/** @type {Record<string, unknown>} */ (reference).path) !== 'string'
	) {
		throw new TypeError(
			`Invalid TypeScript project reference ${render_value(reference)} in ${config_path}. Expected an object with a string path.`,
		);
	}

	const declared_path = /** @type {{ path: string }} */ (reference).path;
	const candidate = path.resolve(path.dirname(config_path), declared_path);
	const candidates = [candidate];
	if (path.extname(candidate) === '') candidates.push(`${candidate}.json`);
	if (existsSync(candidate) && statSync(candidate).isDirectory()) {
		candidates.unshift(path.join(candidate, 'tsconfig.json'));
	}

	for (const file_name of candidates) {
		if (existsSync(file_name) && statSync(file_name).isFile()) return file_name;
	}

	throw new Error(
		`Unable to resolve TypeScript project reference ${JSON.stringify(declared_path)} from ${config_path}.`,
	);
}

/**
 * Resolve the effective platform of one config. If it does not declare or
 * inherit one, collect selections from its referenced projects recursively.
 * This covers solution-style Vite configs whose active app settings live in
 * `tsconfig.app.json`.
 *
 * @param {string} config_path
 * @param {string} integration
 * @param {Set<string>} visited
 * @returns {Set<Platform>}
 */
function collect_config_platforms(config_path, integration, visited) {
	const normalized_path = path.resolve(config_path);
	if (visited.has(normalized_path)) return new Set();
	visited.add(normalized_path);

	let layers;
	try {
		// get-tsconfig returns the root first, followed by extended configs in
		// precedence order. The first own platform declaration is therefore the
		// effective value, while a sibling `tsrx.compiler` key can still inherit.
		layers = getExtendsChain(normalized_path, { cache: new Map() });
	} catch (error) {
		throw new Error(
			`Unable to resolve TSRX platform from ${normalized_path} for ${integration}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}

	for (const layer of layers) {
		const declared = read_layer_platform(layer);
		if (declared !== undefined) return new Set([declared]);
	}

	const root_config = layers[0]?.config;
	if (!root_config || typeof root_config !== 'object' || Array.isArray(root_config)) {
		return new Set();
	}
	const references = /** @type {Record<string, unknown>} */ (root_config).references;
	if (references === undefined) return new Set();
	if (!Array.isArray(references)) {
		throw new TypeError(
			`Invalid TypeScript project references ${render_value(references)} in ${normalized_path}. Expected an array.`,
		);
	}

	const platforms = new Set();
	for (const reference of references) {
		const reference_path = resolve_reference_path(normalized_path, reference);
		for (const platform of collect_config_platforms(reference_path, integration, visited)) {
			platforms.add(platform);
		}
	}
	return platforms;
}

/**
 * Resolve `tsrx.platform` for a builder from the same nearest/configured
 * tsconfig and explicit `extends` graph used by the project. An explicit
 * builder option is retained as an escape hatch, but it must agree with a
 * tsconfig declaration when both exist.
 *
 * @param {BuildPlatformResolutionOptions} [options]
 * @returns {Platform | undefined}
 */
export function resolveBuildPlatform(options = {}) {
	const integration = options.integration ?? 'build integration';
	const explicit_platform = validate_platform(options.platform, `${integration} platform option`);
	const root = path.resolve(options.root ?? process.cwd());
	const config_path = options.tsconfig
		? path.resolve(root, options.tsconfig)
		: findTsconfig(root, { cache: new Map() });

	if (!config_path) return explicit_platform;

	const configured_platforms = collect_config_platforms(config_path, integration, new Set());
	if (configured_platforms.size > 1) {
		throw new Error(
			`Referenced TypeScript projects select multiple TSRX platforms for ${integration}: ${[...configured_platforms].map((platform) => JSON.stringify(platform)).join(', ')}. Select one project tsconfig explicitly or declare tsrx.platform in ${config_path}.`,
		);
	}
	const configured_platform = configured_platforms.values().next().value;

	if (
		explicit_platform !== undefined &&
		configured_platform !== undefined &&
		explicit_platform !== configured_platform
	) {
		throw new Error(
			`TSRX platform mismatch for ${integration}: tsconfig selects ${JSON.stringify(configured_platform)}, but the integration option selects ${JSON.stringify(explicit_platform)}. Remove the integration option or make the values match.`,
		);
	}

	return configured_platform ?? explicit_platform;
}
