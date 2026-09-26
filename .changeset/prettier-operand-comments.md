---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments around the operands of binary and logical expressions settle where
Prettier puts them:

- A `prettier-ignore` comment before the `)` around the last operand of a left
  operand (`x = a + (b /* prettier-ignore */) + d;`) keeps only the operand
  before it as written and prints once after the parentheses
  (`x = a + b /* prettier-ignore */ + d;`). It used to keep the whole left
  operand, with the comment in it, and print the comment again after it, one
  more copy on every format.
- A comment before that `)` stays in the left operand when a
  `prettier-ignore` comment keeps the operand as written, one before it or
  after its parentheses (`x = a * (b /* c */) /* prettier-ignore */ + d;`),
  instead of printing again after it.
- A line comment at the end of the last operand's line, in an expression that
  breaks before that operand inside a unary operator's parentheses
  (`!(\n  a &&\n  b // c\n)`), keeps every operand on its own line instead of
  joining them. On a same-operator group written on the right
  (`!(\n  a &&\n  (b &&\n  c) // comment\n)`), that operand stays on the
  chain's indent.
- Only a comment that reads `prettier-ignore` keeps a union member as written,
  not one with more words after it (`// prettier-ignore because …`).
