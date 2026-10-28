---
'@tsrx/core': patch
---

Static JSX stays in place when its tag reads a binding declared in an earlier `case` of the same `switch`. A component in a namespace body keeps its static JSX and helper components in place, since a name there can read an export of any declaration of the namespace (`Foo` inside `namespace Outer.Foo`, or an export of another `namespace Outer` block). Before, such JSX was hoisted to module scope, where the tag named a different binding of the same name.
