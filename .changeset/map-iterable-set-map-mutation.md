---
'@tsrx/runtime': patch
---

Fix `map_iterable` passing `undefined` items, skipping added entries, and reporting `is_last` early when a callback mutates the `Set` or `Map` being iterated. `Set` and `Map` walk the peek-ahead iterator path again; arrays keep the preallocated fast path.
