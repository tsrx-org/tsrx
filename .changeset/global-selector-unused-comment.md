---
'@tsrx/core': patch
---

A pruned selector next to a `:global(…)` selector no longer leaves an unclosed CSS comment. In `.y:is(.z,:global(.w))`, `.z,:global(.w)`, `:global(.x) .z, .y` or `.y, .z:global(.k)`, the `/* (unused) … */` comment over the pruned selectors lost its opening or closing marker when the `:global(` or `)` next to it was removed, so the comment ran to the end of the stylesheet and swallowed the rules after it (a production build failed in lightningcss with `Unexpected end of input`). `.y:is(.z,:global(.w))` now compiles to `.y.<hash>:is(/* (unused) .z,*/.w)`, as `.y:is(.z, :global(.w))` with a space already did.
