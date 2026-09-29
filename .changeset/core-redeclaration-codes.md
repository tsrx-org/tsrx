---
'@tsrx/core': patch
---

Report two mistakes with the code TypeScript reports for them (#948):

- A `let`, `const`, or `using` declaration's name declared again in the same scope, by another variable or a class (`let a; let a;`, `let a; var a;`), is TS2451 `Cannot redeclare block-scoped variable 'a'.` instead of TS2300. A redeclaration where a `var`, a class, a function, or a parameter comes first stays TS2300, as in TypeScript.
- A private name outside any class (`this.#x`, `#x in obj`) is TS18016 `Private identifiers are not allowed outside class bodies.` instead of TS1111. A strict parse of `#x in obj` there throws it instead of `Unexpected token`.
