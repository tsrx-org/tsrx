---
'@tsrx/core': patch
---

The editor now shows an error on code that the editor's code leaves out when nothing else on its line is printed, such as a `break` right in an `@switch` case on a line of its own (`TSRX2008`). Such an error got no mapping there, so the editor showed it nowhere on React, Preact, Vue and Hono, and on Solid on the case's test. It now gets an anchor at the end of the generated line of the code printed last before it, as one with code before it on its line does.
