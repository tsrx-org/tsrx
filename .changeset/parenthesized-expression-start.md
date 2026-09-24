---
'@tsrx/core': patch
---

The parser records where a parenthesized expression's outermost grouping
parenthesis opens, as `metadata.paren_start`. The parentheses of a call, an
`if`, or other syntax around the expression don't count. The formatter uses it
to find the parentheses of each JSDoc type cast.
