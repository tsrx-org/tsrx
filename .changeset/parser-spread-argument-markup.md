---
'@tsrx/core': patch
---

An element in a spread attribute's argument (`<div {...{ k: <b>…</b> }} />`,
`<div {...(c ? <b>…</b> : null)} />`) and an element that is an attribute value
without braces (`<div k=<b>…</b> />`) are template markup, as an element in a
braced value (`<div k={<b>…</b>} />`) is. They were parsed as plain JSX:

- A comment in them is a comment instead of text (`<b><i /> /* c */ 2</b>`
  rendered `/* c */ 2`).
- `@if`, `@for`, `@switch`, `@try`, and `@{ … }` in them are directives instead
  of text followed by a `{…}` container.
- Their text follows the template text rules, and a mismatched closing tag
  reports the template's message.
