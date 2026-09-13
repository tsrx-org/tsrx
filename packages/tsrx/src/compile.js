/** @import * as AST from 'estree' */
/** @import { BaseCompileOptions, CompileError, JsxPlatform, ParseOptions, TargetCompiler, VolarMappingsResult } from '../types/index' */
/** @import { NonEmptyString } from '../types/helpers' */

import { analyze_tsrx } from './analyze/index.js';
import { parse_module } from './parse/parse-module.js';
import { createJsxTransform } from './transform/jsx/index.js';
import {
	has_platform_namespace,
	specialize_platform,
	with_platform_types,
} from './transform/platform.js';
import { create_volar_mappings_result } from './transform/segments.js';

/**
 * Build a target package's `parse` / `compile` / `compile_to_volar_mappings`
 * entry points from its platform descriptor. The pipeline — diagnostics
 * collection, platform specialization, analysis, and the Volar type-only
 * variant — is identical across targets; the descriptor (consumed by
 * `createJsxTransform`) is the only per-target input.
 *
 * @template [TOptions=BaseCompileOptions]
 * @param {JsxPlatform} platform
 * @returns {TargetCompiler<TOptions>}
 */
export function create_target_compiler(platform) {
	const transform = createJsxTransform(platform);

	/**
	 * @template {string} T
	 * @param {string} source
	 * @param {NonEmptyString<T>} filename
	 * @param {BaseCompileOptions} [options]
	 * @returns {import('../types/index').CompileResult}
	 */
	function compile(source, filename, options) {
		const errors = /** @type {CompileError[]} */ ([]);
		const comments = /** @type {AST.CommentWithLocation[]} */ ([]);
		const collect = !!(options?.collect || options?.loose);
		let ast = parse_module(
			source,
			filename,
			collect ? { collect: true, loose: !!options?.loose, errors, comments } : undefined,
		);
		ast = specialize_platform(
			ast,
			options?.platform,
			filename,
			collect ? { errors, comments } : undefined,
		);
		analyze_tsrx(
			ast,
			filename,
			collect ? { collect: true, loose: !!options?.loose, errors, comments } : undefined,
		);
		const { ast: _ast, ...result } = transform(
			ast,
			source,
			filename,
			collect ? { ...options, collect: true, loose: !!options?.loose, errors, comments } : options,
		);
		return { ...result, errors };
	}

	/**
	 * The editor-facing variant: always collects diagnostics, parses with
	 * Volar-grade fidelity, runs the type-only transform, and forces
	 * `moduleScopedHookComponents` off so helper components stay in the
	 * component scope where TypeScript can resolve closure-captured types.
	 *
	 * @template {string} T
	 * @param {string} source
	 * @param {NonEmptyString<T>} filename
	 * @param {ParseOptions & BaseCompileOptions} [options]
	 * @returns {VolarMappingsResult}
	 */
	function compile_to_volar_mappings(source, filename, options) {
		const errors = /** @type {CompileError[]} */ ([]);
		const comments = /** @type {AST.CommentWithLocation[]} */ ([]);
		let ast = parse_module(source, filename, {
			...options,
			collect: true,
			loose: !!options?.loose,
			preserveParens: true,
			keywordTokens: true,
			errors,
			comments,
		});
		const uses_platform_flags = has_platform_namespace(ast);
		ast = specialize_platform(ast, options?.platform, filename, { errors, comments });
		analyze_tsrx(ast, filename, {
			collect: true,
			loose: !!options?.loose,
			typeOnly: true,
			errors,
			comments,
		});
		const transformed = transform(ast, source, filename, {
			...options,
			collect: true,
			loose: !!options?.loose,
			moduleScopedHookComponents: false,
			typeOnly: true,
			errors,
			comments,
		});
		const result = create_volar_mappings_result({
			ast: transformed.ast,
			ast_from_source: ast,
			source,
			generated_code: transformed.code,
			source_map: transformed.map,
			errors,
		});
		return uses_platform_flags ? with_platform_types(result, options?.platform) : result;
	}

	return /** @type {TargetCompiler<TOptions>} */ ({
		parse: parse_module,
		compile,
		compile_to_volar_mappings,
	});
}
