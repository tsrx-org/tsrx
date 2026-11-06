---
'@tsrx/eslint-parser': patch
---

`@pending` is now a branch in ESLint's code paths, instead of running after the end of the `@try` body ([#1289](https://github.com/tsrx-org/tsrx/issues/1289)). With no `@catch`, it runs before the body. With a `@catch`, it follows the first thing in the body that can throw, each `throw`, and the end of the body. After a body that throws, `no-unreachable` no longer reports `@pending`, and `no-useless-assignment` no longer flags a value only `@pending` reads. A `@pending` that throws no longer makes the code after the `@try` unreachable. Rules built on code paths see the branch, so `react-hooks/rules-of-hooks` reports a hook called in a `@pending` body.

Rules that read the AST see a change. A `@pending` block is now the `consequent` of an `IfStatement` whose `test` is a `JSXPendingKeyword`. With no `@catch`, that statement is `JSXTryExpression.pending`. With a `@catch`, `TryStatement.handler` is a `JSXTryHandler` that holds the statement in `pending` and the `CatchClause` in `clause`, instead of `TryStatement.pending` and a `CatchClause` in `handler`. It has the `param` and `body` of the clause, and the `parent` of the clause is still the `TryStatement`, though a `TryStatement > CatchClause` selector doesn't match it. The README lists what that costs.
