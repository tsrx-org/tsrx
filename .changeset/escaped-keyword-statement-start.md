---
'@tsrx/core': patch
---

A statement that starts with a keyword written with an escape, which TypeScript reads as the keyword there, now gets TypeScript's error on the word: TS1260 `Keywords cannot contain escape characters.` for a modifier before a declaration (`\u0061sync function f() {}`, `if (x) \u0061ccessor class C {}`), `async` before an arrow function's parameter (`\u0061sync foo => foo;`), and `let`, `using` or `yield` where they start a declaration or a `yield`, and TS1128 `Declaration or statement expected.` for a class member's modifier that starts no statement in a list (`\u0061ccessor foo;`). The compiler read the word as a name and reported TS1434 `Unexpected keyword or identifier.` on it, or TS1005 `';' expected.` at the next token. A strict compile still reports TS1214 first for a word reserved in strict mode (`let`, `yield`, `static`).
