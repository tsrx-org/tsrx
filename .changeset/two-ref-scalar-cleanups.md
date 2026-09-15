---
'@tsrx/runtime': patch
---

Speed up `mergeRefs` on the dominant two-ref shape emitted for multi-ref elements: mount applies both refs directly and tracks each cleanup step in a scalar slot instead of materializing a cleanups array per mount, preserving callback order, cleanup order, thrown-error behavior, and `mergeRefs.length`.
