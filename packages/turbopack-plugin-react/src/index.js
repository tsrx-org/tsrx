/** @import { Platform, RuntimeImportMode } from '@tsrx/react' */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlatform } from '@tsrx/core';
import { resolveBuildPlatform } from '@tsrx/core/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TURBOPACK_JS_LOADER = path.join(__dirname, 'loader.js');
const TURBOPACK_CSS_LOADER = path.join(__dirname, 'css-loader.js');
const TURBOPACK_PLATFORM_LOADER = path.join(__dirname, 'platform-loader.js');
const DEFAULT_RESOLVE_EXTENSIONS = ['.tsrx', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'];
const CSS_QUERY = '?tsrx-css&lang.css';
const PLATFORM_SOURCE_GLOBS = [
	'*.js',
	'*.jsx',
	'*.mjs',
	'*.cjs',
	'*.ts',
	'*.tsx',
	'*.mts',
	'*.cts',
];

/**
 * @typedef {{
 * 	turbopack?: {
 * 		root?: string,
 * 		rules?: Record<string, any>,
 * 		resolveAlias?: Record<string, any>,
 * 		resolveExtensions?: string[],
 * 		debugIds?: boolean,
 * 	},
 * 	typescript?: { tsconfigPath?: string },
 * 	[key: string]: any,
 * }} NextTurbopackConfig
 */

/**
 * @typedef {{ runtimeImports?: RuntimeImportMode, platform?: Platform, tsconfig?: string }} TsrxReactTurbopackOptions
 */

/** @param {TsrxReactTurbopackOptions} options @returns {TsrxReactTurbopackOptions} */
function normalize_options(options) {
	return { ...options, platform: validatePlatform(options.platform) };
}

/**
 * @param {TsrxReactTurbopackOptions} [options]
 * @returns {{ condition: { all: any[] }, loaders: Array<string | { loader: string, options: TsrxReactTurbopackOptions }>, as: string }}
 */
export function create_tsrx_react_turbopack_rule(options = {}) {
	options = normalize_options(options);
	const loaders = [with_loader_options(TURBOPACK_JS_LOADER, options)];
	if (options.platform !== undefined) {
		// Webpack-compatible loaders execute right-to-left: compile TSRX first,
		// then replace flags that intentionally remain in runtime expressions.
		loaders.unshift({ loader: TURBOPACK_PLATFORM_LOADER, options: { platform: options.platform } });
	}
	return {
		condition: {
			all: [{ not: 'foreign' }, { not: { query: CSS_QUERY } }],
		},
		loaders,
		as: '*.tsx',
	};
}

/**
 * @param {TsrxReactTurbopackOptions} [options]
 * @returns {{ condition: { all: any[] }, loaders: Array<string | { loader: string, options: TsrxReactTurbopackOptions }>, type: string }}
 */
export function create_tsrx_react_turbopack_css_rule(options = {}) {
	options = normalize_options(options);
	return {
		condition: {
			all: [{ not: 'foreign' }, { query: CSS_QUERY }],
		},
		loaders: [with_loader_options(TURBOPACK_CSS_LOADER, options)],
		type: 'css',
	};
}

/**
 * Preserve the original string loader shape unless the caller has compiler
 * options that Turbopack needs to pass into the loader.
 *
 * @param {string} loader
 * @param {TsrxReactTurbopackOptions} options
 * @returns {string | { loader: string, options: TsrxReactTurbopackOptions }}
 */
function with_loader_options(loader, options) {
	return options.runtimeImports === undefined && options.platform === undefined
		? loader
		: { loader, options };
}

/** @param {TsrxReactTurbopackOptions} options */
function create_platform_rule(options) {
	return {
		condition: { all: [{ not: 'foreign' }] },
		loaders: [{ loader: TURBOPACK_PLATFORM_LOADER, options: { platform: options.platform } }],
	};
}

/**
 * @param {string[] | undefined} resolve_extensions
 * @returns {string[]}
 */
function merge_resolve_extensions(resolve_extensions) {
	const merged = resolve_extensions ? [...resolve_extensions] : [...DEFAULT_RESOLVE_EXTENSIONS];
	if (!merged.includes('.tsrx')) {
		merged.unshift('.tsrx');
	}
	return merged;
}

/**
 * @param {any} existing_rule
 * @param {TsrxReactTurbopackOptions} options
 * @returns {any}
 */
function merge_tsrx_rule(existing_rule, options) {
	const rules = [
		create_tsrx_react_turbopack_rule(options),
		create_tsrx_react_turbopack_css_rule(options),
	];
	if (!existing_rule) return rules;
	return Array.isArray(existing_rule) ? [...rules, ...existing_rule] : [...rules, existing_rule];
}

/**
 * Merge the Turbopack settings needed for `.tsrx` React modules into a Next.js
 * config object.
 *
 * The helper installs loader-backed `*.tsrx` rules that compile TSRX to TSX,
 * route component-local `<style>` blocks through a sibling virtual CSS import,
 * and then hand the TSX output back to Turbopack so Next's React pipeline can
 * finish the JSX transform.
 *
 * @param {NextTurbopackConfig} [next_config]
 * @param {TsrxReactTurbopackOptions} [options]
 * @returns {NextTurbopackConfig}
 */
export function tsrxReactTurbopack(next_config = {}, options = {}) {
	options = normalize_options(options);
	const turbopack = next_config.turbopack ?? {};
	options.platform = resolveBuildPlatform({
		root: turbopack.root ?? process.cwd(),
		tsconfig: options.tsconfig ?? next_config.typescript?.tsconfigPath,
		platform: options.platform,
		integration: '@tsrx/turbopack-plugin-react',
	});
	const rules = { ...(turbopack.rules ?? {}) };
	rules['*.tsrx'] = merge_tsrx_rule(rules['*.tsrx'], options);
	if (options.platform !== undefined) {
		for (const glob of PLATFORM_SOURCE_GLOBS) {
			const platform_rule = create_platform_rule(options);
			const existing_rule = rules[glob];
			rules[glob] = existing_rule
				? Array.isArray(existing_rule)
					? [platform_rule, ...existing_rule]
					: [platform_rule, existing_rule]
				: platform_rule;
		}
	}

	return {
		...next_config,
		turbopack: {
			...turbopack,
			rules,
			resolveExtensions: merge_resolve_extensions(turbopack.resolveExtensions),
		},
	};
}

export default tsrxReactTurbopack;
