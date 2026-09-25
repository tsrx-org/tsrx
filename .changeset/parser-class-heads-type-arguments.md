---
'@tsrx/core': patch
---

The parser reads type arguments after a superclass and after class and function
expressions as TypeScript does, and no longer crashes or drops code after
`export` or in array patterns:

- A superclass's type arguments stay on the class (`superTypeParameters`) when a
  line break follows them (`class D extends Base<T>` with the `{` or
  `implements` on the next line), instead of making the superclass an
  instantiation expression. The class then has the AST it has on one line, and
  compiled code prints `extends Base<T>` instead of `extends (Base<T>)`.
- A superclass's type arguments can start on the line after the superclass
  (`class A extends B` with `<T> {}` on the next line), which the formatter
  prints for a comment before them.
- Type arguments right after a class or function expression parse as an
  instantiation expression, call, `new`, or tagged template:
  `class<T> {}<string>`, `function <T>() {}<string>()`. On the next line, a `<`
  still starts an element, and an element still takes no type arguments.
- `export` followed by `abstract`, `type`, `namespace` or `module` and a line
  break (`export abstract` with `class A {}` on the next line), `export abstract;`,
  and `export @if (…) { … }` or another at-sign construct report
  `Unexpected token` instead of crashing with a TypeError.
- A decorator on an element of an array pattern (`const [@dec x] = y;`) is a
  syntax error at the `@`, as in TypeScript and in an object pattern. It used to
  be accepted and dropped from the output.
- An object method's type parameters can be `const` (`{ m<const T>(x: T) {} }`).
