---
'@tsrx/core': patch
---

Exports that two blocks of one namespace or ambient module declare twice now report TypeScript's error at each, and two default-exported classes of one name report TS2528 as TypeScript does. Before, these compiled without an error, or with another code first:

- `declare namespace N { … }` blocks with one name, and `declare module 'm' { … }` blocks with one specifier, share their exports, as TypeScript merges them: `export { a }` in one and `export { b as a }` in another report TS2300 at each, and `export default` in two report TS2528 at each.
- Declarations that two blocks export with one name report TS2451, TS2300 or TS2567 at each, as in `namespace N { export const a = 1; }` twice. That includes the declarations an ambient block without export declarations exports.
- `export default class C {}` twice reports TS2528 at each `C`, not TS2300 `Identifier 'C' has already been declared`, which a strict parse threw first.
