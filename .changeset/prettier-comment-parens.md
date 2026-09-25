---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A `return`, `throw`, or `yield` argument that starts with a block comment
spanning lines keeps its parentheses, like Prettier, instead of ending at the
comment and returning `undefined`. A function called right away or used as a
template tag prints its comments inside its parentheses, and a parenthesized
superclass prints its comments outside the parentheses the class adds, like
Prettier. A superclass in a JSDoc cast no longer gets a second pair of
parentheses, and a comment after the superclass no longer moves into the class
body on the next format. An element in a JSDoc cast prints in parentheses of its
own inside the cast's when it breaks or has a comment that breaks the line, like
Prettier's `babel` output.

The parser gives a comment before the `)` of a function called right away or
used as a tag to the function, like Prettier, so it prints inside those
parentheses instead of moving into the call's arguments.
