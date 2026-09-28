---
'@tsrx/core': patch
---

Correct the parser's attachment of comments in parenthesized expressions and
type-parameter defaults:

- A comment at the end of a parenthesized sequence or assignment trails its last
  expression or right operand when used as an arrow body, initializer, return
  argument, or assignment value.
- Comments after a parenthesized expression statement, throw argument, or
  chained assignment trail the enclosing statement.
- Line comments around a type parameter's `=` trail its constraint, while a
  `prettier-ignore` belonging to its default stays on that default.
