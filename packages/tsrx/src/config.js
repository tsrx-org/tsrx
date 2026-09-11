/** @import { Platform } from '../types/index' */

import path from 'node:path';
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

	let layers;
	try {
		// get-tsconfig returns the root first, followed by extended configs in
		// precedence order. The first own platform declaration is therefore the
		// effective value, while a sibling `tsrx.compiler` key can still inherit.
		layers = getExtendsChain(config_path, { cache: new Map() });
	} catch (error) {
		throw new Error(
			`Unable to resolve TSRX platform from ${config_path} for ${integration}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}

	/** @type {Platform | undefined} */
	let configured_platform;
	for (const layer of layers) {
		const declared = read_layer_platform(layer);
		if (declared !== undefined) {
			configured_platform = declared;
			break;
		}
	}

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
