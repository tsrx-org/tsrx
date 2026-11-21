---
'@tsrx/core': patch
'@tsrx/eslint-parser': patch
---

A `break` right in an `@switch` case body is still `TSRX2008`, but a collecting compile and the editor now record it and read on instead of stopping, as they already do for a `return` there. Before, `compile_to_volar_mappings` threw on it, also when the `@switch` was in an `@try`, `@catch`, `@if` or `@for` body, so the editor lost the whole file's virtual code and every other diagnostic in it, and Prettier could not format the file. The error now covers the `break` keyword and is reported once; the code after the `break` stays in the editor output, so its errors still show. The strict compile still throws, now with the keyword's range, and ESLint still reports it as a parsing error.
