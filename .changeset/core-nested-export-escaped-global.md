---
'@tsrx/core': patch
---

`export declare global {}` or `export global {}` inside a block or a function, with `global` written with an escape (`glo\u0062al`), is TS1234, as TypeScript reports it, where the compiler reported TS1184 for the `export`: the words after a nested `export` are read with their escapes decoded.
