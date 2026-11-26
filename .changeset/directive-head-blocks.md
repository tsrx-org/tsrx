---
'@tsrx/core': patch
---

A function with a block body in an `@for` head or `key` clause (`@for (const y of ys.filter((v) => { return v > 0; }))`, `key ((() => { … })())`) now compiles. The parser read the first block in the head, such as the function's body or a class `static` block, as the `@for`'s own body, and in element children the `)` after it as template text, so the head failed to parse (`TS1012`) on every target, in the editor too. Where the next character was a `}` or `]`, as after an object method, it parsed, with the body marked as a directive body. A `for…of` or `for…in` loop in a function in any directive head (`@if`, `@for`, `@switch`, `@case`) is now read as code too: its body and the rest of the function were read as template text, so `if (w > 1)` compiled to `if (w &gt; 1)`, which doesn't parse, Prettier failed on the file, and a loop body without braces failed to parse (`TS1434`).
