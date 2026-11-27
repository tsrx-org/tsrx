---
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
---

The editor now shows a compile error that has no mapping of its own range over the code in its range that reports diagnostics. The language server spanned the error over every mapping that overlaps its range, so a mapping of a whole directive around it, which doesn't report diagnostics, put it on code that doesn't map back, and the editor showed it nowhere: a nested `break` in an `@switch` case (`if (x) break;`, `TSRX2008`) on React, Preact, Vue and Hono. It now spans the mappings that report diagnostics first, and no other error's anchor; with none, it spans all of them, as before.
