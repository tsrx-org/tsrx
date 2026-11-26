---
'@tsrx/core': patch
---

A comment inside a selector now parses as CSS reads it. `.wrap /* c */ .icon {}`, `.a/* c */.b {}` and `.a > /* c */ .b {}` were `TSRX3013` (`Expected identifier`): the selector reader skipped a comment only at the end of a selector. A comment with whitespace around it is part of a descendant combinator, and one with none joins the compound (`.a/* c */.b` is `.a.b`). A lone `:global` after such a combinator still attaches to the compound before it (`.wrap /* c */ :global.dark` gives `.wrap.<hash>.dark`, as `.wrap :global.dark` does).
