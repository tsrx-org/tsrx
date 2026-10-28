---
'@tsrx/core': patch
'@tsrx/runtime': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/hono': patch
'@tsrx/vue': patch
---

A ref list written on an element, `ref={[a, b]}`, now calls every ref in it on
React, Preact, Hono and Vue, as it already did on Solid. These runtimes take a
single ref, so the compiler passes the list to `__mergeRefs`: React and Hono
share the merged ref through `merge_element_refs`'s cache, so an inline list is
applied once, and Preact gets a new callback per render, as its merged refs
already do. A list can nest, and a falsy entry such as the `false` of
`cond && cb` is left out. Beside a spread, Preact and Vue no longer drop the
list.

The public `mergeRefs` now reads a ref list as the refs in it and leaves out a
value that is not a ref instead of throwing, and its type takes lists and the
falsy `false`, `0` and `''` of `cond && cb`, so the editor accepts
`ref={[a, b]}` on every target.
`merge_element_refs` merges a lone ref object from a list rather than giving it
back. The `MULTIPLE_REFS` hint no longer limits `ref={[a, b]}` to some targets.
