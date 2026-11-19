---
'@tsrx/core': patch
'@tsrx/vue': patch
'@tsrx/vue-runtime': patch
---

On the Vue target, a keyed `@for` whose body can skip a row (an `@if` without `@else`) or that has `@empty` now keeps each row's state when its rows move (#178). These loops went through `map_iterable`, which rendered every row again on each change; they now render through `VaporFor` like other keyed loops with a one-element body. A skipped row renders an empty fragment. `@empty` and the rows read the source through one `computed`, so it is walked once (#863). Such a loop keeps `map_iterable` when it has no key, when its body has setup statements, when its source, head, key, body or `@empty` awaits or yields, when its head destructures an array, has a default or a computed key, or collects the rest of an object (`{ id, ...rest }`), and, with `@empty`, when its row is a `@switch`. In a loop that moves, the key is read for every item, also one the body skips, so a key that only holds for the rows the body renders (`key item.data!.id` with `@if (item.data)`) now throws when the loop mounts; and the source is walked to the end before the rows render, as in other `VaporFor` loops.

`VaporFor` now gets its items from `for_items`, a new helper in `@tsrx/vue-runtime/iterable`, so it walks the source the way `for...of` does (#1147): it follows an array's own `Symbol.iterator` and reads a `Symbol.iterator` getter once. A reactive array (`reactive([])`, or `ref([]).value`) is passed as it is, so `VaporFor` still tracks it when it is changed in place. A missing source (`null` or `undefined`) still renders no rows, and a keyed loop with `@empty` now renders `@empty` for it, where `map_iterable` threw. A number or a plain object, which `for...of` can't walk, now throws `TypeError: The loop target has to be an Iterable`, as it already did in the loops that use `map_iterable`; `VaporFor` rendered the numbers from 1 or the object's values.

A `VaporFor` row that picks between `@if` and `@else` now switches branch when its condition changes. The row returned the choice, which Vapor evaluated once; it is now a fragment around the choice, which vue-jsx-vapor turns into a `createIf`.

Two limits that every `VaporFor` loop already had now apply to the keyed loops that moved to it, as a deliberate trade for keeping their rows. With vue-jsx-vapor 3.2.29 they don't render on the server: `VaporFor` calls `createFor`, which Vue's server build doesn't have, so server rendering throws (a loop with `@empty` still renders it for an empty source). And a plain array, such as a `shallowRef`'s value, changed in place and then announced with `triggerRef` doesn't update them, since Vapor hands a component prop on only when its value changes.

The `renderForOf` platform hook in `@tsrx/core` gets a fifth argument that builds the `@empty` block's render statements.
