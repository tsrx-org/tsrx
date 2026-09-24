---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report errors on a bare `this` or `super`, such as
`function readValue() { return this; }` failing with TS2683 under `strict`, or
`this` before `super()` in a derived constructor failing with TS17009.
TypeScript reports these errors on the keyword itself, but the source-mapping
walker never mapped `this` or `super`, so Volar dropped them unless the keyword
sat inside a larger mapped expression such as `this.value`. Hover and
go-to-definition on the keywords now work too.
