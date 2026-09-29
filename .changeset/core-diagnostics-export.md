---
'@tsrx/core': patch
---

Export the error tables as `@tsrx/core/diagnostics`: `DIAGNOSTIC_CODES`, `TS_ERRORS` and `TSRX_ERRORS`, the same objects the package root exports, without loading the compiler. Tooling and tests that only need an error's code or message can import them from there.
