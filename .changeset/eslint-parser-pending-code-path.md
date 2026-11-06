---
'@tsrx/eslint-parser': patch
---

`@pending` is now a branch in ESLint's code paths, instead of running after the end of the `@try` body ([#1289](https://github.com/tsrx-org/tsrx/issues/1289)). With no `@catch`, it runs before the body. With a `@catch`, it follows the first thing in the body that can throw, each `throw`, and the end of the body. After a body that throws, `no-unreachable` no longer reports `@pending`, and `no-useless-assignment` no longer flags a value only `@pending` reads. A `@pending` that throws no longer makes the code after the `@try` unreachable. Rules built on code paths see the branch, so `react-hooks/rules-of-hooks` reports a hook called in a `@pending` body.

Custom rules see a different AST. A `@pending` block is now the `consequent` of an `IfStatement` whose `test` is a `JSXPendingKeyword`. With a `@catch`, that statement moves from `TryStatement.pending` to `CatchClause.pending`, and the `CatchClause` starts at the `pending` keyword. With no `@catch`, it stays on `JSXTryExpression.pending`.
