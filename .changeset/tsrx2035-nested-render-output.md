---
'@tsrx/core': patch
---

`TSRX2035` now also warns when the only statement of a `@{ … }` puts a `<style>` block, a `@{ … }` block or a directive behind `&&`, `||`, `??` or `?:`, such as `@{ok && @if (c) { <b /> }}`, as it already did for an element or a fragment. The statement throws that output away, so the block renders nothing. Compiled output doesn't change.
