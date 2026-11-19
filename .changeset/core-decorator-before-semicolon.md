---
'@tsrx/core': patch
---

Report decorators before a `;` in a class body, as in `class C { @dec ; }`, as TypeScript does: TS1146 `Declaration expected.` at the `;`. The parser threw a `TypeError` (`Cannot set properties of null`) instead, so tools built on it, such as `@tsrx/eslint-parser`, failed on the file.
