---
'@tsrx/core': patch
---

Parentheses around a `<style>` block or an `apply` value now give the same result in the editor as in the build. Before, `const dark = (<style>…</style>)`, the form Prettier prints for a multi-line block, built fine, but the editor and type checkers reported `'dark' is not a style block` for `apply={dark}`. `apply={(dark)}` crashed the editor compile, and a parenthesized `(<style>…</style>);` statement was not reported as a standalone block.
