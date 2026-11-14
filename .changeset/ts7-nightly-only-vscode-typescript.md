---
'@tsrx/vscode-plugin': patch
---

With TypeScript 7 turned on and only the TypeScript 7 Nightly extension installed, the VS Code extension now treats `.tsrx` files as served by VS Code's own TypeScript, which is what happens: VS Code stands down only for the TypeScript 7 extension or a build of it from source. The status item says "VS Code TypeScript" instead of "No type checking", the notice that no TypeScript features work no longer appears, TSRX: Restart Language Server and Go to Source Definition use VS Code's TypeScript, and the TSRX language server no longer closes tags alongside it.
