---
'@tsrx/core': patch
---

Correct comment attachment inside parentheses at the end of expressions:

- Comments after the last operand of a binary or logical statement value trail
  the statement. In a return argument they trail the argument.
- Comments belonging to a JSDoc cast or JSX element stay with that expression.
- A comment before the closing parenthesis of an operand's last operand trails
  the enclosing left operand of the next operator.
- A line comment following block comments at the end of a parenthesized sequence
  trails the statement; the block comments stay on the sequence's last item.
- A comment after a parenthesized body of an immediately called arrow can trail
  the arrow itself, while a comment belonging to a conditional body stays there.
