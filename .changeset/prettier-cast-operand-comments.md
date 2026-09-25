---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A comment inside a JSDoc cast stays in the cast when an operator follows it. `a && /** @type {T} */ (b && (c /* c */)) || d` keeps the comment in the cast, instead of moving it onto the operand before `||`.
