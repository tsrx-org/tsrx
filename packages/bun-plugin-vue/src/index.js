/** @import { BunPlugin, Target, Transpiler } from 'bun' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/vue' */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compile } from '@tsrx/vue';
import { mergePlatformDefinitions, replacePlatformFlags, validatePlatform } from '@tsrx/core';
import { resolveBuildPlatform } from '@tsrx/core/config';
import { addVaporInteropToCreateVaporApp } from '@tsrx/vue/interop';

const require = createRequire(import.meta.url);
const { transformVueJsxVapor } = require('vue-jsx-vapor/api');

const DEFAULT_INCLUDE = /\.tsrx$/;
const SOURCE_EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/;
const CSS_QUERY = '?tsrx-css&lang.css';
const CSS_QUERY_PATTERN = /\?tsrx-css&lang\.css$/;
const NODE_MODULES_PATTERN = /[/\\]node_modules[/\\]/;
const DEFAULT_VAPOR_OPTIONS = {
	macros: true,
	compiler: {
		runtimeModuleName: 'vue-jsx-vapor',
	},
};

/**
 * @typedef {{
 * 	include?: RegExp,
 * 	exclude?: RegExp | RegExp[],
 * 	emitCss?: boolean,
 * 	runtimeImports?: RuntimeImportMode,
 * 	platform?: Platform,
 * 	vapor?: {
 * 		macros?: boolean | object,
 * 		compiler?: { runtimeModuleName?: string },
 * 	},
 * }} TsrxVueBunPluginOptions
 */

/**
 * @param {RegExp} pattern
 * @param {string} value
 * @returns {boolean}
 */
function test_pattern(pattern, value) {
	pattern.lastIndex = 0;
	return pattern.test(value);
}

/**
 * @param {RegExp | RegExp[] | undefined} pattern
 * @param {string} value
 * @returns {boolean}
 */
function matches_pattern(pattern, value) {
	if (!pattern) return false;
	if (Array.isArray(pattern)) {
		return pattern.some((entry) => test_pattern(entry, value));
	}
	return test_pattern(pattern, value);
}

/**
 * @param {TsrxVueBunPluginOptions} options
 * @param {string} value
 * @returns {boolean}
 */
function should_compile(options, value) {
	const include = options.include ?? DEFAULT_INCLUDE;
	return test_pattern(include, value) && !matches_pattern(options.exclude, value);
}

/**
 * @param {string} file_path
 * @returns {string}
 */
function to_css_id(file_path) {
	return file_path + CSS_QUERY;
}

/**
 * @param {string} file_path
 * @returns {'js' | 'jsx' | 'ts' | 'tsx'}
 */
function get_source_loader(file_path) {
	if (/\.[cm]?tsx$/.test(file_path)) return 'tsx';
	if (/\.[cm]?ts$/.test(file_path)) return 'ts';
	if (/\.[cm]?jsx$/.test(file_path)) return 'jsx';
	return 'js';
}

/**
 * @param {Target | undefined} target
 * @returns {Transpiler | null}
 */
function create_transpiler(target) {
	const Transpiler = globalThis.Bun?.Transpiler;
	if (typeof Transpiler !== 'function') return null;

	return new Transpiler({
		loader: 'ts',
		target,
	});
}

/**
 * Directory the tsconfig lookup starts from. Without `root`, Bun builds from
 * the common ancestor directory of the entrypoints, or from the working
 * directory when every entrypoint is an in-memory `files` entry. The nearest
 * tsconfig is searched from there. A relative `tsconfig` option resolves from
 * the working directory.
 *
 * @param {{ root?: string, tsconfig?: unknown, entrypoints?: unknown[], files?: object }} build_config
 * @returns {string}
 */
function get_tsconfig_base(build_config) {
	if (build_config.root) return build_config.root;
	const entrypoints = (build_config.entrypoints ?? []).filter(
		(entrypoint) => typeof entrypoint === 'string',
	);
	const virtual_files = new Set(
		Object.keys(build_config.files ?? {}).map((file) => path.resolve(file)),
	);
	if (
		typeof build_config.tsconfig === 'string' ||
		entrypoints.every((entrypoint) => virtual_files.has(path.resolve(entrypoint)))
	) {
		return process.cwd();
	}

	let base = path.dirname(path.resolve(entrypoints[0]));
	for (const entrypoint of entrypoints) {
		const file_path = path.resolve(entrypoint);
		while (/^\.\.(?:[/\\]|$)/.test(path.relative(base, file_path))) {
			base = path.dirname(base);
		}
	}
	return base;
}

