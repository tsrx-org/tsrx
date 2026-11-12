---
'@tsrx/core': patch
---

`tsrx-tsc` and the editor now report TypeScript errors that start at a keyword or punctuation of a `.tsrx` file that had no mapping:

- TS7057 at an authored `yield` in a generator without a return type, also in a template condition such as `@if (yield 1)` (#257).
- TS2370 at the `...` of a rest parameter whose type is not an array, in function declarations, class methods, declared functions and components (#823).
- TS1316 on a nested `export as namespace`, whose `export`, `as` and `namespace` keywords now map to the source (#979).

A closing tag (`</div>`) and the `/>` of a self-closing tag now map to exactly their generated text, without the next character (#982). The `;` that ends an expression or variable statement gets a mapping of its own, so unreachable code (TS7027) still reports on a statement that ends with an element, and now also on one such as `foo();`.
