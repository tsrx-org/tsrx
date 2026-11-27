---
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
---

The editor now shows a compile error that has no mapping of its own range over the code that reports diagnostics in it. The language server spanned the error over every mapping that overlaps its range, so a mapping of a whole directive around it, which doesn't report diagnostics, or another error's anchor, could put it on code that doesn't map back, and the editor showed it nowhere: a nested `break` in an `@switch` case (`if (x) break;`, `TSRX2008`) on React, Preact, Vue and Hono, or a misplaced `<style>` (`TSRX3008`) in a fragment that is itself reported (`TSRX2010`). It now spans the mappings that report diagnostics first, and no other error's anchor.
