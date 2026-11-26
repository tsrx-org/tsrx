---
'@tsrx/core': patch
---

Deeply nested `var()` and `env()` fallbacks in an `animation` or `animation-name` value no longer overflow the stack. Reading the keyframes names in them took a call per level, so about 6,000 levels threw an uncaught `RangeError`, and each level read the rest of the value again, so the time grew with the square of the depth (4,000 levels took 0.8 s). They are now read in one pass: 50,000 levels take 0.2 s.
