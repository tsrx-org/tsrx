---
'@tsrx/core': patch
---

Remove the `extractPaths` utility and the `DestructuredAssignment` type. Nothing in this repository used them, and the emitted `_$_.exclude_from_object` / `_$_.array_slice` calls were Ripple runtime names baked into the target-neutral core; the Ripple compiler is the only consumer and now owns that lowering.
