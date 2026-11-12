---
'@tsrx/core': patch
'@tsrx/content-mapper': patch
'@tsrx/language-server': patch
---

Each unclosed tag's TSRX1001 is now reported on its own tag, not all of them at the token that ends the template. In `<main><section>`, the editor and TypeScript 7's `tsc --runExternalCode` show one error on `main` and one on `section`. Before, the editor showed both on the `>` of `<section>`, and TypeScript 7 showed both at the `}`. At module level or inside a closed parent, they show an unclosed `<style>` or `<script>` on its opening tag.

The change is to collected errors, so `@tsrx/prettier-plugin` and `@tsrx/eslint-parser`, which report the first one, now report an unclosed element or fragment at the tag as well: `const y = <div>` is reported at `1:12`, where Prettier's `typescript` parser reports it, and no longer at `2:1`. A collected error's `raisedAt` doesn't move, except at the end of the file, where it's now one past the input. A strict compile, the one builds run, throws the same error at the same place as before.

A `<>` has no mapping in the editor's code, in a template or not, so the language server shows an unclosed one on the nearest code it can. That's its first child when the child has a mapping, as in `<><div>` and `<>{1}`, and otherwise the code before it, as with `<>` and `<>hello`. TypeScript 7 shows it on the `<>`.

On the TypeScript 7 language server, an unclosed tag hides what it hid before: TypeScript's errors in whatever holds the place the parser stopped, until the tag is closed. That's usually the enclosing function, and it can be a namespace, block, object or class, along with any component inside it. A tag that runs to the end of the file has nothing holding that place, so it hides errors only on its own name: `export const y = <Missing>` no longer repeats TS2304 beside the TSRX1001, and `@{` components after it at the top level keep their errors. An unclosed `<style>` or `<script>` stops at its body, which it hides. A plain `{ }` function after such a tag is still a parse error in the file.

An error's anchor, the mapping for a token that isn't in the generated code, now stays on its generated line. It can still sit on other code on that line.
