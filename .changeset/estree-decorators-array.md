---
'@tsrx/core': patch
---

Classes, methods, and properties now always carry a `decorators` array, empty
when undecorated, as ESTree's decorators extension requires. The parser set it
only when a decorator was present, and the types declared it optional, so
another declaration of the extension on the shared `estree` interfaces failed
to merge with core's in the same program (TS2687, TS2717, TS2430). The types
now declare `decorators: Decorator[]` on methods, properties, and classes.
