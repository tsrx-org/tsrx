---
'@tsrx/core': patch
---

Fix a regression where a spread attribute preceded by a comment or non-ASCII whitespace inside the braces (`<div {/* c */ ...props} />`) failed to parse with `Unexpected token`. The peek that decides how to tokenize the attribute brace only skipped ASCII whitespace, so the ellipsis was read as raw template text. The token after an attribute `{` is now always tokenized as JavaScript, which also lets shorthand attributes like `{/* c */ id}` parse.
