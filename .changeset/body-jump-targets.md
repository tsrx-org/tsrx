---
'@tsrx/core': patch
'@tsrx/solid': patch
---

A `break` or `continue` in an `@if`, `@else` or `@for` body that a loop, a `switch` statement or a label inside the body takes now compiles. The `@if` check reported every `break` and `continue` in its body (`TSRX2003`, `TSRX2004`), such as `@if (x) { switch (y) { case 1: break; } <b /> }`, a `break` in a plain loop there, or `L: { break L; }`, and the `@for` check reported one that a `switch` or a label in its body takes (`TSRX2006`, `TSRX2007`), as if it left the body; so did Solid's checks, which also cover `@else if` bodies. A jump that leaves the body, such as a `continue` in a `switch` there or a `break` to a label outside it, is still reported.
