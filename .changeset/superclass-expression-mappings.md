---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report errors on a class whose base is a call,
a parenthesized expression, or an array literal, such as
`class Model extends createBase() {}` failing with TS2507 when `createBase()`
returns a plain object. TypeScript reports these errors on the whole superclass
expression, but no mapping reached the end of those expressions, so Volar
dropped them and the class failed only when the module ran.
