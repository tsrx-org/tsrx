---
'@tsrx/core': patch
---

A style theme that applies itself, such as `const theme = <style apply={theme} />`, now reports TSRX3003 (`'theme' is applied before its declaration`). Before, compiling, collecting diagnostics, and generating virtual TSX for the editor all threw `RangeError: Maximum call stack size exceeded`, so the editor showed no diagnostics or mappings for the file. A block of an object literal that applies a later block of the same object reports TSRX3003 too, since the two could apply each other. Applying an earlier block of the same object still works.
