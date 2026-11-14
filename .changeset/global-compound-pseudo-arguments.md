---
'@tsrx/core': patch
---

The arguments of a `:not()`, `:is()`, `:where()` or `:has()` right after `:global(…)` in the same compound are now kept as written: they are global like the rest of the compound, so they are never commented out as unused or scoped. Before, `:global(.x):not(.z) .y` compiled to `.x:not(/* (unused) .z*/) .y.<hash>`, an empty `:not()` that lightningcss rejects (`Invalid empty selector`), so a production build failed; `:is()`, `:where()` and `:has()` were emptied the same way and then matched nothing, and an argument that matched an element of the component got the hash (`.x:not(.y:where(.<hash>))`). Now they compile to `.x:not(.z) .y.<hash>`, `.x:is(.z) .y.<hash>` and `.x:not(.y) .y.<hash>`. The same holds in themes. Whether the rule as a whole can match an element of the component is decided as before.
