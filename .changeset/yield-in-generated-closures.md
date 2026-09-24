---
'@tsrx/core': patch
---

A generator function that returns JSX can now `yield` inside an element that
compiles to a closure: a host element with a spread and a `ref` in a ternary arm
or other expression position, an `@switch` case, or an `@if` branch with setup
statements. The closure was an arrow function, so the `yield` ended up outside
the generator, and builds failed with "A 'yield' expression is only allowed in a
generator body". The compiler now turns that closure into a generator and
delegates to it with `yield*`, so the yielded values and the resumed value still
belong to the enclosing generator, and `this` and `arguments` still refer to its
own. A `yield` in an `@for` body is now reported at the `yield` itself, because
the loop body runs as a callback that cannot yield from the enclosing generator.
A `super` inside such a closure is reported too, since a generator function
expression cannot reference it.
