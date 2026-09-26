---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser reads more TypeScript keyword forms as TypeScript does:

- A TypeScript word in parentheses at the start of a statement is an
  expression, so `(abstract) class A {}`, `(declare) class A {}` and
  `(type) T = 1;` are syntax errors, as in TypeScript. A compile read the word as
  the keyword.
- `type T = intrinsic;` is the `intrinsic` keyword, and `type T = interface;` a
  reference to a type named `interface`; the two were swapped. `intrinsic`
  written with an escape is an error, and so is anything after the keyword but
  `;` (`type T = intrinsic[];`), as in TypeScript.
- The options of an import type are `{ with: … }` or `{ assert: … }` around the
  import attributes, as TypeScript requires. Any other object literal
  (`import("m", { foo: {} })`) is TypeScript's syntax error now; it compiled.
- `type` written with a Unicode escape in an import or export clause
  (`import \u0074ype { a } from "m";`, `import { \u0074ype a } from "m";`) is a
  type-only import or export, as in TypeScript; it failed to parse.
- A class member's modifier, or a repeated or misplaced one, before a
  declaration (`public class A {}`, `readonly function f() {}`,
  `async class A {}`, `declare declare class A {}`, `abstract export class A {}`,
  `declare import x from "m";`) is an error that TypeScript reports from its
  checker, so it's recorded in `collect` and `loose` mode, and a compile throws
  it. It failed to parse in every mode. `async` in an ambient declaration is one
  of these errors, so a compile of `export declare async function f(): void;`
  throws it now.
- `export default @dec declare class A {}` (also with `abstract`) is a
  default-exported ambient class; it failed to parse.

`@tsrx/prettier-plugin` prints the `intrinsic` keyword, which it printed as an
unknown node.
