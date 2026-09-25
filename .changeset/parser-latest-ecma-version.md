---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser now accepts all the syntax that acorn supports instead of stopping at
ES2022, and acorn is upgraded to 8.18.0:

- A hashbang (`#!/usr/bin/env node`) on the first line. Compiled output and the
  editor's virtual TypeScript keep it as their first line, ahead of any import
  the compiler adds, and the formatter prints it as written instead of turning
  it into `///usr/bin/env node`. The Vite dependency scan adds its imports after
  the hashbang.
- `using` and `await using` declarations, with or without type annotations and
  in `for...of` heads (`for (using x of y)`, `for await (await using x of y)`).
  Compiled output prints them unchanged. Like acorn, the parser rejects them in
  `for...in` heads.
- The regular expression `v` flag (`/[\p{L}--[a-z]]/v`) and modifiers
  (`/(?i:a)b/`).

These used to fail with `Unexpected character '!'`, `Unexpected token`,
`Invalid regular expression flag`, or `Invalid group`, also in the Turbopack
plugin's platform flag pass over plain JavaScript and TypeScript modules.
