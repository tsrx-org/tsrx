---
'@tsrx/core': patch
---

Improve the parser's comment attachment around expressions, parameters, and
type annotations:

- A block comment between two nodes on one line leads the next node when only
  whitespace or `(` separates them, and otherwise trails the preceding node.
- A comment before a function or method's parameter list trails its name.
- An own-line comment inside a default value leads the default-value pattern or
  parameter property; an end-of-line comment after `=` trails its name.
- Comments around a shorthand property's default value attach to the default
  rather than a separate copy of the property's key.
- A comment below an arrow function's JSX body stays attached to that body.
- A comment after a parameter list on the same line trails the last parameter;
  comments inside an empty parameter list belong to the function or signature.
- A comment after a mapped type's constraint attaches to its type parameter.
