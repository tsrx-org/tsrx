---
'@tsrx/eslint-parser': patch
---

Each arm of an `@if` or `@try` now gets its own code path in ESLint, as the branches of an `if` and the blocks of a `try` do ([#1154](https://github.com/tsrx-org/tsrx/issues/1154)). After an arm that ends in `throw`, `no-unreachable` no longer reports the `@else` or `@catch` arm, or the code after the directive, and `no-useless-assignment` no longer treats an assignment in one arm as overwritten by another. Rules built on code paths see an arm as conditional, so `react-hooks/rules-of-hooks` reports a hook called in an `@if` or `@catch` body. The parser keeps the directive's `if` or `try` statement in its `statement` field, as it keeps a `@for` loop in `loop`. A `@try` without a `@catch` keeps its blocks, since ESLint can't analyze a `try` that has no `catch` or `finally`.

The `reset` function of `@catch (e, reset)` is now defined in the catch scope, as the error is. `no-undef` no longer reports it, and `no-unused-vars` reports it when it's unused.

The README lists the `@for` and `@switch` cases core rules still miss.
