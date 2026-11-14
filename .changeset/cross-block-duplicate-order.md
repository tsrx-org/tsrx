---
'@tsrx/core': patch
---

A name exported twice, by two blocks of one namespace or ambient module or by the module itself (`export default 1; … export default 2;`), is now reported by position among the other errors, as tsc sorts them: a collecting parse records those errors at their positions, and a strict parse throws the first, where it threw an error that comes later. Before, they came after every error found while the module was read, such as a redeclaration later in a namespace's second block (`namespace N { export const a = 2; export const a = 3; }`) or a duplicate parameter (`function f(x, x) {}`).
