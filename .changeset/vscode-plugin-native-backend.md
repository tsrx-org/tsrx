---
'@tsrx/vscode-plugin': minor
---

Add native TypeScript 7 support while leaving every TypeScript feature for `.tsrx` files to VS Code's selected TypeScript. On TypeScript 5.9/6, the extension contributes and ships `@tsrx/typescript-plugin`, so VS Code's tsserver handles `.tsrx` files without a tsconfig `plugins` entry. The extension activates Microsoft's TypeScript extensions and leaves server selection to them. On TypeScript 7 it registers `.tsrx` for configured-project discovery; each project's `contentMappers` entry supplies the mapper. The extension neither bundles nor hosts TypeScript, patches no other extension, and has no backend setting of its own.

The TSRX language server always runs slim for TSRX-specific features and compile errors; the extension drops its compile-error copy for files the native mapper reports on. The extension activates when a single `.tsrx` file is opened and does not run in untrusted workspaces. Migration steps, the compatibility matrix and benchmarks are in `packages/content-mapper/ROLLOUT.md`, `COMPATIBILITY.md` and `BENCHMARKS.md`.
