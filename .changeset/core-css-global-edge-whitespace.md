---
'@tsrx/core': patch
---

Whitespace at the edges of a `:global(...)` argument no longer becomes a combinator in the output. CSS ignores it there, and so does the check for unused CSS, but the output dropped only the parentheses and kept it: `.wrap:global( .x).icon` gave `.wrap .x.icon.<hash>`, and `.wrap:global( .x)` gave `.wrap.<hash> .x`, so the rule styled a descendant of `.wrap` instead of `.wrap` itself. They now give `.wrap.x.icon.<hash>` and `.wrap.<hash>.x`, as `.wrap:global(.x).icon` and `.wrap:global(.x)` do. A comment there stays, with no whitespace around it. A hex escape at the end of the argument also keeps the combinator after the `)`: `.wrap:global(.\31) .icon` gave `.wrap.<hash>.\31 .icon`, where the escape took the space as its own and joined the two compounds.
