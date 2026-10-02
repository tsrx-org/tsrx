---
'@tsrx/vscode-plugin': patch
---

The extension no longer ships a copy of TypeScript 5.9.3 inside its language server bundle, which it never loaded: the VSIX is 3.5 MB instead of 7.4 MB. The extension's language server runs beside VS Code's own TypeScript and loads none.
