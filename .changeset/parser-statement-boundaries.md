---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser now accepts statements that TypeScript accepts around elements, and
the formatter's `semi: false` output parses again:

- `return <div />`, `throw <div />`, `yield <div />`, and `else <div />` parse
  after a semicolon-less statement that ends with an element with children
  (`const a = <span>x</span>`). They used to fail with `Unexpected token` or
  `A parse branch shortened the token context stack below its checkpoint`.
- After a statement without a semicolon, an element on the next line starts a
  new statement even when a block comment comes before it on that line
  (`/* render */ <div />`), which is what the formatter prints with
  `semi: false`.
- A statement in an `@case` or `@default` body can start with a regular
  expression or a template literal, and can divide. These used to fail with
  `Unexpected token` or `Unterminated template`.
- The declarator of `const theme = <style>…</style>` (and the declaration,
  without a semicolon) ends after `</style>` instead of inside the CSS, so the
  formatter keeps the blank lines after an assigned `<style>` block with
  `semi: false`, and mappings and lint ranges cover the whole declarator.
