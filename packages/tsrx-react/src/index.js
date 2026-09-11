/** @import * as AST from 'estree' */
/** @import { BaseCompileOptions, CompileError, CompileResult, ParseOptions, VolarMappingsResult } from '@tsrx/core/types' */
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
import { transform } from './transform.js';

export { isRefProp } from './ref.js';

/**
 * Parse tsrx-react source code to an ESTree AST.
 * @template {string} T
 * @param {string} source
 * @param {NonEmptyString<T>} filename
 * @param {ParseOptions} [options]
 * @returns {AST.Program}
 */
export function parse(source, filename, options) {
	return parseModule(source, filename, options);
}

/**
 * Compile tsrx-react source code to a TSX/JSX module suitable for use with
 * React's automatic jsx runtime (consumed by a downstream JSX transform).
 *
 * @template {string} T
 * @param {string} source
 * @param {NonEmptyString<T>} filename
 * @param {BaseCompileOptions} [options]
 * @returns {CompileResult}
 */
export function compile(source, filename, options) {
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
	analyzeTsrx(
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
 * Compile tsrx-react source to virtual TSX plus Volar mappings for editor tooling.
 *
 * @template {string} T
 * @param {string} source
 * @param {NonEmptyString<T>} filename
 * @param {ParseOptions & BaseCompileOptions} [options]
 * @returns {VolarMappingsResult}
 */
export function compile_to_volar_mappings(source, filename, options) {
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
	analyzeTsrx(ast, filename, {
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
		typeOnly: true,
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
