---
'@tsrx/core': patch
---

The editor shows an unclosed `<>`'s TSRX1001 on the `<>`, as TypeScript 7 does, instead of on its first child or on the function's name. The compile gives an error an anchor mapping where the editor's code leaves its source out, but it skipped any error whose position esrap's source map records, and a `<>` the editor's code prints has no mapping of its own. Such an error now gets an anchor on that `<>`. A `<>` the editor's code leaves out keeps the anchor it already had.
