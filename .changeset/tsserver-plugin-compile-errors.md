---
'@tsrx/typescript-plugin': minor
---

The tsserver plugin drops TypeScript's diagnostics for a `.tsrx` file while that file has a fatal TSRX compile error, as the classic language server's diagnostic filter always did: in that state the generated code is the raw source, so those diagnostics were noise beside the compile error the TSRX language server (or `@tsrx/content-mapper` on TypeScript 7) reports. The VS Code extension now hands this plugin to VS Code's own tsserver, so VS Code needs no tsconfig `plugins` entry; the entry remains for other editors' TypeScript servers.
