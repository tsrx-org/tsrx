---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments before the `;` of class members and declarations now go where
Prettier puts them:

- A comment before the `;` of a class field, a method signature, or an
  abstract member prints after the `;` (`a = 1 /* c */;` prints
  `a = 1; /* c */`), and so does one after the last parameter of a method
  signature, before its `)`. The same goes for an exported type alias,
  `export import … = require(…)`, and `export declare module "x"`. An interface
  member, an index signature, and a type alias or `import … = require(…)` that
  isn't exported keep a block comment before the `;`, like Prettier.
- A line comment before the `;` of a type alias, or a comment on a line of its
  own there, prints after the `;` and no longer breaks a union after the `=`
  (`type A = B | C // c\n;` prints `type A = B | C; // c`), and so does one
  before the `)` around the last type of a type alias or annotation
  (`type S = X & (A\n// c\n);` prints `type S = X & A;\n// c`).
- A comment in an empty export list prints after `export`
  (`export { /* c */ };` prints `export /* c */ {};`), and one after its `}`
  prints after the `;` instead of moving to the next statement.
