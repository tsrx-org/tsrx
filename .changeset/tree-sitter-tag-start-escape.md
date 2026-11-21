---
'@tsrx/zed-plugin': patch
'@tsrx/nvim-plugin': patch
---

The tree-sitter grammar now ends text at a `<` before a Unicode escape for a character a name can start with (`<\u0049nner />`), as the compiler does, and before a letter outside ASCII, as its other name checks read one (`iswalpha`). Before, the `<` and what follows it were text. A braced escape (`<\u{49}`) is still text, so that its `{` still starts an expression when the escape doesn't spell a name's start.
