---
'@tsrx/typescript-plugin': patch
'@tsrx/vscode-plugin': patch
---

Add **Find File References** for `.tsrx` files in VS Code on TypeScript 5.9 and 6. Right-click a `.tsrx` file in the Explorer or its editor tab, or run **TSRX: Find File References**, to list the `.ts`, `.js` and `.tsrx` files that import it in the References view, as VS Code's own command does for `.ts` files (that command refuses `.tsrx` files). With no folder open, they show where `references.preferredLocation` says. `@tsrx/typescript-plugin` adds the `_tsrx:fileReferences` request for it, which runs tsserver's `fileReferences` and gives the references in `.tsrx` importers at their source positions. TypeScript 7 has no Find File References yet (microsoft/TypeScript#63806), so there the command says so.
