---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/eslint-parser': patch
---

A `return` right in an `@switch` case body is still `TSRX2009`, but a collecting compile and the editor now record it and read on instead of stopping. Before, `compile_to_volar_mappings` threw on it, also when the `@switch` was in an `@try` or `@catch` body, so the editor lost the whole file's virtual code and every other diagnostic in it. The code after the `return` in that case stays in the editor output too, so its errors still show. The strict compile still throws, now with the `return` keyword's range, and ESLint still reports it as a parsing error. A `return` the parser reports is now reported once: one in an `@switch` in an `@if` or `@for` body no longer also gets `TSRX2002` or `TSRX2005`, one in an `@try` in an `@if` or `@for` body (`TSRX2001`) no longer also gets `TSRX2002` or `TSRX2005`, and one in a nested `@{ … }` block in an `@try` body is no longer reported twice.
