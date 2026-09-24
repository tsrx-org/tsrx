---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report errors that TypeScript places on a whole
call or parenthesized expression, such as spreading a call result that isn't
iterable (TS2488, `[...createBase()]`), calling a value that isn't callable
(TS2349, `createBase()()` or `(plain)()`), testing a `void` call for truthiness
(TS1345, `if (createVoid())`), or `createBase() as const` (TS1355).
