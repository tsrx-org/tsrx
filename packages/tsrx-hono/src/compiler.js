/** @import * as AST from 'estree' */
/** @import { BaseCompileOptions, CompileError, CompileResult, JsxTransformOptions, JsxTransformResult, ParseOptions, TSRXAnalysisResult, VolarMappingsResult } from '@tsrx/core/types' */
/** @import { NonEmptyString } from '@tsrx/core/types/helpers' */

import {
	analyzeTsrx,
	createVolarMappingsResult,
	dedupeMappings,
	hasPlatformNamespace,
	parseModule,
	specializePlatform,
	withPlatformTypes,
} from '@tsrx/core';

/**
 * Create the public compiler facade shared by the Hono server and DOM targets.
 *
 * @param {(ast: AST.Program, source: string, filename?: string, options?: JsxTransformOptions) => JsxTransformResult} transform
 * @param {{ validate?: (ast: AST.Program, filename: NonEmptyString<string>, context: { source: string, errors?: CompileError[], comments: AST.CommentWithLocation[], collect: boolean, analysis: TSRXAnalysisResult }) => void }} [settings]
 */
export function createCompiler(transform, settings = {}) {
	/**
	 * @param {string} source
	 * @param {NonEmptyString<string>} filename
	 * @param {ParseOptions} [options]
	 * @returns {AST.Program}
	 */
	function parse(source, filename, options) {
		return parseModule(source, filename, options);
	}

	/**
	 * @param {string} source
	 * @param {NonEmptyString<string>} filename
	 * @param {BaseCompileOptions} [options]
	 * @returns {CompileResult}
	 */
	function compile(source, filename, options) {
		const errors = /** @type {CompileError[]} */ ([]);
		const comments = /** @type {AST.CommentWithLocation[]} */ ([]);
		const collect = !!(options?.collect || options?.loose);
		let ast = parseModule(
			source,
			filename,
			collect ? { collect: true, loose: !!options?.loose, errors, comments } : undefined,
		);
		ast = specializePlatform(
			ast,
			options?.platform,
			filename,
			collect ? { errors, comments } : undefined,
		);
		const analysis = analyzeTsrx(
			ast,
			filename,
			collect ? { collect: true, loose: !!options?.loose, errors, comments } : undefined,
		);
		settings.validate?.(ast, filename, {
			source,
			errors: collect ? errors : undefined,
			comments,
			collect,
			analysis,
		});
		const { ast: _ast, ...result } = transform(
			ast,
			source,
			filename,
			collect ? { ...options, collect: true, loose: !!options?.loose, errors, comments } : options,
		);
		return { ...result, errors };
	}

	/**
	 * @param {string} source
	 * @param {NonEmptyString<string>} filename
	 * @param {ParseOptions & BaseCompileOptions} [options]
	 * @returns {VolarMappingsResult}
	 */
	function compile_to_volar_mappings(source, filename, options) {
		const errors = /** @type {CompileError[]} */ ([]);
		const comments = /** @type {AST.CommentWithLocation[]} */ ([]);
		let ast = parseModule(source, filename, {
			...options,
			collect: true,
			loose: !!options?.loose,
			preserveParens: true,
			keywordTokens: true,
			errors,
			comments,
		});
		const uses_platform_flags = hasPlatformNamespace(ast);
		ast = specializePlatform(ast, options?.platform, filename, { errors, comments });
		const analysis = analyzeTsrx(ast, filename, {
			collect: true,
			loose: !!options?.loose,
			typeOnly: true,
			errors,
			comments,
		});
		settings.validate?.(ast, filename, { source, errors, comments, collect: true, analysis });
		const transformed = transform(ast, source, filename, {
			...options,
			collect: true,
			loose: !!options?.loose,
			typeOnly: true,
			moduleScopedHookComponents: false,
			errors,
			comments,
		});
		const result = createVolarMappingsResult({
			ast: transformed.ast,
			ast_from_source: ast,
			source,
			generated_code: transformed.code,
			source_map: transformed.map,
			errors,
		});

		const deduped = {
			...result,
			mappings: dedupeMappings(result.mappings),
		};

		return uses_platform_flags ? withPlatformTypes(deduped, options?.platform) : deduped;
	}

	return { parse, compile, compile_to_volar_mappings };
}
