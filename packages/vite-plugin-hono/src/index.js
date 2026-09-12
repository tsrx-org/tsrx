/** @import { Plugin } from 'vite' */
/** @import { BaseCompileOptions, CompileFn, Platform, RuntimeImportMode } from '@tsrx/core/types' */
/** @import { DepScanTransformPlugin } from '@tsrx/core/types/vite/dep-scan' */
/** @import { HonoTargetMode } from '@tsrx/hono/target' */

import { perEnvironmentState, transformWithOxc } from 'vite';
import { mergePlatformDefinitions, validatePlatform } from '@tsrx/core';
import { resolveBuildPlatform } from '@tsrx/core/config';
import { createDepScanTransformPlugin } from '@tsrx/core/vite/dep-scan';
import { resolveHonoTarget } from '@tsrx/hono/target';

const TSRX_EXTENSION_PATTERN = /\.tsrx$/;
const CSS_QUERY = '?tsrx-css&lang.css';

/**
 * @typedef {{ code: string, map: unknown }} TsrxHonoTransformResult
 * @typedef {(
 *   source: string,
 *   filename?: string,
 *   options?: BaseCompileOptions,
 * ) => Promise<ReturnType<CompileFn>>} AsyncCompileFn
 * @typedef {{
 *   mode?: HonoTargetMode,
 *   runtimeImports?: RuntimeImportMode,
 *   platform?: Platform,
 *   tsconfig?: string,
 * }} TsrxHonoPluginOptions
 * @typedef {{
 *   (code: string, id: `${string}.tsrx`): Promise<TsrxHonoTransformResult>,
 *   (code: string, id: string): Promise<TsrxHonoTransformResult | null>,
 * }} TsrxHonoTransform
 * @typedef {{
 *   (source: `${string}?tsrx-css&lang.css`): `\0${string}?tsrx-css&lang.css` | null,
 *   (source: string): string | null,
 * }} TsrxHonoResolveId
 * @typedef {{
 *   (id: `\0${string}?tsrx-css&lang.css`): string | null,
 *   (id: string): string | null,
 * }} TsrxHonoLoad
 * @typedef {{
 *   define?: Record<string, unknown>,
 *   optimizeDeps?: {
 *     extensions: string[],
 *     rolldownOptions: {
 *       transform: { jsx: { importSource: string } },
 *       plugins: [DepScanTransformPlugin],
 *     },
 *   },
 * }} TsrxHonoEnvironmentConfig
 * @typedef {(
 *   name: string,
 *   config?: import('vite').EnvironmentOptions,
 * ) => TsrxHonoEnvironmentConfig | undefined} TsrxHonoConfigEnvironmentHook
 * @typedef {Omit<Plugin, 'configEnvironment' | 'transform' | 'resolveId' | 'load'> & {
 *   configEnvironment: TsrxHonoConfigEnvironmentHook,
 *   transform: TsrxHonoTransform,
 *   resolveId: TsrxHonoResolveId,
 *   load: TsrxHonoLoad,
 * }} TsrxHonoPlugin
 */

/**
 * Compile `.tsrx` modules for Hono's server or DOM JSX runtime. One plugin
 * instance owns one mode, with server rendering as the predictable default.
 *
 * @param {TsrxHonoPluginOptions} [options]
 * @returns {TsrxHonoPlugin}
 */
