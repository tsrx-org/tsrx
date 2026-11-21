---
'@tsrx/core': patch
---

A comment in a declaration value no longer ends the value. The CSS parser read a `;`, `{` or `}` in it as the value's end: `.a { color: red /* } */ }` was `TSRX3013` (`Expected identifier`), `.a { color: red /* ; */ } .b {}` was `TSRX3013` (`CSS Declaration cannot be empty`), and a compact `.p { :global{color: red /* } */} }` read the comment's `}` as the block's end. These now parse, and the output keeps the comment. A comment a value leaves open is `TSRX3013` (`Unexpected end of input`), as one between declarations already is.
