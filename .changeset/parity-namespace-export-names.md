---
'@tsrx/core': patch
---

More exports that two blocks of one namespace declare twice now report TypeScript's error, in its order. Before, these compiled without an error:

- A namespace's own name: an instantiated namespace conflicts with a variable, as in TypeScript (`namespace a { export const x = 1; }` in one block, `export const a = 1` in another), and one that declares only types shares its name. It no longer hides the other declarations of that name, so `var X` and `let X` in two blocks report TS2300 even with a `namespace X {}` in a third.
- `export import A = …` in one block and `export { b as A }` in another report TS2300 at each.
- Errors at one position come in tsc's order, by code.