export function tsrxHono(options = {}) {
	const target = resolveHonoTarget(options.mode);
	const explicit_platform = validatePlatform(options.platform);
	let platform = explicit_platform;
	const compile_options = { runtimeImports: options.runtimeImports, platform };

	/** @type {Promise<{ compile: CompileFn }> | undefined} */
	let compiler_promise;

	function load_compiler() {
		return (compiler_promise ??= /** @type {Promise<{ compile: CompileFn }>} */ (
			import(target.compiler)
		));
	}

	/** @type {AsyncCompileFn} */
	async function compile(source, filename, compile_options_override) {
		const compiler = await load_compiler();
		return compiler.compile(source, filename, compile_options_override);
	}

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

	// Vite can share a plugin instance between named environments. Each cache
	// therefore belongs to the hook's current environment, and each entry to the
	// source file that emitted it.
	const get_environment_css_cache = perEnvironmentState(() => new Map());

	/** @param {{ environment: import('vite').Environment }} context */
	function css_cache_for(context) {
		return get_environment_css_cache(
			/** @type {Parameters<typeof get_environment_css_cache>[0]} */ (context),
		);
	}

	/**
	 * @param {Map<string, string>} css_cache
	 * @param {string} id
	 * @param {string | undefined} css
	 */
	function cache_css(css_cache, id, css) {
		// Once Vite has loaded a stylesheet, preserve its ownership with an empty
		// module when styles are removed so HMR can clear the old rules.
		if (css || css_cache.has(id)) css_cache.set(id, css ?? '');
	}

	/** @param {Map<string, string>} css_cache @param {string} id */
	function css_owner(css_cache, id) {
		if (!id.endsWith(CSS_QUERY)) return null;
		const owner = id.slice(id.startsWith('\0') ? 1 : 0, -CSS_QUERY.length);
		return css_cache.has(owner) ? owner : null;
	}

	/**
	 * @param {Map<string, string>} css_cache
	 * @param {string} source
	 * @param {string} id
	 */
	async function update_css_cache(css_cache, source, id) {
		const { css } = await compile(source, id, compile_options);
		cache_css(css_cache, id, css);
	}

	const plugin = /** @type {Plugin} */ ({
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
					? create_dep_scan_config(target.jsxImportSource, compile, compile_options)
					: {}),
			};
		},

		resolveId(source) {
			const css_cache = css_cache_for(this);
			if (css_owner(css_cache, source) === null) return null;
			return source.startsWith('\0') ? source : '\0' + source;
		},

		load(id) {
			if (!id.startsWith('\0')) return null;
			const css_cache = css_cache_for(this);
			const owner = css_owner(css_cache, id);
			return owner === null ? null : (css_cache.get(owner) ?? null);
		},

		buildStart() {
			css_cache_for(this).clear();
		},

		watchChange(
			/** @type {string} */ id,
			/** @type {{ event: 'create' | 'update' | 'delete' }} */ { event },
		) {
			if (event === 'delete') {
				css_cache_for(this).delete(id);
			}
		},

		async transform(code, id) {
			if (!TSRX_EXTENSION_PATTERN.test(id)) return null;

			const result = await compile(code, id, compile_options);
			const css_cache = css_cache_for(this);
			cache_css(css_cache, id, result.css);
			const source = result.css
				? `${result.code}\nimport ${JSON.stringify(id + CSS_QUERY)};\n`
				: result.code;

			const transformed = await transformWithOxc(
				source,
				id,
				{
					lang: 'tsx',
					sourcemap: true,
					jsx: {
						runtime: 'automatic',
						importSource: target.jsxImportSource,
					},
					target: 'esnext',
				},
				result.map,
			);

			return { code: transformed.code, map: transformed.map };
		},

		async hotUpdate(/** @type {import('vite').HotUpdateOptions} */ update) {
			if (!TSRX_EXTENSION_PATTERN.test(update.file)) return;
			if (update.type === 'delete') return update.modules;

			const css_module = this.environment.moduleGraph.getModuleById('\0' + update.file + CSS_QUERY);
			if (!css_module) return update.modules;

			await update_css_cache(css_cache_for(this), await update.read(), update.file);
			this.environment.moduleGraph.invalidateModule(css_module);
			return [...update.modules, css_module];
		},
	});

	return /** @type {TsrxHonoPlugin} */ (/** @type {unknown} */ (plugin));
}

/**
 * @param {string} jsx_import_source
 * @param {AsyncCompileFn} compile
 * @param {{ runtimeImports?: RuntimeImportMode, platform?: Platform }} compile_options
 */
function create_dep_scan_config(jsx_import_source, compile, compile_options) {
	return {
		optimizeDeps: {
			extensions: ['.tsrx'],
			rolldownOptions: {
				transform: { jsx: { importSource: jsx_import_source } },
				plugins: [
					createDepScanTransformPlugin({
						name: '@tsrx/vite-plugin-hono:dep-scan',
						filter: TSRX_EXTENSION_PATTERN,
						compile: (/** @type {string} */ code, /** @type {string} */ id) =>
							compile(code, id, compile_options),
						imports: [jsx_import_source + '/jsx-runtime'],
					}),
				],
			},
		},
	};
}

export default tsrxHono;
