---
'@tsrx/zed-plugin': patch
'@tsrx/nvim-plugin': patch
---

The tree-sitter grammar now parses more TypeScript expressions and types as TypeScript does:

- A call with type arguments on a parenthesized or `new` callee (`(f)<T>(x)`, `new Foo()<T>(x)`) is a `call_expression` with `type_arguments`. Before, it was read as `<` and `>` comparisons.
- A union or intersection type after `as` or `satisfies` (`el as HTMLInputElement | null`, `x satisfies A | B[]`, `x as A & B[]`) is read whole, as a `union_type` or `intersection_type`. Before, it was read as a `|` or `&` operator applied to `x as A`, and `B[]` had a missing-node error.
- Negative number literal types (`0 | -1`), template literal types (`` `id-${number}` ``, a `template_literal_type` with `template_type` substitutions) and constructor types (`new (a: A) => B`, `abstract new () => T`, a `constructor_type`) parse. Before, they were errors.

In Neovim, the `|` of a union type, the `&` of an intersection type and the `-` of a negative literal type are highlighted as operators, and a template literal type as a string. After updating the Neovim plugin, rebuild the parser with `:TSInstall! tsrx`.
