---
'@tsrx/core': patch
---

Correct the parser's attachment of comments at the end of parenthesized
statement values:

- Comments after a conditional value's alternate trail the enclosing statement
  when they do not belong to a nested conditional or JSX expression.
- An own-line comment at the end of a parenthesized value trails its statement;
  one in a return argument stays on the argument.
- A line comment at the end of an initializer before another declarator trails
  that declarator, while block comments remain on the last sequence item.
