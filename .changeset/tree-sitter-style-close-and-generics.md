---
'@tsrx/zed-plugin': patch
'@tsrx/nvim-plugin': patch
---

The tree-sitter grammar now ends a `<style>` body where the compiler does, at `</style` followed by optional whitespace (a line break included) and `>`, as it already did for `<script>`. Before, `</style >` was not seen as the closing tag and the file parsed as an error from the start.

It also parses more TypeScript expressions as tree-sitter-typescript does:

- A generic arrow function (`<T,>(x: T) => x`, `<T extends U>(x: T) => x`, `async <T, U = T>(x: T): U => x`) is an `arrow_function` with `type_parameters`. Before, the whole statement and the lines after it were an error.
- A call with type arguments (`useState<Item[]>([])`, `obj.method<A, B>(x)`, ``sql<Row>`…` ``) is a `call_expression` with `type_arguments`, and its callee is highlighted as a function. Before, it was read as `<` and `>` comparisons, and `useState<Item[]>([])` had a missing-node error.
- `value as T[]` and `value satisfies T[]` keep the `[]` in the type (`array_type`). Before, they were read as indexing `value as T`, with a missing-node error.

After updating the Neovim plugin, rebuild the parser with `:TSInstall! tsrx`.
