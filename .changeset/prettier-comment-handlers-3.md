---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

More comments stay where they were written, the way Prettier places them.

- Without a `;`, a comment after a statement whose value ends in parentheses,
  like `const x = a | (b >> 6) // note`, trails the statement. It no longer
  breaks the value over several lines on the first pass and joins it again on
  the next.
- A comment in the type arguments of a call or a tagged template, in the type
  parameters or parameters of a generic arrow function, or before the test of a
  `case` stays there. It no longer moves to the call's first argument, the arrow
  function's return type, or the case's body. Comments in a template `@try`'s
  `@pending` block, and between it and `@catch`, are no longer dropped.
- A line comment after the `{` of an import's named specifiers, as in
  `import d, { // note`, stays there on the next pass instead of moving to its
  own line.
- A comment before `implements` in a class with nothing before the clause, like
  a class expression with no name, stays before the keyword, or after it when
  the class implements one type.
