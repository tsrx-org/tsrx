---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report errors on `#private` class members, such
as `#value: number = 'bad'` failing with `Type 'string' is not assignable to
type 'number'` and an uninitialized `#value: number` failing with TS2564. The
source-mapping walker never mapped private names, and TypeScript reports these
errors on the `#name` itself, so Volar dropped them. Private names in method
and accessor keys, `this.#name` reads, and `#name in obj` checks now map too.
