---
'@tsrx/core': patch
---

A CSS syntax error in a `<style>` block (TSRX3013) now has a position: where the CSS parser stopped, such as a stray `}` or the end of a rule left without its `}`. A build throws it with its line and column, as other syntax errors, and Prettier reports it there. The editor's compile, which used to drop it and keep the rules before it, now reports it too; an unclosed `<style>`, still being typed, gets only its TSRX1001. `parseStyle` gives such an error `pos`, and `loc` for a sheet with a `body` origin.
