---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The formatter now lays out statement and member lists, empty bodies, and loop
headers the way Prettier does:

- `for await` loops and `@for await` directives keep their `await`. It used to
  be dropped, which made the loop iterate synchronously.
- An import is followed by a blank line only when the source has one.
- A switch case keeps the blank lines between its statements, a comment after
  a statement or after `case x:` stays on that line, and a line comment after
  `case x:` above a lone block moves into the block. An `@case` body keeps its
  blank lines, and comments before `@case` and after its `}` are no longer
  deleted.
- Interfaces, type literals, and enums keep one blank line between members where
  the source has one, and an interface or type literal member ends with its `;`
  before its trailing comment (`a: 1; /* note */`). With `semi: false`, an
  interface keeps the `;` that a bare `get`, `set`, or `static` property or a
  property before a call signature needs, and a multi-line type literal drops
  the others.
- Every class member starts its own line, and a blank line between members is
  kept (it used to become a double space on one line). A class body with only
  comments keeps them; the parser now attaches them to the body.
- An empty `for`, `while`, `do`, or `catch` (without `finally`) body prints as
  `{}`, and an empty block in a statement list prints its braces on two lines.
  Template directive bodies keep their layout.
- The comments of an empty block, function body, interface, enum, type literal,
  or `@{ … }` code block print on consecutive lines, and a code block with only
  comments no longer starts with a blank line. A file with only comments keeps
  its blank lines.
- A `for` header that doesn't fit puts each clause on its own line, and an empty
  test prints as `for (let i = 0; ;)`.
