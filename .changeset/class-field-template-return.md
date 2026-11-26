---
'@tsrx/core': patch
---

A `return` in a template body in a class field's initializer or a class `static` block (`class A { v = <div>@if (x) { return; }</div>; }`) now gets the error it gets in a template at the top level, such as `TSRX2002` in an `@if` body, `TSRX2009` in an `@switch` case or `TSRX2005` in an `@for` body, instead of `TS1108` from the parser. acorn allows a `return` only in a function or at the top level, so the parser threw `'return' outside of function` there, and the editor lost the whole file. The strict compile threw it too, unless a template check rejected the `return` first, as it does one right in an `@switch` case (`TSRX2009`). A `return` there that isn't in a template, such as one right in a `static` block, is still `TS1108`.
