---
'@tsrx/core': patch
---

The parser gives a comment inside a JSDoc cast's parentheses to the cast value,
not to the statement's `;` or the class body after them, and a JSDoc cast after
a comma to the element it casts when its parentheses break, instead of the
element before the comma, which dropped the cast.
