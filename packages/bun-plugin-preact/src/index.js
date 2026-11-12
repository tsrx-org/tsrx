/** @import { BunPlugin } from 'bun' */
/** @import { Platform, RuntimeImportMode } from '@tsrx/preact' */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { compile } from '@tsrx/preact';
import { mergePlatformDefinitions, replacePlatformFlags, validatePlatform } from '@tsrx/core';
import { resolveBuildPlatform, resolveTsconfigJsx } from '@tsrx/core/config';

const DEFAULT_INCLUDE = /\.tsrx$/;
const CSS_QUERY = '?tsrx-css&lang.css';
const CSS_QUERY_PATTERN = /\?tsrx-css&lang\.css$/;

/**
 * @typedef {{
 * 	include?: RegExp,
 * 	exclude?: RegExp | RegExp[],
 * 	jsxImportSource?: string,
 * 	suspenseSource?: string,
 * 	runtimeImports?: RuntimeImportMode,
 * 	platform?: Platform,
 * 	emitCss?: boolean,
 * }} TsrxPreactBunPluginOptions
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
 * @param {TsrxPreactBunPluginOptions} options
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
 * Bun plugin for `.tsrx` files that compiles them through `@tsrx/preact` and
 * then runs Bun's TSX transform so the final output calls Preact's automatic
 * JSX runtime. Component-local styles are exposed as virtual CSS modules.
 *
 * @param {TsrxPreactBunPluginOptions} [options]
 * @returns {BunPlugin}
 */
export function tsrxPreact(options = {}) {
	const explicit_platform = validatePlatform(options.platform);
	const jsx_import_source = options.jsxImportSource ?? 'preact';
	const emit_css = options.emitCss ?? true;

	/** @type {Map<string, string>} */
	const css_cache = new Map();

	return {
		name: '@tsrx/bun-plugin-preact',

		setup(build) {
			// build.config is only present for Bun.build(); runtime registration
			// via Bun.plugin(), including bun:test preloads, does not provide it.
			const build_config = build.config ?? {};
			const platform = resolveBuildPlatform({
				root: get_tsconfig_base(build_config),
				tsconfig: typeof build_config.tsconfig === 'string' ? build_config.tsconfig : undefined,
				platform: explicit_platform,
				integration: '@tsrx/bun-plugin-preact',
			});
			const compile_options = {
				suspenseSource: options.suspenseSource,
				runtimeImports: options.runtimeImports,
				platform,
			};
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

					return {
						contents: add_jsx_pragma(output, jsx_import_source, uses_classic_jsx(args.path)),
						loader: 'tsx',
					};
				},
			);
		},
	};
}

export default tsrxPreact;
