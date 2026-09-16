---
'@tsrx/core': patch
---

Fix AST line/column locations for spread attributes whose `{...` spans multiple lines inside a TSRX template body. The `...` was first read as raw template text up to the closing brace and then re-tokenized, so the line breaks inside the spread were counted twice. This misplaced diagnostics and made source-map generation throw `Location line or line offsets length is out of bounds`. The spread is now tokenized directly.
