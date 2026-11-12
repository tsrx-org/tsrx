---
'@tsrx/core': patch
---

Two outputs in a `@{ … }` body, or a statement after its output, now report one error, TSRX2011 or TSRX2012. Before, the first output was also reported as unused output (TSRX2010), which wrapping the outputs in a fragment or moving the statement up fixes too.
