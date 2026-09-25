---
'@tsrx/core': patch
---

More mistakes that TypeScript's parser accepts and reports only from its checker
are recorded in `collect` and `loose` mode (the language server, the formatter,
and other editor tooling), which keep parsing, while a compile still throws them:

- A parameter property with a binding pattern
  (`constructor(public [a]: number[])`).
- A parameter property modifier on a function's parameter
  (`function f(public x: number) {}`), at the first modifier.
- A `for` head's declaration with no name (`for (var; ;)`,
  `for (const of items)`, also in `@for`), as for a statement.
- `let` as a binding name or an assignment target (`var let`, `class let {}`),
  reported once for each `let`.

Decorators on a member of an object literal (`{ @dec m() {} }`) are a syntax
error in every mode, as in TypeScript. They used to parse, and the output left
them out.
