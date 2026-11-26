---
'@tsrx/core': minor
---

A `:global(...)` that holds a combinator between two other selectors of a compound, as in `.wrap:global(.x i).icon`, is now reported as `TSRX3011`. The output drops the parentheses of `:global(...)`, so `.wrap` lands on the `.x` element and `.icon` on the `i`: `.wrap.x i.icon.<hash>`. A component's check for unused CSS looked for `.wrap` and `.icon` on one element instead, so it dropped the rule unless some element carried both classes. `.wrap:global(.x i)`, `:global(.x i).icon` and `.wrap:global(.x i)::before` (or `:before`) still compile.

Migration: give each element its own `:global(...)`. `.wrap:global(.x i).icon { … }` becomes `:global(.wrap.x) :global(i).icon { … }`, which compiles to the same CSS, or `.wrap:global(.x) :global(i).icon { … }`, which also scopes `.wrap`.
