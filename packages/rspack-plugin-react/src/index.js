/** @import { Compiler, RspackPluginInstance } from '@rspack/core' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/react' */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlatformDefinitions, mergePlatformDefinitions, validatePlatform } from '@tsrx/core';
import { resolveBuildPlatform } from '@tsrx/core/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JS_LOADER = path.join(__dirname, 'js-loader.js');
const CSS_LOADER = path.join(__dirname, 'css-loader.js');

const TSRX_EXTENSION_PATTERN = /\.tsrx$/;
const CSS_QUERY_PATTERN = /tsrx-css/;

/** @param {Compiler} compiler @param {Platform | undefined} platform */
function apply_platform_definitions(compiler, platform) {
	if (platform === undefined) return;

	const compiler_with_definitions = /** @type {any} */ (compiler);
	for (const plugin of compiler_with_definitions.options.plugins ?? []) {
		if (plugin?.name !== 'DefinePlugin' || !Array.isArray(plugin._args)) continue;
		const definitions = plugin._args[0];
		if (definitions && typeof definitions === 'object') {
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
 * Rspack plugin for `.tsrx` files that compiles them via `@tsrx/react` and
 * then delegates the final JSX transform to rspack's `builtin:swc-loader` so
 * the output calls React's automatic `jsx-runtime`. Per-component `<style>`
 * blocks are re-imported via a sibling `?tsrx-css&lang.css` query and handled
 * by rspack's built-in CSS module type.
 *
 * @implements {RspackPluginInstance}
 */
export class TsrxReactRspackPlugin {
	/**
	 * @param {{ jsxImportSource?: string, runtimeImports?: RuntimeImportMode, platform?: Platform }} [options]
	 */
	constructor(options = {}) {
		this.explicit_platform = validatePlatform(options.platform);
		this.options = {
			jsxImportSource: options.jsxImportSource ?? 'react',
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
			integration: '@tsrx/rspack-plugin-react',
		});
		const { jsxImportSource } = this.options;
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
						loader: 'builtin:swc-loader',
						options: {
							jsc: {
								parser: {
									syntax: 'typescript',
									tsx: true,
								},
								transform: {
									react: {
										runtime: 'automatic',
										importSource: jsxImportSource,
									},
								},
								target: 'esnext',
							},
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

export default TsrxReactRspackPlugin;