/**
 * @param {TsrxVueBunPluginOptions['vapor']} options
 */
function resolve_vapor_options(options) {
	const { interop: _interop, ...rest } =
		/** @type {{ interop?: boolean, macros?: boolean | object, compiler?: { runtimeModuleName?: string } }} */ (
			options ?? {}
		);
	return {
		...DEFAULT_VAPOR_OPTIONS,
		...rest,
		compiler: {
			...DEFAULT_VAPOR_OPTIONS.compiler,
			...rest.compiler,
		},
	};
}

/**
 * Bun plugin for `.tsrx` files that compiles them through `@tsrx/vue`, runs
 * the downstream `vue-jsx-vapor` transform, then strips the remaining
 * TypeScript syntax with Bun. Component-local styles are exposed as virtual CSS
 * modules.
 *
 * @param {TsrxVueBunPluginOptions} [options]
 * @returns {BunPlugin}
 */
export function tsrxVue(options = {}) {
	const explicit_platform = validatePlatform(options.platform);
	const emit_css = options.emitCss ?? true;
	const vapor_options = resolve_vapor_options(options.vapor);

	/** @type {Map<string, string>} */
	const css_cache = new Map();

	return {
		name: '@tsrx/bun-plugin-vue',

		setup(build) {
			// build.config is only present for Bun.build(); runtime registration
			// via Bun.plugin(), including bun:test preloads, does not provide it.
			const build_config = build.config ?? {};
			const platform = resolveBuildPlatform({
				root: get_tsconfig_base(build_config),
				tsconfig: typeof build_config.tsconfig === 'string' ? build_config.tsconfig : undefined,
				platform: explicit_platform,
				integration: '@tsrx/bun-plugin-vue',
			});
			const compile_options = { runtimeImports: options.runtimeImports, platform };
			if (platform !== undefined && build.config) {
				build.config.define = /** @type {Record<string, string>} */ (
					mergePlatformDefinitions(build.config.define, platform, {
						integration: 'Bun',
						serialize: true,
					})
				);
			}
			// Bun.plugin() registration has no `define`, so the flags left in compiled
			// output get their values written in directly.
			const inline_platform = build.config ? undefined : platform;
			const transpiler = create_transpiler(build_config.target);

			// Every instance sees every virtual CSS request. Leave the ones another
			// instance compiled to that instance.
			build.onResolve({ filter: CSS_QUERY_PATTERN }, (args) => {
				if (!css_cache.has(args.path)) return undefined;
				return { path: args.path };
			});

			build.onLoad({ filter: CSS_QUERY_PATTERN }, (args) => {
				const css = css_cache.get(args.path);
				if (css === undefined) return undefined;
				return { contents: css, loader: 'css' };
			});

			build.onLoad(
				{ filter: options.include ?? DEFAULT_INCLUDE, namespace: 'file' },
				async (args) => {
					if (!should_compile(options, args.path)) return undefined;

					const source = await readFile(args.path, 'utf-8');
					const { code: compiled, css } = compile(source, args.path, compile_options);
					const code =
						inline_platform === undefined
							? compiled
							: replacePlatformFlags(compiled, args.path, inline_platform).code;
					const css_id = to_css_id(args.path);

					let output = code;
					if (emit_css && css) {
						css_cache.set(css_id, css);
						// After the module's own imports so imported themes' sheets load first
						// and a rule in the applying module wins at equal specificity.
						output = `${code}\nimport ${JSON.stringify(css_id)};\n`;
					} else {
						css_cache.delete(css_id);
					}

					const transformed = transformVueJsxVapor(
						output,
						args.path.replace(/\.tsrx$/, '.tsx'),
						vapor_options,
						false,
						false,
						false,
					);

					if (transpiler) {
						return {
							contents: transpiler.transformSync(transformed.code),
							loader: 'js',
						};
					}

					return {
						contents: transformed.code,
						loader: 'ts',
					};
				},
			);

			build.onLoad({ filter: SOURCE_EXTENSION_PATTERN, namespace: 'file' }, async (args) => {
				if (NODE_MODULES_PATTERN.test(args.path)) return undefined;

				const source = await readFile(args.path, 'utf-8');
				const transformed = addVaporInteropToCreateVaporApp(source);
				if (transformed === source) return undefined;

				return {
					contents: transformed,
					loader: get_source_loader(args.path),
				};
			});
		},
	};
}

export default tsrxVue;
