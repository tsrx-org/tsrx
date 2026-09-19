---
'@tsrx/vscode-plugin': patch
---

Add a native TypeScript 7 backend. The extension follows VS Code's own TypeScript 7 switch (`js/ts.experimental.useTsgo`, written by the "Select TypeScript Version" picker), with no setting of its own and without consulting any other extension. With TypeScript 7 on, TypeScript 7 runs `@tsrx/content-mapper` for the `.tsrx` files each `tsconfig.json` declares under `contentMappers`, and the extension no longer patches the built-in TypeScript extension and runs the TSRX language server without its TypeScript services; with it off, the classic backend runs unchanged. The extension now also activates when a single `.tsrx` file is opened and declares that it does not run in untrusted workspaces. Migration and rollback steps, the compatibility matrix against the classic path, and benchmarks are in `packages/content-mapper/ROLLOUT.md`, `COMPATIBILITY.md` and `BENCHMARKS.md`.
