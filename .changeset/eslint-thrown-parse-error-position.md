---
'@tsrx/eslint-parser': patch
---

ESLint reports a syntax error the TSRX parser throws, such as `const a = ;` or a CSS syntax error in a `<style>` block, at its line and column, as it already did for an unclosed or mismatched tag. It used to report it at 0:0, with its position only in the message (`Failed to parse TSRX file: Unexpected token (2:11)`). The message no longer has that prefix or the `(line:column)` suffix, and the error's `index` is set.
