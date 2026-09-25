---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments stay where they were written, and print the way Prettier prints them.

- A comment in the condition of an `if`, `else if`, `while`, `do…while`, `switch`,
  `@if`, or `@switch` stays inside the parentheses, so a JSDoc cast keeps its
  meaning and `@if` formats the same on every pass. A comment after the `)` of an
  unbraced `if` or loop body stays in the body.
- A body without braces moves to its own indented line when the statement doesn't
  fit or a comment starts it, and a comment around an empty body's `;` stays on its
  side of it. A comment before `else` stays before it.
- Comments are no longer deleted after the name of a function, class, enum, enum
  member, interface, or type alias, in empty parameter or argument parentheses,
  between a function's parameters and its body, or before an arrow's `=>`. A
  comment in a function body no longer moves into the parameter list.
- A comment after a stray `;` in a class body, in a JSX attribute, after a JSX tag
  name, or after a tag's last attribute stays there, and a comment in an attribute
  no longer sends the comments of the children to the closing tag.
- Block comments that share a line stay on it, every comment after a statement on
  its line stays there, and a comment between a statement and its `;` prints after
  the `;`. A switch with no cases keeps its comments inside its braces.
- A multi-line block comment whose lines start with `*` takes the indentation of
  where it prints; any other block comment prints as written.
- `yield` keeps the parentheses around an argument that starts with a comment
  ending its line, so the formatter no longer changes the yielded value.
