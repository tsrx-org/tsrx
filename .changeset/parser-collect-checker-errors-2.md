---
'@tsrx/core': patch
---

More mistakes that TypeScript's parser accepts and reports only from its checker
are recorded in `collect` and `loose` mode (the language server, the formatter,
and other editor tooling), which keep parsing, while a compile still throws them:

- An `import` or `export` inside a block, such as a function body or a
  `@{ … }` body, or the next top-level `export` when a function is missing its
  `}`. A collecting parse now goes on to report the missing `}`.
- A `const` or `var` with nothing after it, and a bare `let`, as while a
  declaration is being typed. The declaration has no declarators, and
  `Variable declaration list cannot be empty.` is recorded right after the
  keyword, where TypeScript reports it.
- A modifier where TypeScript doesn't allow one: on an interface or type literal
  member (`interface I { private x: number }`), on a type parameter
  (`interface I<public T> {}`), or `in` and `out` outside the type parameters of
  a class, interface, or type alias (`function f<in T>() {}`). The error used to
  show the source of a JavaScript function instead of a message, at the token
  after the modifier, in every mode. It now reads
  `'private' modifier cannot appear on a type member.`, at the modifier.

An optional binding pattern parameter in a signature without a body, such as an
overload (`function f({ a }?: T): void;`) or an abstract method, is valid
TypeScript and now parses in every mode. It's still an error in a function with
a body.
