---
'@tsrx/mcp': patch
---

`review_tsrx_styles` recognizes self-closing `<style apply={…} />` blocks and reports exported or applied blocks as themes, and the documentation index covers the scoped-style sections of the specification, including the amended scope rule (a block styles the items beside it, never the element that contains it), the `tsrx-style-standalone-outside-template` diagnostic, and plain-TSX `<style>{css}</style>`, which `review_tsrx_styles` now reports as an ordinary element rather than an error.
