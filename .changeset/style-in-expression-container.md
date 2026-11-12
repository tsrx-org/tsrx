---
'@tsrx/core': patch
---

A `<style>` block rendered as an expression child, such as `<div>{<style>.card { … }</style>}</div>` or `{ready && <style>…</style>}`, now reports TSRX3014 (`A <style> block inside an expression container … evaluates to its class map, so as a child it styles nothing`) in the compiler, the editor and `tsrx-tsc`. Before, it compiled to the block's class-map object rendered as a child, and the elements beside it got no scope hash. A block whose value is used, such as an attribute value or a member read, is still an assigned block.
