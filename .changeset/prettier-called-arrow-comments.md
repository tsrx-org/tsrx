---
'@tsrx/core': patch
---

Correct comment attachment after parenthesized arrow-function bodies:

- A comment after the final body of a chain of immediately called arrows leads
  the first call argument. Its `ownLine` metadata records the required line
  break. Without an argument, the comment stays on the arrow body.
- A comment after a parenthesized arrow body can trail the enclosing arrow when
  the arrow is a member object or an operand. In a `new` call it leads the first
  argument, or trails the callee when there is no argument.
- A line comment that belongs to the body stays attached to the body.
