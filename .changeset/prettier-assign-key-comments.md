---
'@tsrx/core': patch
---

Attach comments after assignments and property keys to the appropriate AST
nodes:

- Comments around a type alias's `=` lead the type. An end-of-line comment after
  `=` before an object, array, or template value leads that value.
- An end-of-line comment after `=` before another value trails the left side.
  Comments after a class field's `=` attach to its key.
- An end-of-line comment inside an object property leads the property.
- An end-of-line comment after an import attribute's key trails the key, and
  comments after a `for` header clause trail that clause.
