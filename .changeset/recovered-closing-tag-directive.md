---
'@tsrx/content-mapper': patch
---

With TypeScript 7, an unclosed `<T>(x: T) => x` whose `T` names no value, or an unclosed tag such as `<Missing>` at module level, no longer adds a TS18080 error at the top of the file next to the mapper's TSRX1001. The closing tag that recovery adds has no place in the file, so TypeScript's error on it (TS2304) showed there; the mapper now sends an ignore directive over just that closing tag, which holds no authored code.
