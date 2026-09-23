---
'@tsrx/core': patch
---

Recognize a generic arrow whose parameter list holds a `)` inside a comment or
regular expression literal (`<T extends object>(x: T /* ) */) => x`,
`<T extends object>(x: T, re = /[)]/) => x`). The lookahead that balances the
parameter list only skipped strings, so the stray `)` ended the scan early and
the `<T>` was parsed as an unclosed JSX tag. It now skips comments and regex
literals too, telling a regex from division by the token before the `/`.
