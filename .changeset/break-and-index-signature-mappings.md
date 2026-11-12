---
'@tsrx/core': patch
---

Two kinds of TypeScript errors in `.tsrx` files are now reported where they are written (#1248):

- An unreachable `break` or `continue` (TS7027). Inside an arrow function, `tsrx-tsc` and the TypeScript 5.9 plugin reported it several columns late, mapped by offset through the arrow. Inside a function expression or declaration, it was dropped on TypeScript 5.9 and 7.
- A duplicate index signature (TS2374). TypeScript 5.9 dropped it, and TypeScript 7 placed it at the nearest earlier position, such as before a comment or the `{` of a class.

The statement and the signature now map their start and end, and their first token.
