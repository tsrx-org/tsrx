---
'@tsrx/core': patch
---

Apply a `@for` key to the rows a loop renders through `@if` or `@switch`. The
key clause (`key item.id`) and the implicit index key were only placed on a
body that returned an element or a fragment, so a conditional body lost its
key: reordering the list moved row state to the wrong item on React, Preact,
and Hono, and React warned about missing keys. The key now lands on the element
or fragment each branch renders, and a key written on a branch element still
wins. A static branch element in a keyed loop now stays inline, since it carries
a per-row key, instead of being hoisted. Vue's `VaporFor` keeps keying rows
through `getKey`, and its output is unchanged.
