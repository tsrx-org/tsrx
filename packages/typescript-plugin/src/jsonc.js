/**
 * A JSON-with-comments reader for `tsconfig.json` and package manifests:
 * comments and trailing commas are allowed, as TypeScript allows them. The
 * parsing is Microsoft's `jsonc-parser` (the same scanner VS Code and
 * get-tsconfig use), so what parses here parses there.
 */

// The ESM build: the package's UMD `main` requires its `./impl/*` files at run
// time, which the bundles of the mapper, the language server and the VS Code
// extension cannot follow (the package has no `exports` map, so the path is
// public).
// A runtime dependency of every package that bundles this module (the mapper,
// the language server, the VS Code extension): its UMD entry requires its
// `./impl/*` files at run time, which a bundle cannot follow.
import { parse, printParseErrorCode } from 'jsonc-parser';

/**
 * @typedef {object} JsoncParseResult
 * @property {unknown} value `undefined` when the text does not parse.
 * @property {{ message: string, offset: number }} [error] The first parse error.
 */

/**
 * @param {string} text
 * @returns {JsoncParseResult}
 */
export function parse_jsonc(text) {
	const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	if (source.trim() === '') {
		// An empty config file is an empty object, as for TypeScript.
		return { value: {} };
	}
	/** @type {import('jsonc-parser').ParseError[]} */
	const errors = [];
	const value = parse(source, errors, { allowTrailingComma: true, disallowComments: false });
	if (errors.length > 0) {
		const [first] = errors;
		return {
			value: undefined,
			error: {
				message: `${printParseErrorCode(first.error)} at offset ${first.offset}`,
				offset: first.offset,
			},
		};
	}
	return { value };
}
