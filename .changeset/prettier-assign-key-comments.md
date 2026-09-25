---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments after an `=` or a key, and in the parentheses of an import, go where
Prettier puts them:

- A comment at the end of the line of a type alias's `=`, or before an object,
  array, template, or type literal value of a declaration or assignment, moves
  below the `=` with the value. A line comment before the `=` does the same.
  Before any other value, a line comment after the `=` stays at the end of that
  line, or moves to the end of the statement when the value fits on the line
  (`const a = b || c; // note`).
- A comment at the end of a line inside an object property moves before the
  key. After a class field's `=`, a block comment there moves before the `=`,
  and a line comment follows the rule for declarations above.
- A comment between an import attribute's key and its value moves below the
  `:` with the value when it's on its own line, and before the `:` or to the end
  of the line otherwise.
- The parentheses of an import type or an `import … = require(…)` break around
  a comment like call arguments, instead of keeping the comment after the `(`.
- A union or intersection of one type (`| A`, `& A`) prints as that type, so a
  comment after its `|` or `&` moves below the `=` with the value, and the
  parentheses around it are dropped.
- A line comment after a callee or its type arguments stays there instead of
  moving after the arguments, and one at the end of the line after a `;` of a
  `for` header stays after the `;`.
