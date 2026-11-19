---
'@tsrx/eslint-plugin': patch
---

`tsrx/no-unreachable` no longer reports the `@pending` and `@catch` blocks of a `@try` whose body throws, or the code after a `@try` whose blocks throw ([#1289](https://github.com/tsrx-org/tsrx/issues/1289)). The compiled output runs the body, `@pending` and `@catch` in callbacks of the `@try`'s boundaries, and the component goes on past the `@try`, so all of them are reached whenever the `@try` is. A body or `@pending` that awaits or yields runs in the component instead, `@pending` first, where a throw leaves it: after such a block throws, the rule reports the `@catch` and the code after the `@try`, as core `no-unreachable` does. Hono also runs a `@pending` that doesn't await in the component; the rule doesn't know the target, so on Hono it doesn't report the code after a `@try` whose `@pending` throws. Inside these blocks it still reports code after a `throw`, `return`, `break` or `continue`, as it does in a `@switch` arm.

It also follows a revived path out of an endless loop or a `try` statement it is in: the code after the loop is reported, and a `catch` or `finally` block that a `throw` in the path reaches is not, while a `try` statement around a `catch` that takes the throw doesn't get it. Before, a `@switch` arm revived inside an endless loop made the code after the loop reachable.
