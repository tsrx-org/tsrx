---
'@tsrx/typescript-plugin': patch
---

Fix `tsrx-tsc` under Deno using `node:module` load hooks so Volar's TypeScript CLI
patch is applied. This enables `.tsrx` imports and type checking without a custom
loader workaround or deprecated `require.extensions` hooks.
