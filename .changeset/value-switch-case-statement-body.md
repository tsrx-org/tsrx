---
'@tsrx/core': patch
---

In an `@switch` used as a value (`{@switch (n) { … }}`, also in a fragment), the code in a case is now read as it is when the `@switch` is a child. The parser read a `{` that starts a statement inside other code there, such as a `while` loop's or a label's body, or a block in an `if`, a loop or a `switch`, as an expression container. So `while (ready) { return <b />; }` and `while (ready) { break; }` failed with `Unexpected token`, `while (ready) { f(); g(); }` and `if (ready) { { f(); g(); } }` with `'}' expected`, and `while (ready) { f(); }` compiled only through the container, with a spurious `TSRX1007` when collecting. Each now compiles or reports the error it gets as a child, such as `TSRX2009` for that `return`. A block in a class `static` block in markup (`<p>{class { static { if (x) { { f(); g(); } } } }}</p>`) is read as a block too.
