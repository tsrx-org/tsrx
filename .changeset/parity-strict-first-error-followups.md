---
'@tsrx/core': patch
---

A strict parse (a normal compile) now throws the error TypeScript reports first, and a collecting parse (the editor) records it first, for more mistakes. Before, another error came first:

- Duplicate parameter names report TS2300 at each binding in the order they're written, so `function f(a, b, b, a) {}` throws at the first `a`, not the first `b`.
- A parameter property outside a constructor implementation reports TS2369 at its first modifier before the modifiers' own errors (`(public public x: number) => x` throws TS2369, not TS1028) and before any error in a method's body (`class A { m(public a) { let let = 1; } }`), but after a duplicate parameter name before it (`function f(x, public x) {}` throws TS2300 at the first `x`).
- `async <T,>(public [a]: T[]) => a` throws TS2369 at `public`, not `Unexpected token` at the `(`.
- Decorators written before `export` and after it report TS1206 at the first one: `@a export @b function f() {}` throws at `@a`.
- Decorators or modifiers before a class `static` block report TS1206 or TS1184 before the checker errors in the block. A syntax error in the block still comes first.
- In a `.mts` or `.cts` file, a generic arrow function's TS7060 comes before the checker errors in it, such as the TS7060 of the arrow functions in its parameters, and isn't reported after a mistake in its parameter list (`<T>(...a?: T[]) => a` reports TS1047 only), as in TypeScript.
