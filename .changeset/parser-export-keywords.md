---
'@tsrx/core': patch
---

The parser reads the words after `export` as TypeScript does:

- `abstract` or `declare` followed by a line break is no modifier.
  `export default abstract` with `class A {}` on the next line exports the value
  of `abstract` and declares the class `A` on its own; it used to parse as one
  abstract class, the default export. `export declare` with a declaration on the
  next line, and decorators before `abstract` or `declare` and a line break
  (`@dec abstract` with `class A {}` on the next line), are syntax errors. The
  decorators used to go to the class, and `declare` made it ambient.
- `abstract`, `type`, `namespace` or `module` after `export`, before a
  declaration it doesn't start, is an error instead of being left out of the
  output. `export abstract function f() {}` used to compile to
  `export function f() {}`. `abstract` before a function, variable, or import
  declaration is an error that TypeScript reports from its checker, so it's
  recorded in `collect` and `loose` mode, and a compile throws it. The others,
  such as `export type const x = 1;`, are syntax errors.
- The syntax errors are TypeScript's, at its positions. Where what follows
  `export` starts no declaration, including `export abstract` before a line
  break, that's `Declaration or statement expected.` at `export`, instead of
  `Unexpected token` at the word after it.
