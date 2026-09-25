---
'@tsrx/core': patch
---

Template text in an element inside a setup statement of a `@{ … }` or control-flow
body, or of an `@case`, reads as it does everywhere else, wherever the statement
holds the element (a declaration, a `return`, an argument, an array or object, a
conditional, an arrow, a nested function or component, or an `@if`, `@for`,
`@switch`, or `@{ … }` value):

- Leading spaces after an opening tag, a closing tag, and a child container are
  kept (`const a = <span><b>1</b> 2</span>;` rendered `12` instead of `1 2`),
  and a non-breaking space there no longer fails with `Unexpected character`.
- Text right before a tag (`const a = <span>Hello<b /></span>;`) no longer fails
  with `Not enough stack space to parse input`.

A syntax error in an element that is a value now reports that error instead of
an internal one (`A parse effect shortened an append-only array`, `A parse branch
shortened the token context stack below its checkpoint`). A tag's missing `>`
(`const el = <div>x</div;`) reports `'>' expected.` at the token in its place,
as TypeScript does, instead of `Unexpected token`.

The token after a self-closing tag with a space before its `>` (`<div / >`) in a
value reads as code, as after `<div />`.
