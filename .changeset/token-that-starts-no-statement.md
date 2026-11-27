---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
'@tsrx/eslint-parser': patch
---

A token that starts no statement where a statement in a list starts (`export` before no declaration, as in `export foo;` or `export declare @dec class A {}`, or a class member modifier, as in `accessor x;`) no longer makes the editor lose the file. A collecting or loose compile records TS1128 `Declaration or statement expected.` over the token and reads on from the next token, as TypeScript's parser does, so the rest of the file keeps its mappings; a strict compile still throws it. Where the rest of the file fails to parse, the compile still throws TS1128 at the token, as before. In a `case` clause the error is now TS1129 `Statement expected.`, as in TypeScript. The Prettier plugin rejects both codes, as Prettier's `typescript` parser does, and the ESLint parser reports them as parse errors, since the tree leaves the token out.

A syntax error that a collecting compile records and reads on after, as these and an escape in a JSX name (`<Inn\u0065r />`, TS17021), now comes before the checker errors held around it, as in TypeScript (`{ namespace N { export foo; } }` records TS1128 before the namespace's TS1235), and is no longer dropped with them when the code around it fails later: `async <T,>(x = <A\u0062 />) => ;` now throws TS17021, which TypeScript reports first, where it threw TS1012 at the `;`.
