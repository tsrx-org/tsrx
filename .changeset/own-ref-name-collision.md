---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/hono': patch
---

The binding that holds an element's own `ref` written before a host spread, on
React, Preact and Hono, now skips any name the module already uses, as spread
temporaries do. Before, a component declaring `App__ref1` itself got a second
`let App__ref1`, which failed the build or shadowed the authored value.
