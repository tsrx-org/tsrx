---
'@tsrx/language-server': patch
---

The `typescript.tsdk` startup option must name the `lib` folder of a TypeScript install. When it names another folder, for example the `typescript` package folder or a wrong path, the server now shows a warning. The warning names the folder, says which folder to use, and names the TypeScript the server uses instead. Before, the server ignored the option and showed nothing.
