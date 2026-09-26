---
'@tsrx/core': patch
---

More parameter mistakes that TypeScript's parser accepts and reports only from
its checker are recorded in `collect` and `loose` mode (the language server, the
formatter, and other editor tooling), which keep parsing, while a compile still
throws them:

- A parameter property modifier on the parameter of a function or constructor
  type, or of a method, call, or construct signature
  (`type F = (public x: number) => void`), at the first modifier.
- A parameter property modifier on an arrow function's parameter
  (`(public x: number) => x`, `async (readonly x: number) => x`), where
  TypeScript reads the list as the arrow function's parameters.

Three mistakes that used to compile are now reported, and a compile throws
them, as TypeScript's checker reports them:

- A parameter property whose binding pattern has a default
  (`constructor(public [a] = [1])`), as one without a default is. Its output
  didn't build.
- An arrow function's optional rest parameter (`(...a?: number[]) => a`), as a
  function's is.
- An arrow function's optional binding pattern parameter
  (`({ a }?: T) => a`), as a function's is.
