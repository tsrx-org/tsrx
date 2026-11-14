---
'@tsrx/core': patch
'@tsrx/vue': patch
---

On the Vue target, a keyed `@for` row whose body is a fragment no longer throws `ReferenceError: __Fragment is not defined` when the loop doesn't render through `VaporFor`: a loop with `@empty`, or a body with setup statements before the fragment. The row's `<Fragment key>` now imports `Fragment` from `vue`, which vue-jsx-vapor renders as a keyed fragment, and the editor no longer reports TS2304 for it. `@tsrx/core` exports `FRAGMENT_INTERNAL_NAME` for the Vue import.
