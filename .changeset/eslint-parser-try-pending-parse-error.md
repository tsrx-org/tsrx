---
'@tsrx/eslint-parser': patch
---

A plain `try { … } pending { … }` statement with no `catch` or `finally` is now a parse error ("Missing catch or finally clause") instead of crashing ESLint. It compiles to a `try` with neither, which isn't valid JavaScript.
