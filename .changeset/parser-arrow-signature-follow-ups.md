---
'@tsrx/core': patch
---

Arrow functions and signatures parse as TypeScript parses them in five more
cases:

- An async arrow function's optional rest parameter
  (`async (...a?: number[]) => a`) parses. `collect` and `loose` mode (the
  language server, the formatter, and other editor tooling) record TypeScript's
  `A rest parameter cannot be optional.` at the `?`, and a compile throws it, as
  for other functions. It used to fail with `Unexpected token` in every mode.
- A syntax error in a generic arrow function (`<T,>(x: T) => { x = ; }`) is
  reported where it is, instead of as `Unexpected token` at the type
  parameters, once the arrow function is read past its `=>`. So are the errors
  the parser reports on its parameters, such as an optional rest or binding
  pattern parameter, async ones included.
- A parameter's default in a function or constructor type, or in a method,
  call, or construct signature (`type F = (a = 1) => void`), is recorded in
  `collect` and `loose` mode as TypeScript's
  `A parameter initializer is only allowed in a function or constructor implementation.`,
  and the tree keeps it. A compile throws that message, instead of the parser's
  own.

Two kinds of code that used to compile are now syntax errors, as in
TypeScript:

- A call after `async (…)` followed by `=>` (`async(a)(b) => 1`), which
  compiled to `async (b) => 1`, fails at the `=>`.
- A type assertion in an arrow function's parameters (`(x as number) => x`,
  `(x!) => x`, `async ([a satisfies number]) => a`), which the output kept,
  fails with `Unexpected type cast in parameter position.` at the assertion.
  A type assertion in an assignment target (`(x as number) = 1`) still parses.
