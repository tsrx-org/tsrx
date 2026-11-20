---
'@tsrx/core': patch
---

A namespace or module without its body's `{`, and a type alias without its `=`, fail with TypeScript's TS1005 (`'{' expected.`, `'=' expected.`) at the token in its place, where the compiler reported TS1012 `Unexpected token` there: `namespace N export const x = 1;`, `namespace N;`, `type T number;`.
