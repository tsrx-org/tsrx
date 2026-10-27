---
'@tsrx/core': patch
---

A keyed `@for` whose body is another `@for`, directly or inside an `@if` or `@switch` branch, now keys each iteration on React, Preact, and Hono. The inner loop's rows render in a `<Fragment>` with the outer key, so reordering the outer list moves each group's rows, and their state, with it instead of matching them up by position.

JSX in a directive header (`@for (… of …)`, `@if (…)`, `@switch (…)`, a `@case` test) now reads its text the way JSX does anywhere else. `@for (const item of [<span>Hello<b /></span>])` no longer fails with `Unexpected token`, and `[<span><b>1</b> 2</span>]` in a header inside an element keeps its text instead of failing to parse.
