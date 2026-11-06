---
'@tsrx/eslint-parser': patch
---

ESLint now reaches a `@pending` block from the start of its `@try`, not from the end of the body ([#1289](https://github.com/tsrx-org/tsrx/issues/1289)). After a body that throws, `no-unreachable` no longer reports `@pending`, and `no-useless-assignment` no longer flags a value only `@pending` reads. A `@pending` that throws no longer makes the body and the code after the `@try` unreachable. Rules built on code paths see `@pending` as a branch, so `react-hooks/rules-of-hooks` reports a hook called in a `@pending` body, as it does in a `@catch` body.
