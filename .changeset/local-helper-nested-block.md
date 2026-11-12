---
'@tsrx/core': patch
---

A capture-free local helper of a component declared in a nested block (a bare
`{ … }` or a `case` body) is now declared once, inside that block. Before, it was
declared there and again in the enclosing statement list, where the block's own
bindings were out of scope; on Vue, `defineVaporComponent` ran twice for it.
