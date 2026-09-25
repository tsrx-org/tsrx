---
'@tsrx/core': patch
---

The parser reads two more TypeScript shapes the way TypeScript does:

- An operator after an element or fragment that starts a statement continues
  the expression, with the element as its left operand (`<div /> > 5;`,
  `<div /> ? a : "b";`, `<div /> + 1;`). Operators that can't start a statement
  used to fail with `Unexpected token`, and `+` and `-` split off into a
  separate statement. On the next line, as a `@{ … }` code block's render node,
  and inside templates, an element still ends where it closes.
- Type parameters that start on the line after the name of a class, interface,
  type alias, function, or method (`class G // comment` with `<T> {}` on the
  next line) are read as type parameters. They used to fail with
  `Unexpected token`, because a `<` at the start of a line reads as the start of
  an element.
