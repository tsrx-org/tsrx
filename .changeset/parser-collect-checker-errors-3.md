---
'@tsrx/core': patch
---

More mistakes that TypeScript's parser accepts and reports only from its checker
are recorded in `collect` and `loose` mode (the language server, the formatter,
and other editor tooling), which keep parsing, while a compile still throws them:

- A repeated accessibility modifier (`public protected x`).
- Decorators before a declaration other than a class, such as
  `@dec function f() {}`, `@dec const x = 1;`, or `export @dec function f() {}`,
  and decorators on a constructor. Decorators before a statement that isn't a
  declaration (`@dec x;`) still throw in every mode, as TypeScript's parser
  rejects them.
- A modifier on a rest parameter (`constructor(public ...rest: T[])`).

A repeated modifier is now reported at the modifier instead of at the token after
it, in every mode. An optional rest parameter (`...rest?: T[]`) is reported as
`A rest parameter cannot be optional.`, at the `?`, instead of as an optional
binding pattern. A `?` after an element of an array pattern (`const [a?] = b;`)
is a syntax error in every mode, as in TypeScript; it used to parse, or report
the optional binding pattern error.
