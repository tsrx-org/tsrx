---
'@tsrx/runtime': patch
---

Speed up `normalize_spread_props` by checking own-property enumerability with `propertyIsEnumerable` instead of materializing a descriptor object per key, preserving the same own-key, descriptor-trap, and getter observation order for every source shape.
