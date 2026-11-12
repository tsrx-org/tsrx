---
'@tsrx/core': patch
---

Scoped keyframes now keep working in more valid CSS forms. Before, a newline or tab after `@keyframes` put the hash on the at-rule keyword (`@keyframestsrx-…-`), a quoted name got the hash outside its quotes (`tsrx-…-"fade"`), a comment right after a name (`fade/*note*/`) kept the reference from being renamed, and an `animation` shorthand keyword such as `linear` was renamed as well when local keyframes shared its name. The compiler now finds the name after any whitespace or comment, prefixes a quoted name inside its quotes, reads names in `var()` and `env()` fallbacks, and in the `animation` shorthand reads a keyword as a keyframes name only when CSS does: once the longhand the keyword belongs to already has a value. Keyframes or animation names such as `constructor` or `toString` no longer make the compiler throw.
