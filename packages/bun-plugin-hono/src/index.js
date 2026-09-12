/** @import { BunPlugin, Target, Transpiler } from 'bun' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/hono' */
/** @import { HonoTargetMode } from '@tsrx/hono/target' */

import { readFile } from 'node:fs/promises';
import { mergePlatformDefinitions, validatePlatform } from '@tsrx/core';
import { resolveBuildPlatform } from '@tsrx/core/config';
import { resolveHonoTarget } from '@tsrx/hono/target';

const DEFAULT_INCLUDE = /\.tsrx$/;
const CSS_QUERY = '?tsrx-css&lang.css';
const CSS_QUERY_PATTERN = /\?tsrx-css&lang\.css$/;
const CSS_NAMESPACE = '@tsrx/bun-plugin-hono-css';

/**
 * @typedef {{
 *  mode?: HonoTargetMode,
 *  include?: RegExp,
 *  exclude?: RegExp | RegExp[],
 *  emitCss?: boolean,
 *  runtimeImports?: RuntimeImportMode,
 *  platform?: Platform,
 * }} TsrxHonoBunPluginOptions
 */

/**
 * @param {RegExp} pattern
 * @param {string} value
 */
function test_pattern(pattern, value) {
	pattern.lastIndex = 0;
	return pattern.test(value);
}

/**
 * @param {RegExp | RegExp[] | undefined} pattern
 * @param {string} value
 */
function matches_pattern(pattern, value) {
	if (!pattern) return false;
	if (Array.isArray(pattern)) {
		return pattern.some((entry) => test_pattern(entry, value));
	}
	return test_pattern(pattern, value);
}

/**
 * @param {TsrxHonoBunPluginOptions} options
 * @param {string} value
 */
function should_compile(options, value) {
	const include = options.include ?? DEFAULT_INCLUDE;
	return test_pattern(include, value) && !matches_pattern(options.exclude, value);
}

/** @param {string} file_path */
function to_css_id(file_path) {
	return file_path + CSS_QUERY;
}

/**
 * @param {string} jsx_import_source
 * @param {Target | undefined} target
 * @returns {Transpiler | null}
 */
function create_transpiler(jsx_import_source, target) {
	const Transpiler = globalThis.Bun?.Transpiler;
	if (typeof Transpiler !== 'function') return null;

	return new Transpiler({
		loader: 'tsx',
		target,
		autoImportJSX: true,
		tsconfig: {
			compilerOptions: {
				jsx: 'react-jsx',
				jsxImportSource: jsx_import_source,
			},
		},
	});
}

/**
 * Bun plugin for `.tsrx` files compiled for Hono's server or DOM JSX runtime.
 * Server mode is the default; DOM mode must be selected explicitly. Scoped
 * styles are exposed as plugin-owned virtual CSS modules.
 *
 * @param {TsrxHonoBunPluginOptions} [options]
 * @returns {BunPlugin}
 */
export function tsrxHono(options = {}) {
	const target = resolveHonoTarget(options.mode);
	const explicit_platform = validatePlatform(options.platform);
	const emit_css = options.emitCss ?? true;
	/** @type {Promise<typeof import('@tsrx/hono')['compile']> | undefined} */
	let compiler;

	/** @returns {Promise<typeof import('@tsrx/hono')['compile']>} */
	function load_compiler() {
		return (compiler ??= import(target.compiler).then((module) => module.compile));
	}

	/** @type {Map<string, string>} */
	const css_cache = new Map();

	return {
		name: '@tsrx/bun-plugin-hono',

		setup(build) {
			// build.config is absent when registered through Bun.plugin(), including
			// bun:test preloads, so every setting also has a safe runtime default.
			const build_config = build.config ?? {};
			const platform = resolveBuildPlatform({
				root: build_config.root ?? process.cwd(),
				tsconfig: typeof build_config.tsconfig === 'string' ? build_config.tsconfig : undefined,
				platform: explicit_platform,
				integration: '@tsrx/bun-plugin-hono',
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
			const transpiler = create_transpiler(target.jsxImportSource, build_config.target);

			build.onResolve({ filter: CSS_QUERY_PATTERN }, (args) => {
				if (!css_cache.has(args.path)) return undefined;
				return { path: args.path, namespace: CSS_NAMESPACE };
			});

			build.onLoad({ filter: CSS_QUERY_PATTERN, namespace: CSS_NAMESPACE }, (args) => ({
				contents: css_cache.get(args.path) ?? '',
				loader: 'css',
			}));

			build.onLoad(
				{ filter: options.include ?? DEFAULT_INCLUDE, namespace: 'file' },
				async (args) => {
					if (!should_compile(options, args.path)) return undefined;

					const source = await readFile(args.path, 'utf-8');
					const compile = await load_compiler();
					const { code, css } = compile(source, args.path, compile_options);
					const css_id = to_css_id(args.path);
					let output = code;

					if (emit_css && css) {
						css_cache.set(css_id, css);
						// Imported themes load first; the applying module wins at equal specificity.
						output = `${code}\nimport ${JSON.stringify(css_id)};\n`;
					} else {
						css_cache.delete(css_id);
					}

					if (transpiler) {
						return {
							contents: transpiler.transformSync(output),
							loader: 'js',
						};
					}

					return {
						contents: `/** @jsxImportSource ${target.jsxImportSource} */\n${output}`,
						loader: 'tsx',
					};
				},
			);
		},
	};
}

export default tsrxHono;
