---
'@tsrx/vscode-plugin': patch
---

Add the `tsrx.typescript.backend` setting (`auto`, `classic`, `native`). On the native backend the extension registers the bundled `@tsrx/content-mapper` with the TypeScript 7 extension (`registerContentMappers`) for inferred projects, no longer patches the built-in TypeScript extension, and runs the TSRX language server without its TypeScript services. The extension now also activates when a single `.tsrx` file is opened and declares that it does not run in untrusted workspaces. Migration and rollback steps, the compatibility matrix against the classic path, and benchmarks are in `packages/content-mapper/ROLLOUT.md`, `COMPATIBILITY.md` and `BENCHMARKS.md`.
