---
'@tsrx/core': patch
---

A normal compile now reports the same error as the editor, at the same place, for three more kinds of mistakes. Before, it threw another error, or the same code somewhere else:

- A parameter property modifier on an arrow function's parameter or in a function type (`const k = (public x: number) => x;`, `type F = (readonly x: number) => void;`, `async <T,>(public x: T) => x`) reports TS2369 at the modifier, or TS1317 before a rest parameter. Before, it reported `'public' is a reserved word` or `Unexpected token`.
- Decorators before something other than a class (`@dec function f() {}`, `export default @dec function f() {}`, `@dec export { a };`) report TS1206 at the first decorator, as TypeScript does, instead of at the declaration after them.
- A duplicate parameter name (`function f(a, a) {}`) reports TS2300 at its first binding, as TypeScript does first, instead of at the second.
