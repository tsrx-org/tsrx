---
'@tsrx/core': patch
---

A custom property's value may hold `{}` blocks, as CSS allows: `.a { --x: {a} }` was `TSRX3013` (`Expected identifier`), since the CSS parser took the `{` for the start of a nested rule's block. An item that starts with a custom property name and a `:` is now read as a declaration, as CSS reads it, and its value runs to a `;` or `}` outside every `{}`, `()` and `[]` block, string and comment, so `--x: { a: b; c }`, `--x: [a; b]` and `--x: "}" /* } */` keep their whole value. `--x:hover { … }` is read as the declaration CSS reads it as, not a rule.
