---
'@tsrx/core': patch
'@tsrx/vue': patch
'@tsrx/vue-runtime': patch
---

Vue `@for` loops that have `@empty`, can skip a row, or have statements in their body now go through `map_iterable`, so a `Set`, `Map`, generator or any other iterable works instead of throwing on `.map` / `.flatMap`.
