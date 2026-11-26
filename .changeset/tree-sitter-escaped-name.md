---
'@tsrx/zed-plugin': patch
'@tsrx/nvim-plugin': patch
---

The tree-sitter grammar now reads a Unicode escape in a name (`\u0061`, `\u{61}`), as tree-sitter-javascript and TypeScript do. A tag in children whose name starts with one (`<\u0049nner n={5} />`), which the scanner opens as a tag since the compiler reads one there, is now a `jsx_self_closing_element` with its name and attributes, where it was an `ERROR` node. So is a declaration's name written with an escape (`const \u0061 = 1;`).
