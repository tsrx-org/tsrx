---
'@tsrx/runtime': patch
---

Speed up `normalize_spread_props` on ref-bearing spreads by passing a single collected ref through unchanged and composing multi-ref lists in place, instead of always spreading refs into a fresh arguments array for `merge_ref_props`. Merge order, cleanup order, and `merge_ref_props`' public behavior are unchanged.
