---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser reads the token after an element, `await`, a type, and the first
token of a code block statement the way TypeScript does, so more valid source
parses and the formatter's `semi: false` output parses again:

- After a semicolon-less statement that ends with an element with children
  (`const render = (item) => <><Item /></>`), an element with attributes on the
  next line starts a new statement. It used to fail with `Unexpected token`.
- A template literal after an element with children continues it as a tagged
  template, as after a self-closing element, instead of failing with
  `Unterminated template`.
- A `/` after an element divides at the module top level and after an element
  with children (`const half = <span /> / 2`). It used to be read as text.
- `await <div />` awaits the element instead of failing as a comparison, so the
  formatter's output for `await (<div />)` parses again.
- In a `@{ … }` code block or a directive body, a setup statement can divide
  after its first token (`total / count > 1`, `(a) / b`). It used to fail with
  `Unterminated regular expression`.
- A `@{ … }` code block used as a value can be divided (`@{ <b /> } / 2`). It
  used to fail with `Unterminated regular expression`.
- An element on the line after a semicolon-less statement that ends with a type
  (`const x = y as Foo`, `let x: Foo`, `type T = Foo`) starts a new statement,
  as it does after `const x = y`. A `<` that starts a line inside a type is
  still a type operator.
