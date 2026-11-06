---
'@tsrx/vue': patch
---

`@try` with `@pending` no longer reports TS2322 in the editor with `vue-jsx-vapor` 3.2.22 and later. Since 3.2.20, `vue-jsx-vapor` rejects the `_` slot flag that the type-only output passed to `Suspense`. Compiled output is unchanged. 3.2.20 and 3.2.21 still report TS2322, because their `v-slots` types require `VNode[]`.
