---
'@tsrx/core': patch
---

Text right after a directive's block that the tokenizer can't read as code, such as `1st prize`, `10px`, `#1`, `0x`, `'s` or an unclosed quote, is now read as text, as after an element, in every mode: it threw `Identifier directly after number` (TS1351) or a similar error. In an element in a `{ … }` container, the same text after a later child (`@if (ok) {<i />}<b /> 1st prize`) no longer throws either.
