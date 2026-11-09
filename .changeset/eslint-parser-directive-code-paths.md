---
'@tsrx/eslint-parser': patch
---

Each arm of an `@if` now gets its own code path in ESLint, as the branches of an `if` do ([#1154](https://github.com/tsrx-org/tsrx/issues/1154)). After an arm that ends in `throw`, `no-unreachable` no longer reports the `@else` arm or the code after the `@if`, and `no-useless-assignment` no longer treats an assignment in one arm as overwritten by another. Rules built on code paths see an arm as conditional, so `react-hooks/rules-of-hooks` reports a hook called in an `@if` arm. The directive's `test`, `consequent` and `alternate` move into an `if` statement in a new `statement` field, as a `@for` loop's fields are in `loop`, so a rule that reads them from the `JSXIfExpression` now reads `statement.test` and so on, and a selector such as `JSXIfExpression > Identifier` no longer matches the test.

A `@try` keeps its blocks, now visited in source order: the body, `@pending`, then `@catch`. As a `try` statement, its body would be inside a `try` the React, Preact and Hono output doesn't have. `react-hooks/rules-of-hooks` would then report each hook in the body after the first as conditional, except `use()`, which react-hooks 6.1.1 and 7.1.1 report anywhere in the body as inside a try/catch block. So code path analysis still runs the blocks of a `@try` one after another, and the README says what that costs.

The `reset` function of `@catch (e, reset)` is now defined in the catch scope, as the error is. `no-undef` no longer reports it, and `no-unused-vars` reports it when it's unused.

The README lists the `@for`, `@switch` and `@try` cases core rules still miss.
