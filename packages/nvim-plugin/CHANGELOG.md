# @tsrx/nvim-plugin

## 0.0.85

### Patch Changes

- [#1319](https://github.com/tsrx-org/tsrx/pull/1319)
  [`ff67a15`](https://github.com/tsrx-org/tsrx/commit/ff67a1505986a9feafa8aa8c447ffc3293348224)
  Thanks [@github-actions](https://github.com/apps/github-actions)! - Install
  `@tsrx/language-server` 0.7.0 when a project has no server of its own.

## 0.0.84

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

## 0.0.83

### Patch Changes

- [#1060](https://github.com/tsrx-org/tsrx/pull/1060)
  [`bc439e9`](https://github.com/tsrx-org/tsrx/commit/bc439e9da1c6eeedb9fa75b389bbdc7e6a703550)
  Thanks [@leonidaz](https://github.com/leonidaz)! - The tree-sitter grammar
  parses `<style>` and `<script>` blocks wherever an expression can go, including
  the parenthesized form the formatter writes for an assigned theme, and CSS that
  contains `<`. It also parses indexed access types, `typeof` and `keyof` in
  types, `readonly` array types, holes in arrays, typed `@catch` parameters,
  template string escapes, and JSX text with `<`, `@` or a leading `-`
  ([#1057](https://github.com/tsrx-org/tsrx/pull/1057)). `keyof` is highlighted as
  a keyword. After updating the plugin, rebuild the parser with
  `:TSInstall! tsrx`.
