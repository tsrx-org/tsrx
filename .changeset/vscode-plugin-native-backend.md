---
'@tsrx/vscode-plugin': patch
---

Add the `tsrx.typescript.backend` setting (`auto`, `classic`, `native`). On the native backend TypeScript 7 runs `@tsrx/content-mapper` for the `.tsrx` files each `tsconfig.json` declares under `contentMappers`; the extension no longer patches the built-in TypeScript extension, depends on no other extension's API, and runs the TSRX language server without its TypeScript services. `auto` follows VS Code's TypeScript 7 setting (`js/ts.experimental.useTsgo`). The extension now also activates when a single `.tsrx` file is opened and declares that it does not run in untrusted workspaces. Migration and rollback steps, the compatibility matrix against the classic path, and benchmarks are in `packages/content-mapper/ROLLOUT.md`, `COMPATIBILITY.md` and `BENCHMARKS.md`.
