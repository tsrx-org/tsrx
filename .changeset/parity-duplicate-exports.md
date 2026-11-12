---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

More exports that TypeScript's binder declares twice now report its error, at the same places. Before, these compiled without an error, or with another code:

- Two `export =` assignments report TS2300 `Duplicate identifier 'export='.` at each.
- Duplicate exports inside a `declare namespace`, a `declare module "m"` or a `declare global` body report TS2300 or TS2528, as at the top of a module.
- A string export name is the same name as the identifier it spells: `export { a as "b" }; export { c as b };` reports TS2300 at each, named as written.
- `export * as default` twice reports TS2300, not TS2528: it exports a name, not a default export.
- A default-exported function is declared before the other statements, as in TypeScript, so `export default x; export default function f() {}` reports TS2528 at `x` and at `f`.
- A parenthesized default export (`export default (a)`) is an expression, reported at `export`, not an alias of `a`.
- `import type a, {} from 'a'` reports TS1363 at `type`, as `import type a, { b } from 'a'` does. The formatter refuses it, as Prettier does.
