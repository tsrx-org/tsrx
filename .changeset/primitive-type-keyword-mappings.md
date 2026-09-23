---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report missing-return errors on functions and
methods with a primitive return type, such as `value(): number {}` failing with
TS2355. TypeScript reports these errors on the return type, but the
source-mapping walker never mapped primitive type keywords (`number`, `string`,
`this`, and the rest), so Volar dropped them. A method in a file with no
`function` or `async` keyword also no longer gets a stray mapping that treated
its opening `(` as a `function` keyword.
