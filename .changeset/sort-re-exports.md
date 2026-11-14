---
'@tsrx/core': patch
---

Sort Imports and Organize Imports now sort the re-exports of a `.tsrx` file as in a `.tsx` file, on TypeScript 5.9 and 6 and on TypeScript 7. The editor code put a blank line between an import and a re-export, and between the two kinds of re-export, so TypeScript sorted each one on its own; it now has a blank line between imports and re-exports only where the source has one. It also writes a re-export as it is in the source, not as `export *  from` with two spaces, and maps its module string and `;` as an import's, which TypeScript 7 needs to apply the edit.
