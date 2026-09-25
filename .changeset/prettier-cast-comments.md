---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A comment after the value inside a JSDoc cast's parentheses stays inside them,
like Prettier's `babel` output, instead of moving after them and, after an
element, moving again on the next format. An element kept by `prettier-ignore`
inside a JSDoc cast stays after the `=`. Parentheses printed around a value that
starts with a JSDoc-cast operand go around the cast too
(`(/** @type {T} */ (a) ?? b)`), so the cast keeps casting that operand instead
of the whole value, which Prettier's output does.

The parser gives a comment inside a JSDoc cast's parentheses to the cast value,
not to the statement's `;` or the class body after them, and a JSDoc cast after
a comma to the element it casts when its parentheses break, instead of the
element before the comma, which dropped the cast.
