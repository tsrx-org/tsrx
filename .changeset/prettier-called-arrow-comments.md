---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A comment after the parenthesized body of an arrow function that prints in parentheses of its own goes in one pass where Prettier's next passes leave it:

- After an element body of an arrow function called right away or used as a tag, `((a) => (<div /> /* c */))(1);`, the parentheses around the arrow function break around the comment when the call fits on its line with the element, as they do after other bodies. When it doesn't, the element breaks and keeps the comment in its parentheses, as before. The comment moved out of the element on the next format.
- After the last body of a chain of arrow functions called right away, which prints below its `=>`, the comment leads the first argument on a line of its own. With no argument, it stays after the body. It moved to a line of its own after the chain on the next format, over-indenting the body, and into the arguments on the one after.
- After the body of an arrow function that is a `new` callee, a member object, or in parentheses before a `!`, `as`, `satisfies`, an operator, or a `?`, a block comment prints after the arrow function's parentheses, and leads the first argument of a `new`. It moved there on the next formats.
- A comment after the parenthesized body of an arrow function called right away that `prettier-ignore` keeps as written stays in its kept source. It printed again after it on each format.
