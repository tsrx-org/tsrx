---
'@tsrx/core': patch
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
---

Carry diagnostic severity and codes through the collected-error channel end to end. `CompileError` gains an optional `severity: 'error' | 'warning'` (absent means error) and `error()` accepts it as a trailing parameter, so consumer compilers can publish warning-severity diagnostics. `tsrx-tsc` now prints collected diagnostics in tsc convention — `[tsrx-tsc] file(line,col): <error|warning> <code>: message` — instead of dropping `code`, and a fatal `.tsrx` compile failure no longer suppresses sibling files' semantic diagnostics (the raw-source fallback is editor-only; the CLI emits a valid stub module); the run still exits nonzero — `tsrx-tsc` tracks the printed failure since the stub yields no TypeScript diagnostic. The language server's compile-diagnostic plugin maps `severity: 'warning'` entries to real editor warnings.
