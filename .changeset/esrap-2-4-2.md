---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
---

Require esrap 2.4.2, which prints a parenthesized string statement, the import attributes of an import type, and the `?` of an optional destructured parameter itself ([#235](https://github.com/tsrx-org/tsrx/issues/235)). The printer's own workarounds for these are removed. With 2.4.2, source maps also map the binding of a namespace import (`import * as themes`), and the editor mapping of `<style apply={theme}>` covers its closing `}`.
