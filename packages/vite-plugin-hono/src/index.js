/** @import { Plugin } from 'vite' */
/** @import { DepScanTransformPlugin } from '@tsrx/core/types/vite/dep-scan' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/hono' */

import { perEnvironmentState, transformWithOxc } from 'vite';
import { mergePlatformDefinitions, validatePlatform } from '@tsrx/core';
import { compile as compileServer } from '@tsrx/hono';
import { compile as compileDom } from '@tsrx/hono/dom';
import { resolveBuildPlatform } from '@tsrx/core/config';
import { createDepScanTransformPlugin } from '@tsrx/core/vite/dep-scan';

const TSRX_EXTENSION_PATTERN = /\.tsrx$/;
const CSS_QUERY = '?tsrx-css&lang.css';

/**
 * @typedef {'server' | 'dom'} TsrxHonoMode
 * Hono-specific adapters remain under `@tsrx/hono/*` in direct mode.
 *
 * @typedef {{
 *   mode?: TsrxHonoMode,
 *   runtimeImports?: RuntimeImportMode,
 *   platform?: Platform,
 *   tsconfig?: string,
 * }} TsrxHonoPluginOptions
 */

/**
 * Compile `.tsrx` to Hono-flavoured TSX and finish the automatic JSX runtime
 * transform in Vite. The explicit mode keeps compiler-injected Hono helpers
 * aligned with the chosen `hono/jsx` or `hono/jsx/dom` runtime.
 *
 * @param {TsrxHonoPluginOptions} [options]
 * @returns {Plugin}
 */
