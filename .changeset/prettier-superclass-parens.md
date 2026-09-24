---
'@tsrx/prettier-plugin': patch
---

The formatter no longer drops the parentheses a superclass expression needs.
Before, `class Derived extends (Base || Object) {}` was formatted to
`class Derived extends Base || Object {}`, which no longer compiles. The same
happened with `&&`, `??`, binary operators, assignments, arrow functions,
`as`/`satisfies` casts, unary and update expressions, `await`, `yield`, and
decorated class expressions.
