---
'@tsrx/language-server': patch
---

The editor now shows `TSRX2008` for a `break` right in an `@switch` case on a line of its own on React, Preact, Vue and Hono, on the case's test or the code before the `break`, where Solid already showed it, with TypeScript validation on or off. The editor's code leaves such a `break` out, and the `@switch`'s own mapping over it doesn't report diagnostics, so the language server put the error on code that doesn't map back to the source, and the editor dropped it. The language server now places a compile error only where the mappings that report it map it back, and otherwise tries the next way to place it, down to the nearest code that does. This also shows `TSRX2010` on an `@switch` used as a statement outside a template, as on the other directives.
