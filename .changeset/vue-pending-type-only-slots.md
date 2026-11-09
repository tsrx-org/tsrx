---
'@tsrx/vue': patch
---

`@try` with `@pending` no longer reports TS2322 in the editor. `vue-jsx-vapor`'s JSX types reject the `_` slot flag that the type-only output passed to `Suspense`. Compiled output is unchanged.
