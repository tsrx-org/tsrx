---
'@tsrx/runtime': patch
---

Classify object refs in one pass inside `mergeRefs`, `apply_ref_value`, and `collect_ref_cleanups`. The DOM-node check previously ran once per `current`/`value` key probe, so value-style and non-ref objects paid for it twice per application. Array-valued refs now collect flat cleanup pairs instead of allocating a closure per item.
