---
'@tsrx/core': patch
---

In a `.mts` or `.cts` file, a type assertion that holds another (`<A>(<B>x)`) now reports its own TS7059 first, as tsc does: a strict parse throws the outer assertion's TS7059, and a collecting parse records it before the errors in the operand, by position. Before, both reported the innermost assertion first.
