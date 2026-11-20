---
'@tsrx/core': patch
---

A selector the stylesheet comments out of a list because no element matches it (`/* (unused) ... */`) no longer ends that comment early when it holds a comment or a string with `*/`. `.unused /* c */, .z { ... }` compiled to `/* (unused) .unused /* c */,*/ .z { ... }`, so the rest of the selector was read as CSS, the browser dropped the rule, and `.z` lost its style. The commented-out selectors' `/` characters are now escaped, which also covers a `*` that dropping `:global(` or `)` puts next to a `/`, and the comma that ends them is no longer taken from a CSS comment between selectors (`.u, /* , */ .y` closed the comment early in both renders).
