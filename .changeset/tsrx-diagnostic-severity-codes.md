---
'@tsrx/core': patch
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
---

Carry diagnostic severity and codes through the collected-error channel end to end. `CompileError` gains an optional `severity: 'error' | 'warning'` (absent means error) and `error()` accepts it as a trailing parameter, so consumer compilers can publish warning-severity diagnostics. `tsrx-tsc` now prints collected diagnostics in tsc convention — `[tsrx-tsc] file(line,col): <error|warning> <code>: message` — instead of dropping `code`. The language server's compile-diagnostic plugin maps `severity: 'warning'` entries to real editor warnings.
