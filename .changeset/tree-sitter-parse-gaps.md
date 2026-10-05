---
'@tsrx/zed-plugin': patch
---

The tree-sitter grammar now parses these without errors:

- indexed access types (`Props['title']`), `typeof` and `keyof` in types, and `readonly` array and tuple types; `keyof` is highlighted as a keyword
- `A | B[]` and `A & B[]` as a union or intersection with an array type, and `A | B & C` with `&` first, as TypeScript reads them
- holes in arrays and array patterns (`[a, , b]`)
- a type on a `catch` or `@catch` parameter (`@catch (err: Error, reset: () => void)`)
- escapes in template strings (`` \` ``, `\${`, `\n`)
- JSX text with `<` or `>` that does not start a tag (`1 < 2 > 0`), with an `@` that does not start a directive (`@tsrx/react`, `<code>@if</code>`), or that starts with `-` (`<code>--flag</code>`)

Every `.tsrx` file in the TSRX repository now parses without errors.
