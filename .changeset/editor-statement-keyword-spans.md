---
'@tsrx/core': patch
---

The editor and `tsrx-tsc` now report more TypeScript diagnostics of a `.tsrx` file where a `.ts` file has them:

- In a `@{` body, the warning for an unused destructuring (TS6198) covers the pattern, not the text from the function's `(` (#1062).
- A diagnostic that starts at a statement's keyword or at a binding pattern is no longer dropped (TypeScript 5.9 and 6) or moved to an earlier position (TypeScript 7): unreachable code (TS7027) on a statement that starts with `const`, `let`, `var`, `if`, `while`, `do`, `for`, `switch`, `throw`, `try`, `debugger`, `new`, `typeof`, `void`, `delete` or `enum`, or on `return 1;`; a declaration whose variables are all unused (TS6199); and a `typeof x` comparison that is never true (TS2367).
- On TypeScript 5.9 and 6, Add missing function declaration works for a call in a template's output, and adds the function before the output (#1027).
- On TypeScript 7, typing `/**` above a function offers the `/** */` JSDoc template (#1066).
