---
'@tsrx/core': patch
---

An `await`, `for await` or `await using` in a namespace inside an async function no longer reports TS1308, TS1103 or TS2852: TypeScript allows them there, as the function around them is async. The namespace itself is still TS1235, and an `await` in a namespace outside any function is still TS1308.
