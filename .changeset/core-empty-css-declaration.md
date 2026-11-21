---
'@tsrx/core': patch
---

An empty declaration in a style block, as in `.a { color: red;; }`, is skipped, as CSS skips it. The CSS parser reported `.a { color: red;; }` and `.a { color: red;/* c */; }` as `TSRX3013` (`CSS Declaration cannot be empty`), and a `;` that starts a block or follows another with only whitespace between was read as the name of a declaration: in `.a { ; animation: spin 1s }` the animation's keyframes name got no scope hash.
