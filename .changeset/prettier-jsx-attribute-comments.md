---
'@tsrx/prettier-plugin': patch
'@tsrx/core': patch
---

Comments in JSX attributes and next to template text now stay where they were
written:

- A comment between an attribute's `=` and its value is no longer deleted. A
  block comment prints before the value (`attr=/* c */ "foo"`), and a line
  comment after a string or element value, like a trailing comment of the
  attribute, or inside the braces of a `{…}` value.
- A comment after an attribute's name (`attr /* c */="x"`) is no longer
  deleted.
- A comment on its own line after a spread's argument, before its `}`, stays
  inside the braces. Before another attribute it was deleted, and otherwise it
  moved after the `}`. A spread attribute's braces break with the opening tag,
  like Prettier's.
- A word of text that starts with `//` no longer wraps to the start of a line,
  where it would read as a comment and the rest of the line would be lost.
- A block comment right after a `{" "}` child keeps the spacing it was written
  with, so the output no longer needs a second format.

The parser now gives a comment after a spread's argument to the argument, like
Prettier, instead of the next attribute or the closing tag.
