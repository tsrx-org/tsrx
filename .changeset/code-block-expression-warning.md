---
'@tsrx/core': patch
'@tsrx/mcp': patch
'@tsrx/content-mapper': patch
---

Warn about a `@{ … }` whose only statement is an expression with no effect, such as `<p>@{user.name}</p>`, which renders nothing: `TSRX2035`, the first warning TSRX itself reports. In a child list the message says how to render an `@` and then the value. A call, an assignment and other expressions that may be there for their effect don't warn, nor does a block with output or more than one statement. Like every warning, it shows only in compiles that collect diagnostics, such as the editor and `tsrx-tsc`, and a build drops it. Compiled output doesn't change.

`@tsrx/mcp` now gives each compile error a `severity`, and a warning no longer makes `ok` false. `@tsrx/content-mapper` leaves warnings out, since TypeScript 7 would show each as an error, fail `tsc` on code that compiles, and hide TypeScript's own errors in the statement that holds it.
