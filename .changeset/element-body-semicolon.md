---
'@tsrx/core': patch
---

End an element that is the body of an `if`, `else`, loop or label at its `;`, as an expression statement ends. `if (x) <div />; else <b />;` and `do <i />; while (x);` now parse as in TSX; before, the `;` ended the whole statement, so the `else` or `while` after it failed to parse (#924).
