---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Some mistakes TypeScript reports from its checker are now reported, or recorded in the editor instead of failing the whole file:

- Two default exports that can't merge (`export default 1; export default 2;`) report TS2528 at each, and a name that two export specifiers or `export * as` export reports TS2300 at each, as TypeScript's binder does. Before, both compiled without an error.
- `import type a, { b } from 'a'` reports TS1363 at `type`. Before, it compiled.
- `import type A = B.C;` reports TS1392 at the declaration, and the editor records it and keeps the file's tree. Before, it threw at `B.C` in every mode.
- A function body in an ambient context (`declare function f() {}`, a function in a `declare namespace`) reports TS1183 at the body, and the editor records it and keeps the function. Before, it threw at the function's start in every mode.

The formatter refuses TS1363, TS1392 and TS1183, as Prettier does (Prettier formats a function body in a `declare namespace`, which the formatter still refuses).
