/** @import { BunPlugin, OnLoadResult, Target, Transpiler } from 'bun' */
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
// vue-jsx-vapor's plugin hooks as its Rollup plugin. Called outside Rollup,
// each hook applies its own `filter` first, as unplugin does for Rollup
// versions without hook filters.
const { default: create_vue_jsx_vapor_plugins } = require('vue-jsx-vapor/rollup');

const DEFAULT_INCLUDE = /\.tsrx$/;
// JavaScript and TypeScript sources outside node_modules. Bun evaluates the
// lookahead itself, so dependencies never reach the interop hook.
const PROJECT_SOURCE_PATTERN = /^(?!.*[/\\]node_modules[/\\]).*\.[cm]?[jt]sx?$/;
const CSS_QUERY = '?tsrx-css&lang.css';
const CSS_QUERY_PATTERN = /\?tsrx-css&lang\.css$/;
// The macros import helper modules by ids such as `/vue-jsx-vapor/props`. The
// plugin serves each at a path that carries the id in this query.
const VAPOR_HELPER_ID_PATTERN = /^\/vue-jsx-vapor\//;
const VAPOR_HELPER_IMPORT_PATTERN = /\b(from\s*|import\s*)"(\/vue-jsx-vapor\/[^"]+)"/g;
const VAPOR_HELPER_QUERY = '?vue-jsx-vapor=';
const VAPOR_HELPER_PATH_PATTERN = /\?vue-jsx-vapor=([^?&]+)$/;
const VUE_IMPORT_PATTERN = /\b(from\s*|import\s*)(["'])vue\2/g;
// A `defineStyle` stylesheet's language: `lang.css`, `lang.module.scss`, ...
const VAPOR_STYLESHEET_LANG_PATTERN = /&lang\.(?:module\.)?(\w+)$/;
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

const RUNTIME_STATE = Symbol.for('@tsrx/bun-plugin.runtime.v1');

/**
 * @typedef {{
 * 	loaders: Array<{
 * 		compiles: (file_path: string) => boolean,
 * 		load: (file_path: string) => Promise<OnLoadResult>,
 * 		load_vapor_helper?: (id: string) => Promise<string | undefined>,
 * 	}>,
 * 	css: Map<string, string>,
 * }} RuntimeState
 */

/**
 * State that every TSRX Bun plugin instance registered with Bun.plugin()
 * shares. There Bun calls only the first onLoad hook whose filter matches and
 * needs an object back, so the instance it calls serves the stylesheets any
 * instance compiled, hands on the `.tsrx` files it leaves out, and serves the
 * vue-jsx-vapor helper modules any Vue instance's output imports. The key has
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
 * Bun's default loader for the file: `.js` files may contain JSX.
 *
 * @param {string} file_path
 * @returns {'js' | 'jsx' | 'ts' | 'tsx'}
 */
function get_source_loader(file_path) {
	if (/\.[cm]?tsx$/.test(file_path)) return 'tsx';
	if (/\.[cm]?ts$/.test(file_path)) return 'ts';
	if (/\.(?:[cm]?jsx|js)$/.test(file_path)) return 'jsx';
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
 * @typedef {((...args: string[]) => unknown) | { handler: (...args: string[]) => unknown }} VueJsxVaporHook
 * @typedef {{ name: string, load?: VueJsxVaporHook, transform?: VueJsxVaporHook }} VueJsxVaporPlugin
 */

/**
 * Calls a vue-jsx-vapor plugin hook and returns the code it produced, if any.
 *
 * @param {VueJsxVaporHook} hook
 * @param {...string} args
 * @returns {Promise<string | undefined>}
 */
async function call_vapor_hook(hook, ...args) {
	const result = /** @type {string | { code: string } | null | undefined} */ (
		await (typeof hook === 'function' ? hook : hook.handler)(...args)
	);
	return typeof result === 'string' ? result : (result?.code ?? undefined);
}

/**
 * vue-jsx-vapor set up as its Vite plugin sets it up: the macros, unless
 * `macros` is false, expand before the Vapor transform, and the helper modules
 * they import load through the same plugin hooks.
 *
 * @param {ReturnType<typeof resolve_vapor_options>} vapor_options
 */
function create_vue_jsx_vapor(vapor_options) {
	/** @type {VueJsxVaporPlugin[]} */
	const plugins = [create_vue_jsx_vapor_plugins(vapor_options)].flat();
	const macros = plugins.find((plugin) => plugin.name === '@vue-jsx-vapor/macros')?.transform;

	return {
		/**
		 * Expands the macros, unless their `include` and `exclude` options leave
		 * the module out, then runs the Vapor transform.
		 *
		 * @param {string} code
		 * @param {string} file_path the `.tsrx` module's path
		 * @returns {Promise<string>}
		 */
		async transform(code, file_path) {
			// The macros' `include` and `exclude` see the id the Vite plugin gives it.
			const expanded = macros ? await call_vapor_hook(macros, code, `${file_path}.tsx`) : undefined;
			const id = file_path.replace(/\.tsrx$/, '.tsx');
			return transformVueJsxVapor(expanded ?? code, id, vapor_options, false, false, false).code;
		},

		/**
		 * Loads a helper module by its `/vue-jsx-vapor/…` id, then runs the
		 * transforms for helper modules, such as the one that compiles a
		 * `defineStyle` stylesheet.
		 *
		 * @param {string} id
		 * @returns {Promise<string | undefined>}
		 */
		async load_helper(id) {
			let code;
			for (const { load } of plugins) {
				code = load && (await call_vapor_hook(load, id));
				if (code !== undefined) break;
			}
			if (code === undefined) return undefined;
			for (const { transform } of plugins) {
				code = (transform && (await call_vapor_hook(transform, code, id))) ?? code;
			}
			return code;
		},
	};
}

/**
 * @param {string} anchor a file the helper module resolves its imports from
 * @param {string} id
 * @returns {string}
 */
function to_vapor_helper_path(anchor, id) {
	return anchor + VAPOR_HELPER_QUERY + encodeURIComponent(id);
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
	const vue_jsx_vapor = create_vue_jsx_vapor(resolve_vapor_options(options.vapor));

	/** @type {Map<string, string>} */
	const css_cache = new Map();

	return {
		name: '@tsrx/bun-plugin-vue',

		setup(build) {
			// build.config is only present for Bun.build(); runtime registration
			// via Bun.plugin(), including bun:test preloads, does not provide it.
			const build_config = build.config ?? {};
			const base = get_tsconfig_base(build_config);
			const platform = resolveBuildPlatform({
				root: base,
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

			// Bun.build() resolves the helper modules a build's compiled modules import
			// to one path each, in the directory Bun builds from, where they resolve
			// `vue`. Bun.plugin() never calls onResolve hooks, and resolves only paths
			// to files, so there `load_tsrx` points each helper import at the file
			// `vue` resolves to from the importing module, and the helper imports
			// that file as `vue`. That path has no `.tsrx` in it for another plugin's
			// `include` to see.
			if (build.config) {
				const anchor = path.join(base, 'vue-jsx-vapor');
				build.onResolve({ filter: VAPOR_HELPER_ID_PATTERN }, (args) => {
					if (!should_compile(options, args.importer)) return undefined;
					return { path: to_vapor_helper_path(anchor, args.path) };
				});
			}

			build.onLoad({ filter: VAPOR_HELPER_PATH_PATTERN }, async (args) => {
				const [, encoded_id] = /** @type {RegExpExecArray} */ (
					VAPOR_HELPER_PATH_PATTERN.exec(args.path)
				);
				const id = decodeURIComponent(encoded_id);
				const stylesheet_lang = VAPOR_STYLESHEET_LANG_PATTERN.exec(id)?.[1];
				// Bun.plugin() has no CSS loader, and a stylesheet does nothing there.
				if (runtime && stylesheet_lang) return { exports: { default: {} }, loader: 'object' };
				if (stylesheet_lang && stylesheet_lang !== 'css') {
					throw new Error(
						`@tsrx/bun-plugin-vue: Bun can't load a defineStyle.${stylesheet_lang} stylesheet (${id}). Use defineStyle() or defineStyle.css().`,
					);
				}
				if (!runtime) {
					const code = await vue_jsx_vapor.load_helper(id);
					return code === undefined
						? undefined
						: { contents: code, loader: stylesheet_lang ? 'css' : 'js' };
				}
				// Bun calls this hook for every instance's helper modules.
				const vue = JSON.stringify(args.path.slice(0, args.path.indexOf(VAPOR_HELPER_QUERY)));
				for (const loader of runtime.loaders) {
					const code = await loader.load_vapor_helper?.(id);
					if (code === undefined) continue;
					return {
						contents: code.replace(VUE_IMPORT_PATTERN, (_, keyword) => keyword + vue),
						loader: 'js',
					};
				}
				throw new Error(`@tsrx/bun-plugin-vue: unknown vue-jsx-vapor helper module ${id}`);
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

				let transformed = await vue_jsx_vapor.transform(output, file_path);
				if (runtime) {
					/** @type {string | undefined} */
					let vue;
					transformed = transformed.replace(VAPOR_HELPER_IMPORT_PATTERN, (_, keyword, id) => {
						vue ??= Bun.resolveSync('vue', path.dirname(file_path));
						return keyword + JSON.stringify(to_vapor_helper_path(vue, id));
					});
				}

				if (transpiler) {
					return {
						contents: transpiler.transformSync(transformed),
						loader: 'js',
					};
				}

				return {
					contents: transformed,
					loader: 'ts',
				};
			};
			runtime?.loaders.push({
				compiles: (file_path) => should_compile(options, file_path),
				load: load_tsrx,
				load_vapor_helper: vue_jsx_vapor.load_helper,
			});

			build.onLoad({ filter: options.include ?? DEFAULT_INCLUDE, namespace: 'file' }, (args) => {
				if (should_compile(options, args.path)) return load_tsrx(args.path);
				return runtime ? load_elsewhere(runtime, args.path) : undefined;
			});

			// Only Bun.build() runs the interop rewrite. Under Bun.plugin() this hook
			// would have to answer for every project module, and a module an async
			// hook loads can't be `require()`d, which breaks CommonJS.
			if (build.config) {
				build.onLoad({ filter: PROJECT_SOURCE_PATTERN, namespace: 'file' }, async (args) => {
					const source = await readFile(args.path, 'utf-8');
					const transformed = addVaporInteropToCreateVaporApp(source);
					if (transformed === source) return undefined;

					return {
						contents: transformed,
						loader: get_source_loader(args.path),
					};
				});
			}
		},
	};
}

export default tsrxVue;
