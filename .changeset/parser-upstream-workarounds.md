---
'@tsrx/core': patch
---

The parser reads four TypeScript forms the way TypeScript does. Each works
around a bug in `@sveltejs/acorn-typescript` until a release fixes it:

- `static` followed by a line break is a modifier. `static` with `count = 0` or
  `create() {}` on the next line used to become an instance field named
  `static` and an instance member, so the compiled class lost its static
  members. `static` still names a member when the next line can't continue it
  (`static` then `()`, `=`, `;`, or `}`), a second `static` is still a name, and
  the other modifiers (`readonly`, `public`, …) still need the next token on
  their own line. In an interface, `static` before a line break is now an
  error, like `static` with the member on its line.
- An interface whose first member is a generic call signature
  (`interface I { <T>(x: T): T }`) parses instead of failing with
  `Unexpected token`.
- A class can be named after a TypeScript contextual keyword
  (`class global {}`, `class abstract {}`, `class type {}`, …), as a
  declaration or an expression, instead of failing with `Unexpected token`.
- `assert` on the line after an `import` or `export … from` without a
  semicolon starts the next statement (`assert(ok)`) instead of import
  assertions. `assert { … }` after a line break is now an error, as in
  TypeScript.
