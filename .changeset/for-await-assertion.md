---
'@tsrx/core': patch
---

Parse a type assertion without parentheses in a `for await` head (`for await (a as T of x)`, `for await (a satisfies T of x)`), as TypeScript does. Prettier prints `for await ((a as T) of x)` that way, so the formatted code parses again (#769).
