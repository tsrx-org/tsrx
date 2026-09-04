---
'@tsrx/runtime': patch
---

Speed up `iterable_array_from` for arrays by copying indexed elements instead of walking the iterator protocol.
