---
'@tsrx/core': patch
---

In the editor, a TypeScript error on a whole expression inside a `switch` now covers that expression. The editor mapped a `switch` statement as one block from its source text to the printed text, and mapped every range inside it by offset. An `@switch` or `@case` loses its `@` when printed, so `@switch (props.n as string)` reported TS2352 on `(props.n as strin`. Errors on a later `@case` test or an expression in a case body drifted further, and so did errors in a plain `switch` whose spacing the printer changes. Now a `switch` and each of its cases map only their ends, as a loop does. A fallthrough (TS7029) still shows on its `case` head, and unreachable code (TS7027) on a whole `switch` or at the end of a case still shows there. This applies to React, Preact, Vue, Hono and Hono DOM, and to a plain `switch` on every target.
