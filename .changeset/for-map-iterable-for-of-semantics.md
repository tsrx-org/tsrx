---
'@tsrx/runtime': patch
---

`@for` on React, Preact, and Hono now reads its source the way `for...of` does. An array with its own `Symbol.iterator`, including an array subclass that overrides it, renders the items its iterator yields instead of its indexed items, and an empty array whose iterator yields items no longer renders `@empty`. A `Symbol.iterator` getter is read once instead of twice. One difference from `for...of` stays as before: the loop pulls the next item before it renders the current one, so it knows which item is last. `map_iterable` and `map_iterable_async` now infer the item type from every member of a union source, so `@for` over `string[] | number[]` type-checks with `string | number` items.
