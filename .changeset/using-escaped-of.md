---
'@tsrx/core': patch
---

In a `for` head, `using` before `of` on the next line, which TypeScript reads as a declaration of `of` before `=`, `:` or `;`, is now read as one when `of` is written with an escape too (`for (using` then `\u006ff = null;;) {}` on the next line), where it failed with TS1012 `Unexpected token`. It compared the word as written, not the name it spells.
