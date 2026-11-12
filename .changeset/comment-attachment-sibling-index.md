---
'@tsrx/core': patch
---

Parsing a long list before a comment no longer slows down quadratically. Comment attachment searched a node's list (the statements of a file or block, the elements of an array, the properties of an object, a function's parameters, an element's attributes or children, and others) for each of its entries. It now indexes each list once (#1163).
