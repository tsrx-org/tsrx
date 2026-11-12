/** @import { BunPlugin, OnLoadResult } from 'bun' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/hono' */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mergePlatformDefinitions, replacePlatformFlags, validatePlatform } from '@tsrx/core';
import { compile as compileServer } from '@tsrx/hono';
import { compile as compileDom } from '@tsrx/hono/dom';
import { resolveBuildPlatform, resolveTsconfigJsx } from '@tsrx/core/config';

const TSRX_EXTENSION_PATTERN = /\.tsrx$/;
const CSS_QUERY = '?tsrx-css&lang.css';
const CSS_QUERY_PATTERN = /\?tsrx-css&lang\.css$/;

/**
 * @typedef {'server' | 'dom'} TsrxHonoMode
 * Hono-specific adapters remain under `@tsrx/hono/*` in direct mode.
 *
 * @typedef {{
 *   mode?: TsrxHonoMode,
 *   emitCss?: boolean,
 *   runtimeImports?: RuntimeImportMode,
 *   platform?: Platform,
 * }} TsrxHonoBunPluginOptions
 */

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
 * Prefix compiled TSX with the pragma that selects the JSX import source, so
 * Bun's own TSX transform picks the development or production runtime for the
 * build. Bun ignores a lone `@jsxImportSource` under a classic `"jsx": "react"`
 * tsconfig. There `@jsxRuntime automatic` keeps the automatic runtime, which
 * Bun then takes from the development entry point in every build.
 *
 * @param {string} code
 * @param {string} jsx_import_source
 * @param {boolean} classic
 * @returns {string}
 */
function add_jsx_pragma(code, jsx_import_source, classic) {
	const runtime = classic ? '@jsxRuntime automatic ' : '';
	const pragma = `/** ${runtime}@jsxImportSource ${jsx_import_source} */\n`;
	// A shebang has to stay on the first line.
	const shebang_end = code.startsWith('#!') ? code.indexOf('\n') + 1 || code.length : 0;
	return code.slice(0, shebang_end) + pragma + code.slice(shebang_end);
}

/**
 * Compile `.tsrx` files and pass the resulting TSX through Bun's automatic
 * JSX transform. Hono's server and DOM runtimes are explicit modes because
 * changing only the JSX import source would leave compiler-injected helpers
 * pointed at the wrong runtime.
 *
 * @param {TsrxHonoBunPluginOptions} [options]
 * @returns {BunPlugin}
 */
export function tsrxHono(options = {}) {
	const mode = options.mode ?? 'server';
	if (mode !== 'server' && mode !== 'dom') {
		throw new TypeError(`@tsrx/bun-plugin-hono: invalid mode ${JSON.stringify(mode)}`);
	}
	const jsx_import_source = mode === 'dom' ? 'hono/jsx/dom' : 'hono/jsx';
	const compile = mode === 'dom' ? compileDom : compileServer;
	const emit_css = options.emitCss ?? true;
	const explicit_platform = validatePlatform(options.platform);

	/** @type {Map<string, string>} */
	const css_cache = new Map();

	return {
		name: '@tsrx/bun-plugin-hono',

		setup(build) {
			const build_config = build.config ?? {};
			const platform = resolveBuildPlatform({
				root: get_tsconfig_base(build_config),
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
			// Bun.plugin() registration has no `define`, so the flags left in compiled
			// output get their values written in directly.
			const inline_platform = build.config ? undefined : platform;
			/** @type {Map<string, unknown>} */
			const tsconfig_cache = new Map();
			// Bun.build() applies the tsconfig nearest each file. Bun.plugin()
			// registration applies the working directory's own tsconfig, if any, to
			// every file, without searching parent folders.
			const runtime_classic_jsx =
				!build.config &&
				existsSync(path.join(process.cwd(), 'tsconfig.json')) &&
				resolveTsconfigJsx(process.cwd(), tsconfig_cache) === 'react';
			/** @param {string} file_path */
			const uses_classic_jsx = (file_path) =>
				build.config
					? resolveTsconfigJsx(file_path, tsconfig_cache) === 'react'
					: runtime_classic_jsx;

			const runtime = build.config ? undefined : get_runtime_state();
			const stylesheets = runtime ? runtime.css : css_cache;

			// Every instance sees every virtual CSS request. Leave the ones another
			// instance compiled to that instance, except under Bun.plugin(), where
			// the first instance has to answer and every instance shares the sheets.
			// The stylesheets stay in the file namespace, the only one where
			// Bun.plugin() registration accepts the css loader.
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
				const css_id = file_path + CSS_QUERY;

				let output = code;
				if (emit_css && css) {
					stylesheets.set(css_id, css);
					output = `${code}\nimport ${JSON.stringify(css_id)};\n`;
				} else {
					stylesheets.delete(css_id);
				}

				return {
					contents: add_jsx_pragma(output, jsx_import_source, uses_classic_jsx(file_path)),
					loader: 'tsx',
				};
			};
			// Other TSRX plugins hand on the `.tsrx` files they leave out.
			runtime?.loaders.push({
				compiles: (file_path) => TSRX_EXTENSION_PATTERN.test(file_path),
				load: load_tsrx,
			});

			build.onLoad({ filter: TSRX_EXTENSION_PATTERN, namespace: 'file' }, (args) =>
				load_tsrx(args.path),
			);
		},
	};
}

export default tsrxHono;
