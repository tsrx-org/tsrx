---
'@tsrx/core': patch
---

The parser reads default-exported classes and decorators the way TypeScript
does. Each change works around a bug in `@sveltejs/acorn-typescript` until a
release fixes it:

- An anonymous default-exported class can start with `implements` or be
  `abstract` (`export default class implements I {}`,
  `export default abstract class<T> extends B {}`) instead of failing with
  `The keyword 'implements' is reserved` or `Unexpected token`. A class
  expression that starts with `implements` now has `id: null`, like any other
  anonymous class.
- A decorated default-exported class (`export default @dec class B {}`) is a
  class declaration instead of a class expression: its name is a module
  binding, and the class ends the statement, as without the decorator. With
  `abstract` (`export default @dec abstract class {}`) it parses instead of
  failing with `Unexpected token`.
- Decorators written before `export` must be followed by an exported class,
  as TypeScript requires. Before anything else (`@dec export function f() {}`,
  `@dec export const A = class {}`, `@dec export default (class {})`) they used
  to be dropped or moved onto a class expression inside; they are now an error,
  `Leading decorators must be attached to a class declaration.`, as they already
  were before a statement that isn't a class.
- A rest parameter can have decorators (`m(@dec ...rest: T[]) {}`), like any
  other parameter, instead of failing with `Unexpected token`.
