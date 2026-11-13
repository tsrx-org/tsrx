---
'@tsrx/typescript-plugin': patch
---

`tsrx-tsc` on TypeScript 5.9 and 6 now exits with code 2 when a `.tsrx` file has a TSRX compile error, collected or fatal, as it does for TypeScript's errors; a warning still exits 0. It prints the TSRX compiler's own errors and warnings the way `tsc` prints a diagnostic, without the `[tsrx-tsc] ` prefix and with the path relative to the current directory, such as `src/App.tsrx(4,2): error TSRX2011: …`. They go to standard output, before TypeScript's diagnostics. A mistake the TSRX parser reports with a TypeScript code, such as `TS1186`, no longer prints a second time when TypeScript reports the same code at the same place.
