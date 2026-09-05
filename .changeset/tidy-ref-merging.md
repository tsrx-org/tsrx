---
'@tsrx/runtime': patch
---

Avoid allocating a second array when merging three or more refs while preserving ref order, identity, and cleanup behavior.
