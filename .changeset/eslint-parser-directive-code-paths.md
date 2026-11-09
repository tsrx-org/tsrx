---
'@tsrx/eslint-parser': patch
---

Each arm of an `@if` now gets its own code path in ESLint, as the branches of an `if` do ([#1154](https://github.com/tsrx-org/tsrx/issues/1154)). After an arm that ends in `throw`, `no-unreachable` no longer reports the `@else` arm or the code after the `@if`, and `no-useless-assignment` no longer treats an assignment in one arm as overwritten by another. Rules built on code paths see an arm as conditional, so `react-hooks/rules-of-hooks` reports a hook called in an `@if` arm. The parser keeps the directive's `if` statement in its `statement` field, as it keeps a `@for` loop in `loop`.

A `@try` keeps its blocks, now visited in source order: the body, `@pending`, then `@catch`. As a `try` statement, its body would be inside a `try` the compiled output doesn't have, and `react-hooks/rules-of-hooks` would report `use()` there and every hook after the first. So code path analysis still runs the blocks of a `@try` one after another, and the README says what that costs.

The `reset` function of `@catch (e, reset)` is now defined in the catch scope, as the error is. `no-undef` no longer reports it, and `no-unused-vars` reports it when it's unused.

The README lists the `@for`, `@switch` and `@try` cases core rules still miss.
