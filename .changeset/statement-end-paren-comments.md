---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments in the parentheses at the end of a statement's value now reach the
place Prettier's later passes give them in one format:

- A comment after a conditional's alternate, in the parentheses around it,
  moves after the `;` (`const x = a ? b : (c /* c */);` prints
  `const x = a ? b : c; /* c */`), as it does after the last operand of a
  binary or logical value. After an arrow function's conditional body, block
  comments stay in the parentheses the body prints in, unless a line comment,
  or one on a line of its own, breaks the body.
- A comment on a line of its own before the `)` moves after the `;`, on a line
  of its own, and no longer breaks the value (`const x = a || (b\n/* c */);`
  prints `const x = a || b;\n/* c */`). After a `return` or `throw` argument, it
  stays in the argument's parentheses.
- A line comment before the `)` of a declarator's value that another
  declarator follows moves after the `,` and no longer breaks the value
  (`const x = (a, b // d\n), y = 1;` prints `const x = (a, b), // d`).
