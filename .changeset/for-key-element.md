---
'@tsrx/core': patch
---

An element right after `key` in an `@for` head, as in `@for (const x of xs; key <b />)`, now parses like `key (<b />)` instead of failing with "Unexpected token".
