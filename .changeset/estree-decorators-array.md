---
'@tsrx/core': patch
---

Classes, methods, and properties always carry a `decorators` array, empty when
undecorated, as ESTree's decorators extension specifies. The parser set it only
when a decorator was present, and the types declared it optional. Rollup
declares the same property as required, and interface merging needs every
declaration to match, so a program that loaded both core's and rollup's types
failed to typecheck (TS2687, TS2717, TS2430). The types now declare
`decorators: Decorator[]` on methods, properties, and `BaseClass`, the same as
rollup.
