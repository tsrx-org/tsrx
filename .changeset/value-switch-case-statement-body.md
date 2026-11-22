---
'@tsrx/core': patch
---

In an `@switch` used as a value (`{@switch (n) { … }}`, also in a fragment), the body of a `while` loop or a label in a case is now read as a block, as it is when the `@switch` is a child. The parser read its `{` as an expression container, so `while (ready) { return <b />; }` and `while (ready) { break; }` failed with `Unexpected token`, `while (ready) { f(); g(); }` with `'}' expected`, and `while (ready) { f(); }` compiled only through the container, with a spurious `TSRX1007` when collecting. Each now compiles or reports the error it gets as a child, such as `TSRX2009` for that `return`.
