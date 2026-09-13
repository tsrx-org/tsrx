---
'@tsrx/runtime': patch
---

Speed up `mergeRefs` and `merge_ref_props` mount and unmount by tracking pending cleanups as flat tagged entries instead of allocating a closure per ref, preserving callback order, cleanup order, and thrown-error behavior.
