/**
 * @typedef {{
 *   reason: string,
 *   skip?: boolean,
 *   tsx?: boolean,
 *   input?: string,
 *   output?: string,
 * }} Override
 */

/**
 * `.tsrx` files are parsed like `.tsx` files. Prettier writes a lone type
 * parameter of an arrow function as `<T,>` everywhere except in `.ts` files, so
 * that `<T>` isn't read as a JSX tag.
 * @type {Override}
 */
const tsxTypeParameter = {
	reason: 'TSRX is TSX: a lone arrow-function type parameter keeps its comma (`<T,>`)',
	tsx: true,
};

/** @type {Override} */
const commonJsAwait = {
	reason: 'A `.tsrx` file is a module, where `await(1)` is an await expression, not a call',
	skip: true,
};

/** @type {Override} */
const commentInJsxChildren = {
	reason:
		'In TSRX, `//` and `/* */` between JSX children are comments, which keep their line; TSX reads them as text',
	output: `<Foo>
  text
  // comment
  text
</Foo>;
`,
};

/**
 * Prettier test cases whose TSRX result deliberately differs from Prettier's
 * snapshot, keyed like `prettier-known-failures.json` (`<dir>/<snapshot
 * title>`). An override gives the reason, and then either skips the case,
 * expects what Prettier prints for the input as a `.tsx` file (`tsx`), or
 * replaces the input and/or the expected output.
 *
 * @type {Record<string, Override>}
 */
export default {
	'typescript/tsx/comma/snippet: test.ts format 1': tsxTypeParameter,

	'jsx/comments/like-a-comment-in-jsx-text.js - {"bracketSameLine":true} format 1':
		commentInJsxChildren,

	'js/top-level-await/test.cjs format 1': commonJsAwait,
	'typescript/top-level-await/test.cts format 1': commonJsAwait,
};
