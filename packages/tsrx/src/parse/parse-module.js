/** @import * as AST from 'estree' */
/** @import { ParseOptions } from '../../types/index' */
/** @import { NonEmptyString } from '../../types/helpers' */

import * as acorn from 'acorn';
import { tsPlugin } from '@sveltejs/acorn-typescript';
import { createParser } from './index.js';
import { TSRXPlugin } from '../plugin.js';

const parse = createParser(TSRXPlugin());
const TSXParser = acorn.Parser.extend(tsPlugin({ jsx: true }), allow_unambiguous_arrow_type_params);
const TSParser = acorn.Parser.extend(tsPlugin());

/**
 * A constraint or default already tells a generic arrow function from JSX
 * (`<T extends object>(o: T) => o`), as the TSRX parser's override allows;
 * acorn-typescript reserves every single-parameter list without a trailing
 * comma.
 *
 * @param {typeof acorn.Parser} Parser
 * @returns {typeof acorn.Parser}
 */
function allow_unambiguous_arrow_type_params(Parser) {
	return class extends Parser {
		/** @param {AST.TSTypeParameterDeclaration} node */
		reportReservedArrowTypeParam(node) {
			const [param] = node.params;
			if (param?.constraint || param?.default) return;
			/** @type {any} */ (Parser.prototype).reportReservedArrowTypeParam.call(this, node);
		}
	};
}

/**
 * Parse source code to an ESTree AST using the TSRX parser.
 * @template {string} T
 * @param {string} source
 * @param {NonEmptyString<T>} filename
 * @param {ParseOptions} [options]
 * @returns {AST.Program}
 */
export function parse_module(source, filename, options) {
	return parse(source, filename, options);
}

/**
 * Parse an ordinary JavaScript or TypeScript module, or the TSX a TSRX compile
 * produced, with TypeScript's grammar rather than TSRX's: in JSX text, `/*`,
 * `//` and `@if` are text, and `.ts`, `.mts` and `.cts` files have no JSX, so
 * `<T>value` is a type assertion there. acorn-typescript lacks some syntax the
 * TSRX parser reads (phase imports, a trailing comma in `import()`), so a
 * module it rejects is read with the TSRX parser, and acorn-typescript's error
 * is thrown if that fails too.
 *
 * @param {string} source
 * @param {string} filename
 * @returns {AST.Program}
 */
export function parse_ordinary_module(source, filename) {
	try {
		const parser = /\.[cm]?ts$/.test(filename) ? TSParser : TSXParser;
		return /** @type {AST.Program} */ (
			/** @type {unknown} */ (
				parser.parse(source, {
					sourceType: 'module',
					ecmaVersion: 'latest',
					allowReturnOutsideFunction: true,
				})
			)
		);
	} catch (error) {
		try {
			return parse(source, /** @type {NonEmptyString<string>} */ (filename));
		} catch {
			throw error;
		}
	}
}
