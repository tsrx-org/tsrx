---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
---

An `@for` body can declare the item's or the index's name again, as a `for...of` body can: `@for (const { id } of rows) { const { id } = other; ... }` no longer compiles to a duplicate declaration on React, Preact, Hono, Solid or Vue. The body runs in a block of its own, and a key the head gives (`key id`, or the index an index loop is keyed by) still reads the head's name.

A default in an `@for` item pattern can read the loop's index, as in `@for (const [a = 'r' + i, b] of rows; index i)`. It no longer throws "Cannot access 'i' before initialization" when a row needs the default, and on Solid a keyed loop's default reads the index number instead of its accessor. The loop callback takes the item whole and destructures it once the index is set.
