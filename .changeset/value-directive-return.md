---
'@tsrx/core': minor
---

A `return` in the body of an `@if`, `@for`, `@switch` or `@try` used as a value (assigned, as in `const view = @switch (x) { … }`, passed to a function, in an expression container, or in an assigned fragment) now gets that body's error, as it does in a child position: `TSRX2002`, `TSRX2005`, `TSRX2009` or `TSRX2001`. Before, a `return` there took the directive off the template lowering: one with a value in any of these positions, and any `return` in an expression container. An `@if` whose branches were each one `return` compiled to a conditional (`const view = @if (x) { return <b />; } @else { return <i />; }` became `x ? <b /> : <i />`) and rendered on every target. Every other shape printed the directive unlowered and threw `Not implemented: JSXSwitchExpression` (or `JSXIfExpression`, `JSXForExpression`, `JSXTryExpression`), also in the editor, which then lost the whole file. For an `@if` or `@for` the strict compile threw that error too, in place of the diagnostic. A directive used as a value with no `return` in it compiles as before.

Migration: write each branch's value as its output, as in `const view = @if (x) { <b /> } @else { <i /> };`.
