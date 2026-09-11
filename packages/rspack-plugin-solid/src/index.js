/** @import { Compiler, RspackPluginInstance } from '@rspack/core' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/solid' */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlatformDefinitions, mergePlatformDefinitions, validatePlatform } from '@tsrx/core';
import { resolveBuildPlatform } from '@tsrx/core/config';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JS_LOADER = path.join(__dirname, 'js-loader.js');
const CSS_LOADER = path.join(__dirname, 'css-loader.js');
const BABEL_LOADER = require.resolve('babel-loader');
const BABEL_PRESET_SOLID = require.resolve('babel-preset-solid');
const BABEL_PRESET_TYPESCRIPT = require.resolve('@babel/preset-typescript');
const SOLID_REFRESH_BABEL = require.resolve('solid-refresh/babel');

const TSRX_EXTENSION_PATTERN = /\.tsrx$/;
const CSS_QUERY_PATTERN = /tsrx-css/;

/** @param {any} plugin @returns {Record<string, unknown> | undefined} */
function get_define_plugin_definitions(plugin) {
	if (plugin == null || typeof plugin !== 'object') return undefined;
	if ((plugin.name ?? plugin.constructor?.name) !== 'DefinePlugin') return undefined;
	if (plugin.definitions && typeof plugin.definitions === 'object') return plugin.definitions;
	if (Array.isArray(plugin._args) && plugin._args[0] && typeof plugin._args[0] === 'object') {
		return plugin._args[0];
	}
	if (plugin.options && typeof plugin.options === 'object' && !Array.isArray(plugin.options)) {
		return plugin.options;
	}
	return undefined;
}

/** @param {Compiler} compiler @param {Platform | undefined} platform */
function apply_platform_definitions(compiler, platform) {
	if (platform === undefined) return;
	const compiler_with_definitions = /** @type {any} */ (compiler);
	for (const plugin of compiler_with_definitions.options.plugins ?? []) {
		const definitions = get_define_plugin_definitions(plugin);
		if (definitions) {
			mergePlatformDefinitions(definitions, platform, { integration: 'Rspack' });
		}
	}
	const DefinePlugin = compiler_with_definitions.webpack?.DefinePlugin;
	if (typeof DefinePlugin !== 'function') {
		throw new Error('Rspack compiler does not expose DefinePlugin for TSRX platform flags.');
	}
	new DefinePlugin(createPlatformDefinitions(platform)).apply(compiler);
}

/**
 * Rspack plugin for `.tsrx` files that compiles them via `@tsrx/solid` and
 * then delegates the final TSX + JSX transform to `babel-loader` with Solid's
 * Babel preset. Per-component `<style>` blocks are re-imported via a sibling
 * `?tsrx-css&lang.css` query and handled by rspack's built-in CSS module type.
 *
 * @implements {RspackPluginInstance}
 */
export class TsrxSolidRspackPlugin {
	/**
	 * @param {{ hot?: boolean, runtimeImports?: RuntimeImportMode, platform?: Platform }} [options]
	 */
	constructor(options = {}) {
		this.explicit_platform = validatePlatform(options.platform);
		this.options = {
			hot: options.hot,
			runtimeImports: options.runtimeImports ?? 'compiler',
			platform: this.explicit_platform,
		};
	}

	/**
	 * @param {Compiler} compiler
	 * @returns {void}
	 */
	apply(compiler) {
		const compiler_options = /** @type {any} */ (compiler).options;
		const resolve_tsconfig = compiler_options.resolve?.tsConfig;
		this.options.platform = resolveBuildPlatform({
			root: /** @type {any} */ (compiler).context ?? process.cwd(),
			tsconfig:
				typeof resolve_tsconfig === 'string' ? resolve_tsconfig : resolve_tsconfig?.configFile,
			platform: this.explicit_platform,
			integration: '@tsrx/rspack-plugin-solid',
		});
		const hot = this.options.hot ?? compiler.options.mode !== 'production';
		apply_platform_definitions(compiler, this.options.platform);

		const resolve = compiler.options.resolve;
		if (resolve.extensions && !resolve.extensions.includes('.tsrx')) {
			resolve.extensions.push('.tsrx');
		}

		if (!compiler.options.experiments) {
			compiler.options.experiments = {};
		}
		const experiments =
			/** @type {typeof compiler.options.experiments & { deferImport?: boolean }} */ (
				compiler.options.experiments
			);
		if (experiments.css === undefined) {
			experiments.css = true;
		}
		if (experiments.deferImport === undefined) {
			experiments.deferImport = true;
		}

		compiler.options.module.rules.unshift(
			{
				test: TSRX_EXTENSION_PATTERN,
				resourceQuery: { not: CSS_QUERY_PATTERN },
				use: [
					{
						loader: BABEL_LOADER,
						options: {
							babelrc: false,
							configFile: false,
							sourceMaps: true,
							parserOpts: {
								plugins: ['deferredImportEvaluation'],
							},
							plugins: hot ? [SOLID_REFRESH_BABEL] : [],
							presets: [
								[BABEL_PRESET_SOLID, {}],
								[
									BABEL_PRESET_TYPESCRIPT,
									{
										allExtensions: true,
										isTSX: true,
									},
								],
							],
						},
					},
					{
						loader: JS_LOADER,
						options: {
							runtimeImports: this.options.runtimeImports,
							platform: this.options.platform,
						},
					},
				],
			},
			{
				test: TSRX_EXTENSION_PATTERN,
				resourceQuery: CSS_QUERY_PATTERN,
				type: 'css/auto',
				use: [
					{
						loader: CSS_LOADER,
						options: {
							runtimeImports: this.options.runtimeImports,
							platform: this.options.platform,
						},
					},
				],
			},
		);
	}
}

export default TsrxSolidRspackPlugin;
