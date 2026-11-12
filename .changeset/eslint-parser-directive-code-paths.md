---
'@tsrx/eslint-parser': minor
---

Give ESLint an `@if`'s condition and arms as a real `if` statement, in a new `statement` field of the `JSXIfExpression`, as a `@for`'s loop is in `loop`. Tools that read a `JSXIfExpression`'s `test`, `consequent` or `alternate` read `statement.test`, `statement.consequent` and `statement.alternate` now, and a selector such as `JSXIfExpression > Identifier` no longer matches the condition.

Each arm of an `@if` now gets its own code path, as the branches of an `if` do ([#1154](https://github.com/tsrx-org/tsrx/issues/1154)). After an arm that ends in `throw`, `no-unreachable` no longer reports the `@else` arm or the code after the `@if`, and `no-useless-assignment` no longer treats an assignment in one arm as overwritten by another. `react-hooks/rules-of-hooks` reports a hook called in an `@if` arm. Rules that read `if` statements apply to an `@if` as they already did to `@else if`: `no-constant-condition` reports `@if (true)`, and `max-statements-per-line` reports an `@if` on the same line as `=>` or `return`.

A `@try` keeps its blocks, now visited in source order: the body, `@pending`, then `@catch`. As a `try` statement, its body would be inside a `try` the React, Preact and Hono output doesn't have, and `react-hooks/rules-of-hooks` would report as conditional every hook after the body's first call, member access or identifier, except `use()`, which react-hooks 6.1.1 and 7.1.1 report anywhere in the body as inside a try/catch block. So code path analysis still runs the blocks of a `@try` one after another, and the README lists what that costs. With `@pending` now before `@catch`, `no-unreachable` reports the `@catch` after a `@pending` that throws.

Scope analysis now visits the `pending` block of a plain `try … pending … catch` statement, so `no-undef` reports an undefined name there.

The `reset` function of `@catch (e, reset)` is now defined in the catch scope, as the error is. `no-undef` no longer reports it, and `no-unused-vars` reports it when it's unused.

The README lists the `@for`, `@switch` and `@try` cases core rules still miss.
