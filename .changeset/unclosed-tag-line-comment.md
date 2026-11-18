---
'@tsrx/core': patch
---

A tag left open after a conditional's `?`, or after `[` or `,` in an array, with a line comment between (`c ? // note`, a line break, then `<b> : null`) is reported as an unclosed tag (TSRX1001) in a collecting or loose parse, as with a block comment there. The parse no longer throws `Unexpected token`, so Prettier, ESLint and the editor show TSRX1001. A comment whose text ends in `?`, `[` or `,` no longer makes the text after an unclosed tag read as code (`// why?` before `<div>: label`).
