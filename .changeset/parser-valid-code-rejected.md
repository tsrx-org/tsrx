---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser accepts four kinds of valid code that it rejected:

- `var` in a `catch` block can redeclare a catch parameter that is a plain name
  (`catch (error) { var error = 2; }`), as Annex B allows, instead of failing
  with `Identifier 'error' has already been declared`. A destructured parameter
  still can't be redeclared, as in JavaScript.
- An `export { … }` or `export type { … }` list can name a namespace, an
  interface, a type alias, or an ambient function declared in the module
  (`interface Props {} export type { Props };`), instead of failing with
  `Export 'Props' is not defined`.
- Import attributes can have more than one quoted key
  (`with { 'a': 'x', 'b': 'y' }`) instead of failing with
  `Duplicated key in attributes`, and a key written once quoted and once as a
  name (`type` and `'type'`) is now reported as a duplicate.
- `import()` takes a trailing comma after the module specifier or after the
  options (`import("./a.js",)`), like `import.defer()`. As in acorn and
  typescript-estree, the options of an ordinary `import()` are now on the
  `ImportExpression`'s `options` instead of `arguments`, and a third argument is
  a syntax error instead of a sequence expression.

The formatter formats these, and prints `import()` without the trailing comma,
like Prettier.
