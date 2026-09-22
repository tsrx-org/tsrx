---
'@tsrx/vscode-plugin': patch
---

Activate Microsoft's TypeScript extensions directly and register `.tsrx` through TypeScript 7's `registerContentMappers` API for configured-project discovery. Remove the workaround that opened JavaScript/TypeScript files or created a temporary `tsrx-wake-up.ts`. Projects containing only `.tsrx` source files get TypeScript features without opening another file. The mapper still comes from `tsconfig.json`. Microsoft's extensions decide which server runs; TSRX neither reads their selection settings nor introduces its own.
