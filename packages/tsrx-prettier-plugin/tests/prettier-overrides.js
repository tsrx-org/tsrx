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
 * Destructuring private fields (`const { #x: x } = this`) is a TC39 Stage 2
 * proposal. TSRX parses it once it becomes part of JavaScript; until then
 * these cases are skipped (#424).
 * @type {Override}
 */
const privateFieldDestructuring = {
	reason: 'Destructuring private fields is a Stage 2 proposal, not yet JavaScript (#424)',
	skip: true,
};

/**
 * TypeScript's parser accepts these inputs only through its error recovery (an
 * index signature with several parameters or none, JSDoc-only types such as
 * `?string`) and reports them as syntax errors. TSRX reports them as syntax
 * errors too, without recovering (#415).
 * @type {Override}
 */
const errorRecovery = {
	reason:
		"Only TypeScript's error recovery parses this input; TSRX reports the syntax error (#415)",
	skip: true,
};

/**
 * In TSRX, a `<` that starts a line starts an element, even after a name, which
 * is what lets a template statement without a semicolon be followed by an
 * element. `foo` followed by `<string>(1)` on the next line is two statements.
 * @type {Override}
 */
const lineStartElement = {
	reason:
		'TSRX reads a `<` that starts a line as an element, so `<string>(1)` on the line after a callee is an element',
	skip: true,
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

	'js/babel-plugins/destructuring-private.js format 1': privateFieldDestructuring,
	'js/destructuring-private-fields/arrow-params.js format 1': privateFieldDestructuring,
	'js/destructuring-private-fields/assignment.js format 1': privateFieldDestructuring,
	'js/destructuring-private-fields/async-arrow-params.js format 1': privateFieldDestructuring,
	'js/destructuring-private-fields/bindings.js format 1': privateFieldDestructuring,
	'js/destructuring-private-fields/for-lhs.js format 1': privateFieldDestructuring,
	'js/destructuring-private-fields/nested-bindings.js format 1': privateFieldDestructuring,
	'js/destructuring-private-fields/valid-multiple-bindings.js format 1': privateFieldDestructuring,

	'js/top-level-await/test.cjs format 1': commonJsAwait,
	'typescript/top-level-await/test.cts format 1': commonJsAwait,

	'typescript/call/callee-comments.ts format 1': lineStartElement,

	'typescript/error-recovery/index-signature.ts format 1': errorRecovery,
	'typescript/error-recovery/index-signature.ts - {"trailingComma":"all"} format 1': errorRecovery,
	'typescript/error-recovery/index-signature.ts - {"trailingComma":"es5"} format 1': errorRecovery,
	'typescript/error-recovery/jsdoc_only_types.ts format 1': errorRecovery,
	'typescript/error-recovery/jsdoc_only_types.ts - {"trailingComma":"all"} format 1': errorRecovery,
	'typescript/error-recovery/jsdoc_only_types.ts - {"trailingComma":"es5"} format 1': errorRecovery,
};
