---
'@tsrx/core': patch
'@tsrx/eslint-parser': patch
---

A `break` right in an `@switch` case body is still `TSRX2008`, but a collecting compile and the editor now record it and read on instead of stopping, as they already do for a `return` there. Before, `compile_to_volar_mappings` threw on it, also when the `@switch` was in an `@try`, `@catch`, `@if` or `@for` body, so the editor lost the whole file's virtual code and every other diagnostic in it, and Prettier could not format the file. The error now covers the `break` keyword and is reported once, also for a `break` with a label (`break done;`). The `break` is left out of the output and the code after it is kept, so that code's errors still show and TypeScript doesn't report the `break` again in Solid's case function. The strict compile still throws, now with the keyword's range, and ESLint still reports it as a parsing error.
