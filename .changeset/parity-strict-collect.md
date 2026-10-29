---
'@tsrx/core': patch
---

A normal compile now reports the same error as the editor for mistakes that TypeScript reports from its checker. Before, it threw acorn's message, or compiled without an error:

- `type A = readonly string;` reports TS1354 at `readonly` in a normal compile too. Before, it compiled.
- `await`, `for await` and `await using` directly in a namespace report TS1308, TS1103 and TS2852, not `Cannot use await in class static initialization block` or `Unexpected token`.
- `const;` and `for (let;;)` report TS1123, and `const x: number;` reports TS1155, instead of `Unexpected token`.
- A parameter property on a function's parameter reports TS2369, and one on a rest parameter TS1317, instead of a reserved word or `Unexpected token` error.
- `let` in a `for` head always starts a declaration list, as in TypeScript: `for (let.a of b)` reports TS1134 `Variable declaration expected.` at the `.`.
- A private name that no class around it declares (`this.#x`) is now recorded in the editor (TS1111), as a normal compile already reported it.
- A generic arrow function with one type parameter and no trailing comma (`<T>() => 1`) no longer reports TS7060 in a `.ts` file, where TypeScript accepts it. In a `.mts` or `.cts` file a normal compile now reports it too, as TypeScript does. The editor still shows it in a `.tsrx` file.
