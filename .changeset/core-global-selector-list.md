---
'@tsrx/core': minor
---

A `:global(...)` that holds a selector list anywhere but as the whole selector is now reported as `TSRX3011`, as Svelte reports `css_global_invalid_selector`. The output drops the parentheses of `:global(...)`, so the list split the selector around it: `:global(.a, .b) .c` compiled to `.a, .b .c.<hash>`, which made `.a` a selector of its own and styled every `.a` on the page, and `.p:global(::before, ::after)` styled every `::after`. A `:global(.a, .b)` that is the whole selector still compiles to `.a, .b`.

Migration: write a selector for each item of the list: `:global(.a, .b) .c { … }` becomes `:global(.a) .c, :global(.b) .c { … }`.
