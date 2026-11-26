---
'@tsrx/core': patch
---

A type selector after a `:global(...)` in the same compound now keeps its meaning. Dropping the `:global(` and `)` ran it into what the wrapper held: `:global(.x)div` compiled to `.xdiv`, a class, and `:global(.x)*.icon` to `.x*.icon`, which is invalid. It now gets an `:is()`, as a type selector in a `:global(...)` there does: `.x:is(div).<hash>`, `.x:is(*).icon.<hash>`.
