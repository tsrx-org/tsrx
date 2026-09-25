---
'@tsrx/core': patch
---

Three element shapes that crashed, ran out of memory, or failed to parse now
parse or report a syntax error:

- An element as an attribute value without braces (`<div attr=<b>/* c */</b> />`)
  no longer runs out of memory when its text holds a block comment or starts
  with a line comment. The comment is text there, as in TSX, and as a line
  comment on its own line already was. A text read there that reads nothing now
  reports `Unexpected token` instead of repeating.
- A closing tag where an expression starts (`x = </>;`, `export default </>;`)
  reports `Unexpected token` at its `<`, where TypeScript expects an expression,
  instead of failing with `RangeError: Invalid array length`. This works around
  a bug in `@sveltejs/acorn-typescript` until a release fixes it. A closing tag
  in parentheses, in an argument, or where a statement starts is now reported
  at its `<` too, instead of at its `/`.
- In a template, a `/` in an opening tag reads as code, as it does in an element
  that is a value. A self-closing tag with a space or line break before its `>`
  (`<div / >`) is self-closing instead of reporting a mismatched closing tag,
  and a division, regular expression, or private name in a spread attribute's
  argument (`<div {...(b / 2)} />`, `<div {...this.#p} />`) no longer fails with
  `Unexpected token`.
