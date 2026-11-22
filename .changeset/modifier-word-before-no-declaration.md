---
'@tsrx/core': minor
---

`export`, `async` and `abstract` before something TypeScript reads no declaration from now fail with TypeScript's errors. `export foo;` (also `export 1;`, `export async foo;`, `export declare foo;`, and the same in a block or a namespace) is TS1128 `Declaration or statement expected.` at `export`, where the compiler reported TS1012 `Unexpected token` after it, or TS1184 in a block. `async foo;` and `abstract foo;` are TS1434 `Unexpected keyword or identifier.` at the word, which TypeScript reads as a name there, where the compiler reported TS1012 at the token after the name, or at `abstract`. Before them, `declare` is the name `declare` with no error after it, and the next statement starts at the word, as in TypeScript: `declare export foo;` is TS1128 at `export` (it was TS1005 `';' expected.`), and `declare async foo;` and `declare abstract foo;` are TS1434.

Migration: `export declare @dec class A {}`, which compiled to `@dec export declare class A {}`, now fails with TS1128, as in TypeScript. Write the decorator before `declare` (`export @dec declare class A {}`) or before `export`, which compile to the same output.
