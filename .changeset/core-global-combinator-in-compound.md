---
'@tsrx/core': minor
---

A `:global(...)` that holds a combinator with a selector other than a `:global(...)` both before and after it in its compound, as in `.wrap:global(.x i).icon`, is now reported as `TSRX3011`. The output drops the parentheses of `:global(...)`, so `.wrap` lands on the `.x` element and `.icon` on the `i`: `.wrap.x i.icon.<hash>`. A component's check for unused CSS looked for `.wrap` and `.icon` on one element instead, so it dropped the rule unless some element carried both classes. `.wrap:global(.x i)`, `:global(.x i).icon`, `.wrap:global(.x i)::before` and `.wrap:global(.x i::before):hover` (or `:before`) still compile: what follows a pseudo-element applies to it.

Migration: give each element its own `:global(...)`. `.wrap:global(.x i).icon { … }` becomes `:global(.wrap.x) :global(i).icon { … }`, which compiles to the same CSS, or `.wrap:global(.x) :global(i).icon { … }`, which also scopes `.wrap`. If only pseudo-classes follow the `:global(...)`, moving them inside keeps the output: `.wrap:global(.x > i):hover` becomes `.wrap:global(.x > i:hover)`. In a `:root` compound, or an `&` that stands for one, the new spelling also gets the hash the old output lacked: `:root:global(.x i).icon` gave `:root.x i.icon`, which styled such an `i.icon` anywhere on the page, and `:root:global(.x) :global(i).icon` gives `:root.x i.icon.<hash>`.
