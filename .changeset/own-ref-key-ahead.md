---
'@tsrx/core': patch
'@tsrx/preact': patch
'@tsrx/hono': patch
---

An element with its own `ref`, then a `key`, then a host spread
(`<input ref={r} key="a" {...props} />`) keeps its written `key` on Preact and
Hono again when the spread bag has a `key` too. The binding added for the `ref`
went in a spread ahead of `key`, which made the JSX compiler pass `key` through
`createElement`, where the bag's `key` replaced it. The `key` now stays ahead of
that spread, as written.
