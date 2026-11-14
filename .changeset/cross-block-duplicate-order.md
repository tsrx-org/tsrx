---
'@tsrx/core': patch
---

When two blocks of one namespace or ambient module declare an exported name twice, a collecting parse now records those errors by position among the other errors, as tsc sorts them, and a strict parse throws the first, where it threw an error that comes later. Before, the cross-block errors came after every error found while the module was read, such as a redeclaration later in the second block (`namespace N { export const a = 2; export const a = 3; }`) or a duplicate parameter (`function f(x, x) {}`).
