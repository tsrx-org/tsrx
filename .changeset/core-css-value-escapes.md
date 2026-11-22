---
'@tsrx/core': patch
---

The CSS parser keeps a declaration's `value` and an at-rule's `prelude` as written. Each escaped character in them was doubled with its `\`: `content: "\2713"` gave the value `"\\22713"`, and `@media (\31 x)` the prelude `(\\331 x)`. A space an escape holds at the end of a value is kept too: the value of `font-family: a\ ;` is `a\ `, where it was `a\\`. Compiled CSS is unchanged; it is built from the source text.
