---
'@tsrx/language-server': patch
---

The `typescript.tsdk` startup option now also accepts the `typescript` package folder, such as `/path/to/node_modules/typescript`, not only its `lib` folder. Before, the server ignored the package folder without a message.

When the option names a folder with no TypeScript in it, for example a wrong path, the server now shows a warning. The warning names the folder, says which TypeScript the server uses instead, and says how to set the option. Before, the server showed nothing.

The warnings for no TypeScript and for TypeScript 7 now use shorter, plainer sentences. They first say which features do not work, then why, then what to do.
