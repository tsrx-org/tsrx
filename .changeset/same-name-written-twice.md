---
'@tsrx/core': patch
---

In the editor, a name written twice, `{ a: a }`, `import { a as a }` or `export { a as a }`, now keeps both names. The editor output printed these as the shorthand `{ a }`, so one of the names had no text of its own: under TypeScript 7 the value of `a: a` had no hover, definition or rename, the imported name of `import { a as a }` had no hover or definition in the classic server, and renaming `a` turned `{ a: a }` into `{ a: a: renamed }` and `export { a as a }` into `export { renamed as a as a }` on both. The build output doesn't change.
