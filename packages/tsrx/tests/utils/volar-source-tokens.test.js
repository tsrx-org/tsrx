/** @import * as AST from 'estree' */
/** @import { CodeMapping, CompileError, JsxPlatform } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { createJsxTransform, createVolarMappingsResult, parseModule } from '../../src/index.js';

/**
 * The `class` keyword, a `satisfies` keyword and a computed key's brackets
 * map from the parser's tokens, which `parseModule` records only with
 * `keywordTokens: true`. A target that builds Volar mappings from a parse
 * without that option must still get them.
 */

/** @type {JsxPlatform} */
const PLATFORM = {
	name: 'volar-source-tokens-test',
	imports: {
		fragment: 'test-platform',
		suspense: 'test-platform',
		dynamic: 'test-platform/dynamic',
		errorBoundary: 'test-platform/error-boundary',
	},
	jsx: { rewriteClassAttr: false, classAttrName: 'class' },
	validation: { requireUseServerForAwait: false },
};

/**
 * @param {string} source
 * @param {boolean} keyword_tokens
 * @returns {CodeMapping[]}
 */
function volar_mappings(source, keyword_tokens) {
	/** @type {CompileError[]} */
	const errors = [];
	/** @type {AST.CommentWithLocation[]} */
	const comments = [];
	const ast = parseModule(source, 'App.tsrx', {
		collect: true,
		loose: true,
		preserveParens: true,
		keywordTokens: keyword_tokens,
		errors,
		comments,
	});
	const transformed = createJsxTransform(PLATFORM)(ast, source, 'App.tsrx', {
		collect: true,
		loose: true,
		typeOnly: true,
		errors,
		comments,
	});
	return createVolarMappingsResult({
		ast: transformed.ast,
		ast_from_source: ast,
		source,
		generated_code: transformed.code,
		source_map: transformed.map,
		errors,
	}).mappings;
}

/**
 * The mapping whose authored span starts at `text`'s first offset at or after
 * `from` and covers exactly `text`.
 * @param {string} source
 * @param {CodeMapping[]} mappings
 * @param {string} text
 * @param {number} [from]
 */
function mapping_for(source, mappings, text, from = 0) {
	const offset = source.indexOf(text, from);
	return mappings.find(
		(mapping) => mapping.sourceOffsets[0] === offset && mapping.lengths[0] === text.length,
	);
}

describe('Volar mappings from a parse without keywordTokens', () => {
	const source = `declare function dec(...args: unknown[]): any;
declare const count: number;
declare const key: string;
@dec class Store {
	[ key ]() {}
}
export const checked = count satisfies number;
`;

	it.each([
		['class', 'class'],
		['satisfies', 'satisfies'],
		['[ key ]', '[ key ]'],
	])('maps %s the same as a parse that records tokens', (_name, text) => {
		const with_tokens = mapping_for(
			source,
			volar_mappings(source, true),
			text,
			source.indexOf('@dec'),
		);
		const without_tokens = mapping_for(
			source,
			volar_mappings(source, false),
			text,
			source.indexOf('@dec'),
		);

		expect(with_tokens).toBeDefined();
		expect(without_tokens?.generatedOffsets).toEqual(with_tokens?.generatedOffsets);
		expect(without_tokens?.generatedLengths).toEqual(with_tokens?.generatedLengths);
	});
});
