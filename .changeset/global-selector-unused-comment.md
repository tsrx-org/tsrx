---
'@tsrx/core': patch
---

The `/* (unused) … */` comment over a pruned selector no longer loses its opening or closing marker when it sits at the edge of a `:global(…)` or `:global` selector. Before, removing the `:global(`, `)` or `:global` text also removed the marker, so in `.y:is(.z,:global(.w))`, `.z,:global(.w)`, `:global(.x) .z, .y`, `.y, .z:global(.k)` or `.y, .z:global` the comment ran to the end of the stylesheet and swallowed the rules after it (a production build failed in lightningcss with `Unexpected end of input`), or a stray `*/` was left behind. `.y:is(.z,:global(.w))` now compiles to `.y.<hash>:is(/* (unused) .z,*/.w)`, as `.y:is(.z, :global(.w))` with a space already did.
