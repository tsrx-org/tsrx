---
'@tsrx/core': patch
'@tsrx/vue': patch
'@tsrx/vue-runtime': patch
---

On the Vue target, a keyed `@for` keeps each row's state when its rows move, also when its body can skip a row (an `@if` without `@else`) or the loop has `@empty` (#178). These loops went through `map_iterable`, which rendered every row again on each change, so a row's component state was lost; they now render through `VaporFor` like other keyed loops. A skipped row renders an empty fragment. `@empty` and the rows read the source through one `computed`, so it is walked once (#863). A loop without a key, and a loop whose source, body or `@empty` awaits or yields, keeps `map_iterable`.

`VaporFor` now gets its items from `for_items`, a new helper in `@tsrx/vue-runtime/iterable`, so it walks the source the way `for...of` does (#1147): it follows an array's own `Symbol.iterator` and reads a `Symbol.iterator` getter once. A reactive array (`reactive([])`, or `ref([]).value`) is passed as it is, so `VaporFor` still tracks it when it is changed in place, and a missing source (`null` or `undefined`) still renders no rows, or the loop's `@empty`. A number or a plain object, which `for...of` can't walk, now throws `TypeError: The loop target has to be an Iterable`, as it already did in the loops that use `map_iterable`; `VaporFor` rendered the numbers from 1 or the object's values.

A `VaporFor` row that picks between `@if` and `@else` now switches branch when its condition changes. The row returned the choice, which Vapor evaluated once; it is now a fragment around the choice, which vue-jsx-vapor turns into a `createIf`.

Like every `VaporFor` loop already, a keyed loop with `@empty` or a body that can skip a row doesn't render on the server with vue-jsx-vapor 3.2.29: its `VaporFor` calls `createFor`, which Vue's server build doesn't have.

The `renderForOf` platform hook in `@tsrx/core` gets a fifth argument that builds the `@empty` block's render statements.
