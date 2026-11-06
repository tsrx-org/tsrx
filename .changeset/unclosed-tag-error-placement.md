---
'@tsrx/core': patch
'@tsrx/content-mapper': patch
'@tsrx/language-server': patch
---

Each unclosed tag's TSRX1001 is now reported on its own tag, not all of them at the token that ends the template. In `<main><section>`, the editor and TypeScript 7's `tsc --runExternalCode` show one error on `main` and one on `section`. Before, the editor showed both on the `>` of `<section>`, and TypeScript 7 showed both at the `}`. They show an unclosed `<style>` or `<script>` on its opening tag, not on the first character of its body.

The change is to collected errors, so `@tsrx/prettier-plugin` and `@tsrx/eslint-parser`, which report the first one, now report an unclosed element or fragment at the tag as well: `const y = <div>` is reported at `1:12`, where Prettier's `typescript` parser reports it, and no longer at `2:1`. A collected error's `raisedAt` doesn't move. A strict compile, the one builds run, throws the same error at the same place as before.

A `<>` has no mapping in a template, so the language server shows an unclosed one on the code nearest it: usually its first child, or the code before it when it has no children. TypeScript 7 shows it on the `<>`.

Inside a function, TypeScript 7's other diagnostics are unchanged: an unclosed tag still hides TypeScript's errors in the code around it, as its closing tag has no mapping. At module level, an unclosed tag's declaration now hides them the same way, so `export const y = <Missing>` no longer repeats TS2304 beside the TSRX1001.
