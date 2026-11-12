---
'@tsrx/core': patch
---

On React, Preact and Hono, static JSX whose tag is a function or class declaration that the module assigns anywhere (`Tag = Replacement`, `[Tag] = […]`, `for (Tag of …)`) now stays at render time instead of being hoisted to a module-level constant, so the replacement renders. Before, the static kept the declaration's first value (#1287).
