---
'@tsrx/core': patch
---

`analyzeCss` now reports `:global` placement errors with file-relative `pos`, `end`, and `loc` anchored on the misplaced `:global` selector, and accepts `{ filename, errors, comments }` to collect them instead of throwing. `parseStyle` takes an optional `body` origin (the style body's file offset, line, and column) and records it on the sheet as `sourceStart` and a file-relative `loc`; CSS node `start` / `end` stay body-relative. Sheets produced by `parseModule` carry the origin, so direct `analyzeCss` callers can place editor diagnostics without going through `compile`.
