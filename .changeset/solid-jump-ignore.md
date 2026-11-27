---
'@tsrx/solid': patch
---

A `// @tsrx-ignore` comment now suppresses Solid's errors for a `break`, `continue` or `return` in an `@if`, `@else if`, `@else` or `@for` body (`TSRX2002` to `TSRX2007`) when collecting and in the editor, as on the other targets. Solid's checks passed no comments to the error, so they reported it anyway.
