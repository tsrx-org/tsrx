---
'@tsrx/core': patch
---

A `return` right in an `@switch` case body is still `TSRX2009`, but a collecting compile and the editor now record it and read on instead of stopping. Before, `compile_to_volar_mappings` threw on it, also when the `@switch` was in an `@try` or `@catch` body, so the editor lost the whole file's virtual code and every other diagnostic in it. The strict compile still throws, now with the `return` keyword's range. A `return` in a nested `@{ … }` block in an `@try` body is now reported once when collecting, where it was reported twice.
