---
'@tsrx/core': patch
---

Parsing a module with many `let`, `const` or `using` declarations in one scope no longer spends time quadratic in their number on TSRX's own redeclaration check: it looks a name up in an index instead of scanning the scope's list of names. acorn's own redeclaration check still scans arrays, so very large scopes still parse in more than linear time.
