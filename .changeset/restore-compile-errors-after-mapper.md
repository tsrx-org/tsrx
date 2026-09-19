---
'@tsrx/vscode-plugin': patch
---

Restore the language server's TSRX compile errors when `@tsrx/content-mapper` diagnostics disappear for a file (TypeScript 7 off without a reload, the file leaves a `contentMappers` project, or the mapper clears). The extension already dropped the server's copy while the mapper reported; that filtered set is no longer left in place after coverage ends.
