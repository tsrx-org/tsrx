---
'@tsrx/runtime': patch
---

Speed up `iterable_array_from` for non-array length-bearing values by copying indexed elements instead of walking the iterator protocol or allocating via `Array.from().slice()`.
