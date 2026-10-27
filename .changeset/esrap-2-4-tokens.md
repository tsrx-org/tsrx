---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
---

Require esrap 2.4 and pass it the parser's tokens for editor output. esrap 2.4 removed the `boundaryTokens` option that kept the keywords and punctuation of the generated TypeScript mapped. A fresh install of `@tsrx/core` already got esrap 2.4, so `async` and `function` keywords, Vue's imports, interface declarations, and lowered dynamic tags lost their editor mappings. Single type parameters also printed as `<T,>` everywhere.

A generic arrow function with one type parameter now compiles to `<T,>(…) => …`, which TypeScript reads as an arrow function in TSX instead of a JSX tag (#707). Other type parameter lists print as written. Parameter decorators (#606) and the type arguments of a tagged template (#272) are no longer dropped from the compiled output.
