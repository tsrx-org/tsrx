---
'@tsrx/core': patch
'@tsrx/content-mapper': patch
'@tsrx/language-server': patch
---

Each unclosed tag's TSRX1001 is now reported on its own tag, not all of them at the token that ends the template. In `<main><section>`, the editor and TypeScript 7's `tsc --runExternalCode` show one error on `main` and one on `section`. Before, the editor showed both on the `>` of `<section>`, and TypeScript 7 showed both at the `}`. At module level or inside a closed parent, they show an unclosed `<style>` or `<script>` on its opening tag.

The change is to collected errors, so `@tsrx/prettier-plugin` and `@tsrx/eslint-parser`, which report the first one, now report an unclosed element or fragment at the tag as well: `const y = <div>` is reported at `1:12`, where Prettier's `typescript` parser reports it, and no longer at `2:1`. A collected error's `raisedAt` doesn't move. A strict compile, the one builds run, throws the same error at the same place as before.

A `<>` has no mapping in a template, so the language server shows an unclosed one on the nearest code it can. That's its first child when the child has a mapping, as in `<><div>` and `<>{1}`, and otherwise the code before it, as with `<>` and `<>hello`. TypeScript 7 shows it on the `<>`.

Inside a function or class, the TypeScript 7 language server's other diagnostics are unchanged: an unclosed tag still hides TypeScript's errors in the code around it until it's closed, as its closing tag has no mapping. At module level, where nothing hid them before, it now hides them in its own declaration. So `export const y = <Missing>` no longer repeats TS2304 beside the TSRX1001, but `export const n: number = 'x', y = <div>` hides the TS2322 on `n` until the tag is closed.
