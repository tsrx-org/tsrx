---
'@tsrx/core': patch
'@tsrx/vue': patch
---

On the Vue target, a keyed `@for` row whose body is a fragment no longer throws `ReferenceError: __Fragment is not defined` when the loop doesn't render through `VaporFor`: a loop with `@empty`, or a body with setup statements before the fragment. The row is a `<Fragment key>` with `Fragment` imported from `vue`, which vue-jsx-vapor renders as a keyed fragment in the browser and on the server, and the editor no longer reports TS2304 for it. A module that already names something else `Fragment` keeps it; the row then imports Vue's `Fragment` under a generated name, which renders in the browser but not in vue-jsx-vapor's server build. `@tsrx/core` exports `FRAGMENT_INTERNAL_NAME` for the Vue import.
