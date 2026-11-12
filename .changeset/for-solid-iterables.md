---
'@tsrx/core': patch
'@tsrx/runtime': patch
'@tsrx/solid': patch
'@tsrx/solid-runtime': patch
---

`@for` on Solid now accepts any iterable, as on React, Preact, and Hono. A `Set`, a `Map` iterator, a generator, or an array with its own iterator no longer throws `newItems.slice is not a function` and halts Solid's reactivity; the loop reads the source the way `for...of` does and hands `<For>` the resulting array. Arrays with the built-in iterator, including store arrays, reach `<For>` as they are. The helpers `for_items` and `for_keyed_rows` come from the new `@tsrx/solid/iterable` and `@tsrx/solid-runtime/iterable` subpaths, and `@tsrx/runtime/iterable` gains `iterable_to_array`.

A Solid `@for` whose key reads its declared index, as in `@for (const item of items(); index i; key i)`, no longer throws `ReferenceError: i is not defined` when the list updates. Solid's `keyed` callback receives the item alone, so such a loop now computes each key from the item and its index up front and renders those rows. A sparse array renders its holes as `undefined` items instead of halting Solid's reactivity.

A Solid `@for` that destructures its item in a loop with a key or an index, as in `@for (const { id } of items(); key id)`, now renders the item's values instead of `undefined`, and the destructured names follow the row when Solid reuses it for another item or an item replaced under the same key. A destructured component used as a tag (`<Icon />`) renders through Solid's `dynamic`, so it follows the row too.
