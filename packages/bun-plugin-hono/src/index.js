/** @import { BunPlugin, Target, Transpiler } from 'bun' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/hono' */

import { readFile } from 'node:fs/promises';
import { mergePlatformDefinitions, validatePlatform } from '@tsrx/core';
import { compile as compileServer } from '@tsrx/hono';
import { compile as compileDom } from '@tsrx/hono/dom';
import { resolveBuildPlatform } from '@tsrx/core/config';

const TSRX_EXTENSION_PATTERN = /\.tsrx$/;
const CSS_QUERY = '?tsrx-css&lang.css';
const CSS_QUERY_PATTERN = /\?tsrx-css&lang\.css$/;
const CSS_NAMESPACE = '@tsrx/bun-plugin-hono-css';

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

/** @param {string} jsx_import_source @param {Target | undefined} target */
function create_transpiler(jsx_import_source, target) {
	const Transpiler = globalThis.Bun?.Transpiler;
	if (typeof Transpiler !== 'function') {
		throw new Error(
			'@tsrx/bun-plugin-hono requires Bun.Transpiler to select the configured Hono JSX runtime.',
		);
	}

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

	/** @param {string} code @param {string} id @param {string | undefined} css @param {boolean} emit_css */
	function append_css_import(code, id, css, emit_css) {
		if (!emit_css || !css) {
			css_cache.delete(id);
			return code;
		}
		css_cache.set(id, css);
		return `${code}\nimport ${JSON.stringify(id)};\n`;
	}

	return {
		name: '@tsrx/bun-plugin-hono',

		setup(build) {
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
			const transpiler = create_transpiler(jsx_import_source, build_config.target);

			build.onResolve({ filter: CSS_QUERY_PATTERN }, (args) => {
				if (!css_cache.has(args.path)) return undefined;
				return { path: args.path, namespace: CSS_NAMESPACE };
			});

			build.onLoad({ filter: CSS_QUERY_PATTERN, namespace: CSS_NAMESPACE }, (args) => ({
				contents: css_cache.get(args.path) ?? '',
				loader: 'css',
			}));

			build.onLoad({ filter: TSRX_EXTENSION_PATTERN, namespace: 'file' }, async (args) => {
				const source = await readFile(args.path, 'utf-8');
				const { code, css } = compile(source, args.path, compile_options);
				const css_id = args.path + CSS_QUERY;
				const output = append_css_import(code, css_id, css, emit_css);

				return { contents: transpiler.transformSync(output), loader: 'js' };
			});
		},
	};
}

export default tsrxHono;
