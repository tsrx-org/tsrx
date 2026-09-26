---
'@tsrx/core': patch
---

Arrow function parameters, rest parameters, and `for` heads parse as
TypeScript parses them in four more cases:

- A type assertion in the head of a `for…in` or `for…of` loop
  (`for ((a as T) of x)`, `for ([a!] of x)`) parses, and the tree keeps it, as
  it does for an assignment target. It used to fail with
  `Unexpected type cast in parameter position.` in every mode.
- An async arrow function's rest parameter covers its `?` and its type
  annotation (`async (...a: number[]) => a`), as other rest parameters do, so
  the formatter keeps a comment before the annotation where it is.
- A rest parameter's default (`function f(...a = []) {}`, `(...a = []) => a`,
  `type F = (...a = []) => void`) is recorded in `collect` and `loose` mode
  (the language server, the formatter, and other editor tooling) as
  TypeScript's `A rest parameter cannot have an initializer.`, and the tree
  leaves the default out, as typescript-estree does. A compile throws that
  message. It used to fail with `Unexpected token` in every mode.
- A parameter after an arrow function's rest parameter (`(...a, b) => 1`) is
  recorded in `collect` and `loose` mode, as it is for other functions, and the
  arrow function keeps all its parameters. A compile still throws.

Code that used to parse is now a syntax error, as in TypeScript: a `?` or a
type annotation after an item of a parenthesized expression, of a call's or
`new`'s arguments, of an array literal, or of a decorator's arguments, where
no `=>` follows (`(x: number)`, `f(x?)`, `f(...x: number[])`,
`[x: number]`). It fails with `Did not expect a type annotation here.` or
`Unexpected token` there. The compile used to crash with
`Not implemented: TSTypeCastExpression`, or print the mistake back.
