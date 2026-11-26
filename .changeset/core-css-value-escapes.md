---
'@tsrx/core': patch
---

The CSS parser keeps a declaration's `value` and an at-rule's `prelude` as written. Each escaped character in them was doubled with its `\`: `content: "\2713"` gave the value `"\\22713"`, and `@media (\31 x)` the prelude `(\\331 x)`. The whitespace an escape at the end of a value holds is kept too: the value of `font-family: a\ ;` is `a\ `, where it was `a\\`, and the prelude of `@keyframes a\31 { }` is `a\31 `, with the space that ends the hex escape. Compiled CSS is unchanged; it is built from the source text.
