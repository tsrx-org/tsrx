---
'@tsrx/mcp': patch
---

`compile-tsrx`, `analyze-tsrx`, and `validate-tsrx-file` now compile with the `tsrx.platform` set in the project's `tsconfig.json` (the nearest one to the file), so a file using `import.meta.env.platform` flags no longer fails with "Platform flag usage requires a configured TSRX platform" in a project that already selects a platform. A tsconfig that does not resolve to one platform (a broken `extends`, or references that select different platforms) only affects files that use flags, and the error then says why. The hosted endpoint never reads a tsconfig.