export function tsrxHono(options = {}) {
	const mode = options.mode ?? 'server';
	if (mode !== 'server' && mode !== 'dom') {
		throw new TypeError(`@tsrx/vite-plugin-hono: invalid mode ${JSON.stringify(mode)}`);
	}
	const jsx_import_source = mode === 'dom' ? 'hono/jsx/dom' : 'hono/jsx';
	const compile = mode === 'dom' ? compileDom : compileServer;
	const explicit_platform = validatePlatform(options.platform);
	let platform = explicit_platform;
	const compile_options = { runtimeImports: options.runtimeImports, platform };

	/** @param {import('vite').UserConfig} config */
	function resolve_platform(config) {
		platform = resolveBuildPlatform({
			root: config.root ?? process.cwd(),
			tsconfig:
				options.tsconfig ??
				/** @type {{ tsconfig?: string }} */ (/** @type {unknown} */ (config)).tsconfig,
			platform: explicit_platform,
			integration: '@tsrx/vite-plugin-hono',
		});
		compile_options.platform = platform;
	}

	// Vite may share this plugin instance across build environments. Keep CSS
	// owned by the environment that transformed the source so one environment's
	// buildStart cannot invalidate another environment's virtual CSS modules.
	const get_environment_css_cache = perEnvironmentState(() => new Map());

	/** @param {{ environment: import('vite').Environment }} context */
	function css_cache_for(context) {
		return get_environment_css_cache(
			/** @type {Parameters<typeof get_environment_css_cache>[0]} */ (context),
		);
	}

	/** @param {Map<string, string>} css_cache @param {string} id @param {string | undefined} css */
	function cache_css(css_cache, id, css) {
		// Retain ownership after CSS removal so HMR can serve an empty module.
		if (css || css_cache.has(id)) css_cache.set(id, css ?? '');
	}

	/** @param {Map<string, string>} css_cache @param {string} id */
	function css_owner(css_cache, id) {
		if (!id.endsWith(CSS_QUERY)) return null;
		const owner = id.slice(id.startsWith('\0') ? 1 : 0, -CSS_QUERY.length);
		return css_cache.has(owner) ? owner : null;
	}

	function update_css_cache(
		/** @type {Map<string, string>} */ css_cache,
		/** @type {string} */ source,
		/** @type {string} */ id,
	) {
		const { css } = compile(source, id, compile_options);
		cache_css(css_cache, id, css);
	}

	/** @param {Map<string, string>} css_cache @param {string} code @param {string} id @param {string | undefined} css */
	function append_css_import(css_cache, code, id, css) {
		cache_css(css_cache, id, css);
		return css ? `${code}\nimport ${JSON.stringify(id + CSS_QUERY)};\n` : code;
	}

	return /** @type {Plugin} */ ({
		name: '@tsrx/vite-plugin-hono',
		enforce: 'pre',
		perEnvironmentStartEndDuringDev: true,
		perEnvironmentWatchChangeDuringDev: true,

		config(config = /** @type {import('vite').UserConfig} */ ({})) {
			resolve_platform(config);
			if (platform === undefined) return;
			return {
				define: mergePlatformDefinitions(config.define, platform, {
					integration: 'Vite',
				}),
			};
		},

		configEnvironment(name, config = /** @type {import('vite').EnvironmentOptions} */ ({})) {
			const discovers_dependencies =
				name === 'client' || config.optimizeDeps?.noDiscovery === false;
			if (!discovers_dependencies && platform === undefined) return;

			return {
				...(platform === undefined
					? {}
					: {
							define: mergePlatformDefinitions(config.define, platform, {
								integration: `Vite environment ${JSON.stringify(name)}`,
							}),
						}),
				...(discovers_dependencies
					? {
							optimizeDeps: {
								extensions: ['.tsrx'],
								rolldownOptions: {
									transform: { jsx: { importSource: jsx_import_source } },
									plugins: [create_dep_scan_plugin(jsx_import_source, compile_options, compile)],
								},
							},
						}
					: {}),
			};
		},

		resolveId(source) {
			const css_cache = css_cache_for(this);
			if (css_owner(css_cache, source) === null) return null;
			if (source.startsWith('\0')) return source;
			return '\0' + source;
		},

		load(id) {
			if (!id.startsWith('\0')) return null;
			const css_cache = css_cache_for(this);
			const owner = css_owner(css_cache, id);
			return owner === null ? null : css_cache.get(owner);
		},

		buildStart() {
			css_cache_for(this).clear();
		},

		watchChange(id, { event }) {
			if (event === 'delete') css_cache_for(this).delete(id);
		},

		async transform(code, id) {
			if (!TSRX_EXTENSION_PATTERN.test(id)) return null;

			const result = compile(code, id, compile_options);
			const source = append_css_import(css_cache_for(this), result.code, id, result.css);

			const transformed = await transformWithOxc(
				source,
				id,
				{
					lang: 'tsx',
					sourcemap: true,
					jsx: {
						runtime: 'automatic',
						importSource: jsx_import_source,
					},
					target: 'esnext',
				},
				result.map,
			);

			return { code: transformed.code, map: transformed.map };
		},

		async hotUpdate(options) {
			if (!TSRX_EXTENSION_PATTERN.test(options.file)) return;
			// Deleted files cannot be read. watchChange already removed their CSS.
			if (options.type === 'delete') return options.modules;
			const css_module = this.environment.moduleGraph.getModuleById(
				'\0' + options.file + CSS_QUERY,
			);
			if (!css_module) return options.modules;

			update_css_cache(css_cache_for(this), await options.read(), options.file);

			this.environment.moduleGraph.invalidateModule(css_module);
			return [...options.modules, css_module];
		},
	});
}

/**
 * @param {string} jsx_import_source
 * @param {{ runtimeImports?: RuntimeImportMode, platform?: Platform }} compile_options
 * @param {(code: string, id: string, options?: object) => { code: string }} compile
 * @returns {DepScanTransformPlugin}
 */
function create_dep_scan_plugin(jsx_import_source, compile_options, compile) {
	return createDepScanTransformPlugin({
		name: '@tsrx/vite-plugin-hono:dep-scan',
		filter: TSRX_EXTENSION_PATTERN,
		compile: (code, id) => compile(code, id, compile_options),
		imports: [jsx_import_source + '/jsx-runtime'],
	});
}

export default tsrxHono;
