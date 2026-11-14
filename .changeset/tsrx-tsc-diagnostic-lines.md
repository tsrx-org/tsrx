---
'@tsrx/typescript-plugin': patch
---

`tsrx-tsc` on TypeScript 5.9 and 6 now fails when a `.tsrx` file has a TSRX compile error, collected or fatal: where TypeScript alone would exit 0, it exits 2, the code tsc gives a run that reports errors and emits. A warning doesn't change the exit code. It prints the TSRX compiler's own errors and warnings the way `tsc` prints a diagnostic, without the `[tsrx-tsc] ` prefix and with the path relative to the current directory, such as `src/App.tsrx(4,2): error TSRX2011: …`. They go to standard output, before TypeScript's diagnostics, in the shape of tsc's `--pretty false` output, and tsc's own error count leaves them out. A mistake the TSRX parser reports with a TypeScript code, such as `TS1186`, no longer prints a second time when TypeScript reports the same code at the same place.
