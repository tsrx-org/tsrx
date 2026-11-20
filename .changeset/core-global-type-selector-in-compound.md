---
'@tsrx/core': patch
---

A type selector at the start of a `:global(...)` that doesn't start its compound now goes in an `:is()`, since a type selector can only start a compound. The output drops the `:global(` and `)`, so the type selector ran into what came before it: `.icon:global(i)` compiled to `.icon.<hash>i`, a class named `<hash>i`; `:root:global(div)` to `:rootdiv`, `.wrap:global(*)` to `.wrap.<hash>*` (invalid) and `.p { &:global(div) {} }` to `&div` (invalid). These now compile to `.icon.<hash>:is(i)`, `:root:is(div)`, `.wrap.<hash>:is(*)` and `&:is(div)`, which match the same elements with the same specificity. A second `:global(...)` in a compound that starts with one is dropped too: `:global(div):global(.x)` compiled to `div:global(.x)` and now compiles to `div.x`.
