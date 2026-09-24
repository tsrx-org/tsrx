---
'@tsrx/prettier-plugin': patch
---

The arguments of a `new` expression now break like a call's. A long
`new Foo(a, b, c)` used to stay on one line however far past the print width it
went; it now prints one argument per line, and a last object argument or a lone
callback expands in place as it does in a call.

`trailingComma: "es5"` now follows Prettier: it leaves out the comma after the
last call argument and the last function parameter, which ES5 can't parse, and
keeps it in objects, arrays, imports, and type parameter lists. It used to print
a comma after arguments and parameters too. `trailingComma: "all"` and `"none"`
are unchanged.
