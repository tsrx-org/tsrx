---
'@tsrx/vue': patch
---

`@try` with `@pending` no longer reports TS2322 in the editor with `vue-jsx-vapor` 3.2.29. The type-only output passed Vue's `_` slot flag to `Suspense`, which that version's JSX types reject. Compiled output is unchanged.
