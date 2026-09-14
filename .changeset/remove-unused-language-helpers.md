---
'@tsrx/runtime': minor
'@tsrx/core': minor
---

Remove the `array_slice` and `iterable_array_from` language helpers (also re-exported from `@tsrx/core/runtime/language-helpers`) and the `buildFallback` AST utility. They only backed lazy destructuring and the `extractPaths` lowering, both removed; their last consumer, the Ripple compiler, now lowers rest and default patterns with native destructuring.
