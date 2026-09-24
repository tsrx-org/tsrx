---
'@tsrx/prettier-plugin': patch
---

`return` and `throw` keep JSDoc type casts when the argument starts with more
than one comment. `return /** @type {A} */ (/** @type {B} */ (x))` used to print
both comments without the parentheses that make them casts, so TypeScript no
longer treated them as casts. The same happened to `throw`, and to a cast that
followed an own-line comment.
