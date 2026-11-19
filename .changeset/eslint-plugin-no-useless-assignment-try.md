---
'@tsrx/eslint-plugin': patch
---

Add `tsrx/no-useless-assignment`, ESLint's `no-useless-assignment` with the blocks of a `@try` as alternatives ([#1289](https://github.com/tsrx-org/tsrx/issues/1289)). Code path analysis runs the blocks one after another, so the core rule reported a value that the body overwrites though `@pending` or the `@catch` reads it, or a value the body assigns and the `@catch` assigns again though the code after the `@try` reads it. The compiled output runs the blocks in callbacks, in any order. The TSRX rule reports only what the core rule reports, minus these, and is the core rule in a file without `@try`. A `@try` whose body or `@pending` awaits or yields keeps the core rule's answers, and a value read only in a block that code path analysis holds unreachable, such as a `@catch` after a body that throws, is still reported.

On ESLint 10, whose `js.configs.recommended` turns on `no-useless-assignment`, `tsrx.configs.js` turns it off for `.tsrx` files and turns on `tsrx/no-useless-assignment` at `error`. On ESLint 9 the `js` configuration is unchanged.
