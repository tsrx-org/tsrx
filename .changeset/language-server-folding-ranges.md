---
'@tsrx/language-server': patch
'@tsrx/vscode-plugin': patch
---

Code folding now works in `.tsrx` files. The language server answers `textDocument/foldingRange` with folds computed from the TSRX source, the way TypeScript folds TSX: functions, class `static` blocks and other blocks, `@{ ... }` bodies, each `@if`, `@for`, `@switch` and `@try` body and its `@else`, `@empty`, `@case`, `@default`, `@catch` and `@pending` clauses, multi-line elements, attribute lists and `<style>` blocks, objects, arrays, multi-line calls, template strings, groups of imports, import attributes, comments and `// #region` markers, plus the CSS rules inside `<style>`. While a file does not parse, folds follow indentation and region markers.

Before, VS Code showed no folds at all in `.tsrx` files, with TypeScript 5.9, 6 or 7: TypeScript returned none for them, which also turned off VS Code's folding by indentation, and the server only folded CSS rules in `<style>`.
