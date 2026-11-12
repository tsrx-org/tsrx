/** @import { BunPlugin, OnLoadResult } from 'bun' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/solid' */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compile } from '@tsrx/solid';
import { mergePlatformDefinitions, replacePlatformFlags, validatePlatform } from '@tsrx/core';
import { resolveBuildPlatform } from '@tsrx/core/config';

const require = createRequire(import.meta.url);
const { transformAsync } = require('@babel/core');
const BABEL_PRESET_SOLID = require.resolve('babel-preset-solid');
const BABEL_PRESET_TYPESCRIPT = require.resolve('@babel/preset-typescript');

const DEFAULT_INCLUDE = /\.tsrx$/;
const CSS_QUERY = '?tsrx-css&lang.css';
const CSS_QUERY_PATTERN = /\?tsrx-css&lang\.css$/;

/**
 * @typedef {{
 * 	include?: RegExp,
 * 	exclude?: RegExp | RegExp[],
 * 	emitCss?: boolean,
 * 	solid?: object,
 * 	runtimeImports?: RuntimeImportMode,
 * 	platform?: Platform,
 * }} TsrxSolidBunPluginOptions
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
 * @param {TsrxSolidBunPluginOptions} options
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

const RUNTIME_STATE = Symbol.for('@tsrx/bun-plugin.runtime.v1');

/**
 * @typedef {{
 * 	loaders: Array<{ compiles: (file_path: string) => boolean, load: (file_path: string) => Promise<OnLoadResult> }>,
 * 	css: Map<string, string>,
 * }} RuntimeState
 */

/**
 * State that every TSRX Bun plugin instance registered with Bun.plugin()
 * shares. There Bun calls only the first onLoad hook whose filter matches and
 * needs an object back, so the instance it calls serves the stylesheets any
 * instance compiled and hands on the `.tsrx` files it leaves out. The key has
 * a version, so a later change to this shape can take a new key without
 * breaking older plugins installed alongside. `Bun.plugin.clearAll()` doesn't
 * tell plugins, so instances registered before it stay in the list.
 *
 * @returns {RuntimeState}
 */
function get_runtime_state() {
	const scope = /** @type {any} */ (globalThis);
	return (scope[RUNTIME_STATE] ??= { loaders: [], css: new Map() });
}

/**
 * Loads a `.tsrx` file this instance leaves out under Bun.plugin(): with the
 * first registered instance that compiles it, or else the way Bun loads it
 * without a plugin, as a module whose default export is the file's path.
 *
 * @param {RuntimeState} runtime
 * @param {string} file_path
 * @returns {OnLoadResult | Promise<OnLoadResult>}
 */
function load_elsewhere(runtime, file_path) {
	const owner = runtime.loaders.find((loader) => loader.compiles(file_path));
	return owner ? owner.load(file_path) : { exports: { default: file_path }, loader: 'object' };
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
 * @param {string} source
 * @param {string} file_path
 * @param {object | undefined} solid_options
 */
async function transform_solid(source, file_path, solid_options) {
	const result = await transformAsync(source, {
		filename: file_path.replace(/\.tsrx$/, '.tsx'),
		babelrc: false,
		configFile: false,
		sourceMaps: true,
		presets: [
			[BABEL_PRESET_SOLID, solid_options ?? {}],
			[
				BABEL_PRESET_TYPESCRIPT,
				{
					allExtensions: true,
					isTSX: true,
				},
			],
		],
	});

	return result?.code ?? source;
}

/**
 * Bun plugin for `.tsrx` files that compiles them through `@tsrx/solid`, runs
 * Solid's JSX transform with Babel, and exposes component-local styles as
 * virtual CSS modules.
 *
 * @param {TsrxSolidBunPluginOptions} [options]
 * @returns {BunPlugin}
 */
export function tsrxSolid(options = {}) {
	const explicit_platform = validatePlatform(options.platform);
	const emit_css = options.emitCss ?? true;

	/** @type {Map<string, string>} */
	const css_cache = new Map();

	return {
		name: '@tsrx/bun-plugin-solid',

		setup(build) {
			const build_config = build.config ?? {};
			const platform = resolveBuildPlatform({
				root: get_tsconfig_base(build_config),
				tsconfig: typeof build_config.tsconfig === 'string' ? build_config.tsconfig : undefined,
				platform: explicit_platform,
				integration: '@tsrx/bun-plugin-solid',
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

			const runtime = build.config ? undefined : get_runtime_state();
			const stylesheets = runtime ? runtime.css : css_cache;

			// Every instance sees every virtual CSS request. Leave the ones another
			// instance compiled to that instance, except under Bun.plugin(), where
			// the first instance has to answer and every instance shares the sheets.
			build.onResolve({ filter: CSS_QUERY_PATTERN }, (args) => {
				if (!stylesheets.has(args.path)) return undefined;
				return { path: args.path };
			});

			build.onLoad({ filter: CSS_QUERY_PATTERN }, (args) => {
				const css = stylesheets.get(args.path);
				if (css !== undefined) return { contents: css, loader: 'css' };
				return runtime ? { contents: '', loader: 'css' } : undefined;
			});

			/**
			 * @param {string} file_path
			 * @returns {Promise<OnLoadResult>}
			 */
			const load_tsrx = async (file_path) => {
				const source = await readFile(file_path, 'utf-8');
				const { code: compiled, css } = compile(source, file_path, compile_options);
				const code =
					inline_platform === undefined
						? compiled
						: replacePlatformFlags(compiled, file_path, inline_platform).code;
				const css_id = to_css_id(file_path);

				let output = code;
				if (emit_css && css) {
					stylesheets.set(css_id, css);
					// After the module's own imports so imported themes' sheets load first
					// and a rule in the applying module wins at equal specificity.
					output = `${code}\nimport ${JSON.stringify(css_id)};\n`;
				} else {
					stylesheets.delete(css_id);
				}

				return {
					contents: await transform_solid(output, file_path, options.solid),
					loader: 'js',
				};
			};
			runtime?.loaders.push({
				compiles: (file_path) => should_compile(options, file_path),
				load: load_tsrx,
			});

			build.onLoad({ filter: options.include ?? DEFAULT_INCLUDE, namespace: 'file' }, (args) => {
				if (should_compile(options, args.path)) return load_tsrx(args.path);
				return runtime ? load_elsewhere(runtime, args.path) : undefined;
			});
		},
	};
}

export default tsrxSolid;
