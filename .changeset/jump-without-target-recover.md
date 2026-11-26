---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/eslint-parser': patch
---

A `break` or `continue` with no target, such as `function f() { continue; }`, a `continue` right in an `@switch` case, or a `break` in an `@if` body with no loop around it, is now recorded when collecting and in the editor instead of stopping the parse, as TypeScript reports it from its checker (TS1104, TS1105, TS1107, TS1115, TS1116). Before, `compile_to_volar_mappings` threw on it, so the editor lost the whole file's virtual code and every other diagnostic in it, and Prettier could not format the file. The error covers the `break` or `continue` keyword and is reported once: the template checks no longer add `TSRX2004` or `TSRX2037` beside it. The jump stays in the output, and where TypeScript reports the same error at the same place, as in a function or a component, the editor shows it once. The strict compile still throws it, and ESLint still reports it as a parsing error.
