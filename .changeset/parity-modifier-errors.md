---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser reports these modifier mistakes with TypeScript's error code and position, the same way in a normal compile and in the editor:

- `declare` directly inside an ambient namespace or module reports TS1038, as TypeScript does. Before, the parser reported nothing unless another modifier came with it.
- A modifier before a class `static` block (`public static {}`) is TS1184 at the modifier. Before, it threw a different message after the `{`, even in the editor. A decorator before a `static` block (`@dec static {}`) is now TS1206. The formatter prints both as `static {}`, as Prettier does.
- A parameter property on a method, an accessor, an object literal's method, or a constructor without a body (`m(public a) {}`) is TS2369, as it already was on a function. The formatter now refuses these, as Prettier does.
- `abstract` before a declaration other than a class inside a block (`function f() { abstract interface I {} }`), or in the body of an `if` or a label, is TS1184, not TS1242. The formatter still refuses it, also after a `declare` whose error TypeScript reports first (`{ declare abstract function f(): void; }`).
- Between `abstract` and `declare` in an ambient namespace, the first one reports its error, TS1242 or TS1038, as TypeScript does.
- `static constructor(…) {}` is TS1089 at `static`, and takes parameter properties, as TypeScript reads a constructor there.
- A modifier order or compatibility error (TS1029, TS1243) in a normal compile points at the modifier. Before, it pointed at the modifier's column on the first line of the file.
