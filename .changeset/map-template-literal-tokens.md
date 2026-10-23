---
'@tsrx/core': patch
---

Map template literal text and delimiters independently of interpolations in
editor output, preserving accurate source positions when expressions are
reformatted or lowered. Keep authored CRLF and escape spellings in template
text so TypeScript 7 receives verbatim mappings for each literal token.
