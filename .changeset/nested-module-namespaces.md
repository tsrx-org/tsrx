---
'@tsrx/core': patch
---

`createScopes` now scopes a `module` declaration as a namespace when it is
inside a `declare` block or is an inner part of a dotted name, as TypeScript
does. Before, `declare module A.B { … }` and `declare namespace A { module B { … } }`
gave `B` a `module` binding and a submodule scope, and two `module B` blocks in
one `declare namespace` failed with `'B' has already been declared`. The new
`isSubmoduleDeclaration(node, path)` export applies the same rule for compilers
that check submodules themselves. `TSModuleDeclaration.body` is now typed as
optional and as `TSModuleBlock | TSModuleDeclaration`, matching what the parser
produces for `declare module 'x';` and dotted names.
