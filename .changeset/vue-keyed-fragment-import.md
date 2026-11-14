---
'@tsrx/core': patch
'@tsrx/vue': patch
---

On the Vue target, a keyed `@for` row whose body is a fragment no longer throws `ReferenceError: __Fragment is not defined` when the loop doesn't render through `VaporFor`: a loop with `@empty`, or a body with setup statements before the fragment. The row is a `<Fragment key>` with `Fragment` imported from `vue`, which vue-jsx-vapor renders as a keyed fragment in the browser and on the server, and the editor no longer reports TS2304 for it. In a module that declares something else named `Fragment`, the row is an unkeyed fragment instead; such a loop recreates its rows when they move, so the key kept no row state there. `@tsrx/core` exports `FRAGMENT_INTERNAL_NAME`, the name the Vue target finds the generated rows by.
