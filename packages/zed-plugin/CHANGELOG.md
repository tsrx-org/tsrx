# @tsrx/zed-plugin

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @tsrx/language-server@0.7.1

## 0.1.5

### Patch Changes

- [#1104](https://github.com/tsrx-org/tsrx/pull/1104)
  [`a283f9d`](https://github.com/tsrx-org/tsrx/commit/a283f9d49654d6a954539fcfe297f54d9b712a31)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The tree-sitter grammar
  now ends a `<script>` body where the compiler does, at `</script` followed by
  optional whitespace (a line break included) and `>`. Before, `</script >` was
  not seen as the closing tag and the script body parsed with errors. It also
  parses `using` and `await using` declarations (`using_declaration`), in
  statements, template scopes, `for…of` heads and `@for` heads, and highlights
  `using` as a declaration keyword. Before, they were parse errors. `using` as a
  variable name (`using(x)`, `using.dispose()`) parses as before. After updating
  the Neovim plugin, rebuild the parser with `:TSInstall! tsrx`.

- [#1180](https://github.com/tsrx-org/tsrx/pull/1180)
  [`985dbfd`](https://github.com/tsrx-org/tsrx/commit/985dbfd446b91c1fffb45b18a3ac5400d82bf137)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The tree-sitter grammar
  now ends a `<style>` body where the compiler does, at `</style` followed by
  optional whitespace (a line break included) and `>`, as it already did for
  `<script>`. Before, `</style >` was not seen as the closing tag and the file
  parsed as an error from the start.

  It also parses more TypeScript expressions as tree-sitter-typescript does:

  - A generic arrow function (`<T,>(x: T) => x`, `<T extends U>(x: T) => x`,
    `async <T, U = T>(x: T): U => x`) is an `arrow_function` with
    `type_parameters`. Before, the whole statement and the lines after it were an
    error.
  - A call with type arguments (`useState<Item[]>([])`, `obj.method<A, B>(x)`,
    ``sql<Row>`…` ``) is a `call_expression` with `type_arguments`, and its callee
    is highlighted as a function. Before, it was read as `<` and `>` comparisons,
    and `useState<Item[]>([])` had a missing-node error.
  - `value as T[]` and `value satisfies T[]` keep the `[]` in the type
    (`array_type`). Before, they were read as indexing `value as T`, with a
    missing-node error.

  After updating the Neovim plugin, rebuild the parser with `:TSInstall! tsrx`.

- [#1221](https://github.com/tsrx-org/tsrx/pull/1221)
  [`d43aac0`](https://github.com/tsrx-org/tsrx/commit/d43aac0e58a555426606c3f7caff38f94b3ed9f8)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The tree-sitter grammar
  now parses more TypeScript expressions and types as TypeScript does:

  - A call with type arguments on a parenthesized or `new` callee (`(f)<T>(x)`,
    `new Foo()<T>(x)`) is a `call_expression` with `type_arguments`. Before, it
    was read as `<` and `>` comparisons.
  - A union or intersection type after `as` or `satisfies`
    (`el as HTMLInputElement | null`, `x satisfies A | B[]`, `x as A & B[]`) is
    read whole, as a `union_type` or `intersection_type`. Before, it was read as a
    `|` or `&` operator applied to `x as A`, and `B[]` had a missing-node error.
  - Negative number literal types (`0 | -1`), template literal types
    (`` `id-${number}` ``, a `template_literal_type` with `template_type`
    substitutions) and constructor types (`new (a: A) => B`,
    `abstract new () => T`, a `constructor_type`) parse. Before, they were errors.

  In Neovim, the `|` of a union type, the `&` of an intersection type and the `-`
  of a negative literal type are highlighted as operators, and a template literal
  type as a string. After updating the Neovim plugin, rebuild the parser with
  `:TSInstall! tsrx`.

- Updated dependencies
  [[`1cf3c47`](https://github.com/tsrx-org/tsrx/commit/1cf3c47c2869a67797306655eae9ee2e4972d944),
  [`dd71454`](https://github.com/tsrx-org/tsrx/commit/dd71454b49d48fc83b7f014eade9e93b48c17818),
  [`180067b`](https://github.com/tsrx-org/tsrx/commit/180067b45544efd9638df0d981a05327e7f78a58),
  [`135ce77`](https://github.com/tsrx-org/tsrx/commit/135ce776f67596af641c8f2772d0321dbd73274e),
  [`910dbae`](https://github.com/tsrx-org/tsrx/commit/910dbaea2d709ff2f53bf800042c8914bd336939),
  [`b7b73e5`](https://github.com/tsrx-org/tsrx/commit/b7b73e566a458e4977ea52210627554d1b8bce07),
  [`1e58a65`](https://github.com/tsrx-org/tsrx/commit/1e58a65f2be6ff7d3aee1f4bff521d172b997159)]:
  - @tsrx/language-server@0.7.0

## 0.1.4

### Patch Changes

- [#1057](https://github.com/tsrx-org/tsrx/pull/1057)
  [`aa13392`](https://github.com/tsrx-org/tsrx/commit/aa133921a960761f79ee69adf18ab225eaf7a440)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The tree-sitter grammar now
  parses these without errors:

  - indexed access types (`Props['title']`), `typeof` and `keyof` in types, and
    `readonly` array and tuple types; `keyof` is highlighted as a keyword
  - `A | B[]` and `A & B[]` as a union or intersection with an array type, and
    `A | B & C` with `&` first, as TypeScript reads them
  - holes in arrays and array patterns (`[a, , b]`)
  - a type on a `catch` or `@catch` parameter
    (`@catch (err: Error, reset: () => void)`)
  - escapes in template strings (`` \` ``, `\${`, `\n`)
  - JSX text with `<` or `>` that does not start a tag (`1 < 2 > 0`), with an `@`
    that does not start a directive (`@tsrx/react`, `<code>@if</code>`), or that
    starts with `-` (`<code>--flag</code>`)

  Every `.tsrx` file in the TSRX repository now parses without errors.

- [#1057](https://github.com/tsrx-org/tsrx/pull/1057)
  [`aa13392`](https://github.com/tsrx-org/tsrx/commit/aa133921a960761f79ee69adf18ab225eaf7a440)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The tree-sitter grammar now
  parses a `<style>` or `<script>` block wherever an expression can go. This
  includes the parenthesized form the formatter writes for an assigned theme
  (`const theme = (<style>…</style>);`), `export default`, a return, an arrow body
  and an argument. Before, it parsed a block only right after `=`, and anywhere
  else it read the CSS as JSX. A `<style>` body now also ends only at `</style>`,
  so CSS that contains `<`, such as `@media (width < 600px)` or `content: '<'`,
  parses.

## 0.1.3

### Patch Changes

- Updated dependencies
  [[`defb663`](https://github.com/tsrx-org/tsrx/commit/defb6639445c76f617a2a080d8d0d00928962fe1),
  [`3322cec`](https://github.com/tsrx-org/tsrx/commit/3322ceca85280c493625e58e92b987bbb3925249)]:
  - @tsrx/language-server@0.6.3

## 0.1.2

### Patch Changes

- Updated dependencies
  [[`e806335`](https://github.com/tsrx-org/tsrx/commit/e806335fc4ab663c7746e5e946cec72761db7659),
  [`87c8835`](https://github.com/tsrx-org/tsrx/commit/87c88350c4e3d0f5b6ecc1ce60a31a957fa565ac),
  [`495323e`](https://github.com/tsrx-org/tsrx/commit/495323ee83e9a454e59e5b2a2b3d53e76e5d9588)]:
  - @tsrx/language-server@0.6.2

## 0.1.1

### Patch Changes

- [#132](https://github.com/tsrx-org/tsrx/pull/132)
  [`bbda4d2`](https://github.com/tsrx-org/tsrx/commit/bbda4d20cefba9504b92cddbb64955443fcdcca3)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Support TypeScript
  `satisfies` expressions and postfix non-null assertions in the Tree-sitter
  grammar and editor highlighting, including their precedence and assignment
  targets. Prevent template-string scanning from consuming later declarations
  during error recovery.

## 0.1.0

### Minor Changes

- [#110](https://github.com/tsrx-org/tsrx/pull/110)
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Remove the `&{ ... }` /
  `&[ ... ]` lazy destructuring rules from the TextMate and Tree-sitter grammars
  and highlight queries, per
  [RFC #106](https://github.com/tsrx-org/tsrx/discussions/106).

## 0.0.88

### Patch Changes

- [#53](https://github.com/tsrx-org/tsrx/pull/53)
  [`8efcbc8`](https://github.com/tsrx-org/tsrx/commit/8efcbc85bc3910531715f51c9f592588c2464f4c)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Highlight self-closing
  `<style apply={…} />` blocks and `<style>` blocks in every template position of
  `@{ … }` and directive bodies.

## 0.0.87

### Patch Changes

- Move the TSRX Zed extension source and grammar to `tsrx-org/tsrx` and use the
  renamed TSRX language server, grammar, and language identifiers.

## 0.0.86

### Patch Changes

- [#1420](https://github.com/Ripple-TS/ripple/pull/1420)
  [`c182962`](https://github.com/Ripple-TS/ripple/commit/c182962f27ad022db6d7c48244e7d2df471df1c8)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Publish Zed extension updates
  automatically through the Zed extensions registry whenever the extension version
  changes.
