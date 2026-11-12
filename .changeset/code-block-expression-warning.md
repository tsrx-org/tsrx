---
'@tsrx/core': patch
'@tsrx/mcp': patch
'@tsrx/content-mapper': patch
'@tsrx/vscode-plugin': patch
---

Warn about a `@{ … }` with no output whose only statement is an expression there only for its value, such as `<p>@{user.name}</p>`, which renders nothing: `TSRX2035`, the first warning TSRX itself reports. In a child list the message says how to render an `@` and then the value. A call, an assignment and other expressions that may be there for their effect don't warn, nor does a directive, a block with output, or a block with more than one statement. Like every warning, it shows only in compiles that collect diagnostics, such as the editor and `tsrx-tsc`, and a build drops it. Compiled output doesn't change.

`@tsrx/mcp` now gives each compile error a `severity`, and a warning no longer makes `ok` false. `@tsrx/content-mapper` leaves warnings out, since TypeScript 7 would show each as an error, fail `tsc` on code that compiles, and hide TypeScript's own errors in the statement that holds it. The VS Code extension keeps the language server's warnings when TypeScript 7 serves the workspace, as the content mapper doesn't send them. So on TypeScript 7, `tsc --runExternalCode`, `tsrx-tsc` and editors that run the language server with `--typescript-backend=native` don't show warnings yet.
