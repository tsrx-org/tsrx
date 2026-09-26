---
'@tsrx/core': patch
---

The parser reads more TypeScript keyword forms as TypeScript does:

- `abstract declare class A {}` is an abstract ambient class, as
  `declare abstract class A {}` is; it failed to parse. `abstract` before any
  other declaration (`abstract function f() {}`, `abstract interface I {}`,
  `export abstract let x = 1;`, `declare abstract type T = 1;`) is an error that
  TypeScript reports from its checker, so it's recorded in `collect` and `loose`
  mode, and a compile throws it. It used to fail in every mode, or, before an
  interface, compile without an error.
- `export default interface` with the interface's name on the next line is the
  default-exported interface; it failed to parse.
- `type as = 1;` and `type satisfies = 1;` are type aliases; they failed to
  parse. `type as number;` is now an error (a type alias missing its `=`), as in
  TypeScript, instead of an `as` expression, and so is `export type as = 1;`
  (`'{' expected.`), which used to compile as a type alias.
- `export global {}` and `export declare global {}` are global augmentations
  that TypeScript reports from its checker (`'export' modifier cannot be applied
  to ambient modules and module augmentations since they are always visible.`),
  recorded when collecting and thrown by a compile. They failed to parse.
- A TypeScript keyword written with a Unicode escape where TypeScript reads the
  keyword (`\u0061bstract class A {}`, `export d\u0065clare class A {}`,
  `\u0074ype T = 1;`, `let x: \u0073tring;`, `class A { \u0073tatic x = 1; }`,
  `x \u0061s T`, `class A { \u0063onstructor() {} }`) is TypeScript's syntax
  error `Keywords cannot contain escape characters.` at the word. Several used to
  compile as the keyword written out. Where TypeScript reads the word as a name
  (`let \u0061bstract = 1;`, `declare \u0067lobal {}`), it stays one.
