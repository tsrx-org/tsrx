---
'@tsrx/core': minor
---

An `@for` head that declares its loop variable with `var`, as in `@for (var item of items)`, is now reported as TSRX2027 on every target, with a hint to use `const` or `let`. Before, it compiled without an error, but the variable only existed inside the loop, so code after the loop that read it threw `ReferenceError` at render.

Migration: declare the loop variable with `const` or `let`: `@for (const item of items)`. To keep a value after the loop, assign it to a variable declared before the loop.
