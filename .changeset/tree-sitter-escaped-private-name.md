---
'@tsrx/zed-plugin': patch
'@tsrx/nvim-plugin': patch
---

The tree-sitter grammar now reads a private name the way it reads any other name: with a Unicode escape (`#\u0061b`, `#c\u{64}`) or a letter outside ASCII (`#é`), as tree-sitter-javascript and TypeScript do. `class C { #\u0061b = 1; }` is a field named `#\u0061b`, where the `#` became an `ERROR` and the rest (`\u0061b = 1`) a public field.
