/** @import * as AST from 'estree' */
/** @import { Parse } from '../../types/parse' */

import { parse_module } from './parse-module.js';

/** @type {WeakMap<AST.Program, Parse.Token[] | undefined>} */
const reparsed_tokens = new WeakMap();

/**
 * The parser's tokens for `ast`: the ones `keywordTokens` recorded, or, for a
 * program parsed without that option, the tokens of a second parse of
 * `source`. The editor output needs them to map the keywords and punctuation
 * it writes back to the source. A source the TSRX parser cannot read yields
 * none, and those mappings are left out rather than failing the whole result.
 * @param {AST.Program} ast
 * @param {string} source
 * @returns {Parse.Token[] | undefined}
 */
export function get_source_tokens(ast, source) {
	if (ast.tsrx_tokens) return ast.tsrx_tokens;
	if (!reparsed_tokens.has(ast)) {
		/** @type {Parse.Token[] | undefined} */
		let tokens;
		try {
			tokens = parse_module(source, 'App.tsrx', {
				keywordTokens: true,
				collect: true,
				loose: true,
			}).tsrx_tokens;
		} catch {
			tokens = undefined;
		}
		reparsed_tokens.set(ast, tokens);
	}
	return reparsed_tokens.get(ast);
}
