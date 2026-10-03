---
'@tsrx/core': patch
'@tsrx/typescript-plugin': patch
'@tsrx/vscode-plugin': patch
---

On TypeScript 5.9 and 6, **Organize Imports**, **Sort Imports** and **Remove Unused Imports** now change `.tsrx` files. Before, they did nothing. The quick fix that removes an unused import, **Fix All** for unused imports, and the auto-import quick fix that adds a new import line now work in `.tsrx` files too.

When an import does not end with `;`, the warning for an unused import now shows in `.tsrx` files on TypeScript 5.9 and 6. Before, it did not show.

The import actions still do not change a file in which a comment follows an import on the same line. TypeScript does not see the comment, so its edits would delete it.
