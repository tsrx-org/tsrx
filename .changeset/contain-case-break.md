---
'@tsrx/core': patch
---

A `break` right in an `@switch` case, which the compiler reports (`TSRX2008`), now gets a loop of its own in a collecting compile's and the editor's code, `do break; while (false);`, as a reported jump that nothing in the output can take does, instead of being left out. Left out, one on a line of its own had nothing to show its error on, and the editor showed `TSRX2008` nowhere on React, Preact, Vue and Hono, and on Solid on the case's test. The loop ends only itself, so the code after the `break` still runs and TypeScript reports nothing about it. A strict compile still throws `TSRX2008`.
