---
'@tsrx/core': patch
---

A declaration whose whole value is a `{}` block now parses as a declaration, as CSS reads it, so `@property --x { syntax: "*"; initial-value: { a }; }` compiles. It was `TSRX3013` (`Expected identifier`): the parser took the block for a nested rule's, as it did for a custom property's before. A value with more after the block (`initial-value: {a} b`) is still an error, as in CSS, and a property that takes no block (`color: {red}`) now compiles to that declaration, which the browser drops.
