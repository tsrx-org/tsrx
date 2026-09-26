---
'@tsrx/prettier-plugin': patch
---

A parenthesized right operand with the same logical operator (`a && (b && c)`)
now joins the chain like in Prettier, so every `&&`, `||`, or `??` of the chain
breaks together in one pass, instead of the operand staying on one line until
the next format split it. Its comments move with its operands, a JSDoc cast
keeps its parentheses, and a `prettier-ignore` comment keeps only the operand it
comes with as written.
