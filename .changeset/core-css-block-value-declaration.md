---
'@tsrx/core': patch
---

A declaration whose whole value is a `{}` block now parses as a declaration, as CSS reads it, so `@property --x { syntax: "*"; initial-value: { a }; }` compiles. It was `TSRX3013` (`Expected identifier`): the parser took the block for a nested rule's, as it did for a custom property's before. In a style rule, a value with more after the block (`color: {a} b`) is still an error, as CSS reads no declaration there, and a property that takes no block (`color: {red}`) now compiles to that declaration, which the browser drops. In `@property`, an `initial-value` that holds a block and more (`{a} b`, `{a}{b}`, `foo(){}`) is still an error too, as on main, though browsers keep it.
