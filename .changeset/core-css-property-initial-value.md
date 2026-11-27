---
'@tsrx/core': patch
---

A `@property`'s `initial-value` is now read as a custom property's value is, so it can hold `{}` blocks anywhere: `initial-value: {a} b`, `b {a}`, `{a}{b}` and `foo(){}` were `TSRX3013`, though browsers register each value. As in CSS, a string in it ends at a newline, and it may be empty (`initial-value: ;`, which `syntax: "*"` allows, was `TSRX3013`). A `{}` block with more after it in a style rule (`color: {a} b`) is still an error.
