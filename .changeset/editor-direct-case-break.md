---
'@tsrx/language-server': patch
---

The editor now shows `TSRX2008` for a `break` right in an `@switch` case on a line of its own on React, Preact, Vue and Hono, with TypeScript validation on or off: on the case's test or the code before the `break`, where Solid already showed it. The editor's code leaves such a `break` out, and the `@switch`'s own mapping over it doesn't report diagnostics, so the language server put the error on code that doesn't map back to the source, and the editor dropped it. When the editor would drop a compile error's range, the language server now looks for a place the editor shows it on: the tokens in the range that report it, its ends, or else the nearest code that reports it. A range the editor already showed stays where it was. This also shows `TSRX2010` on an `@switch` used as a statement outside a template, as on the other directives.
