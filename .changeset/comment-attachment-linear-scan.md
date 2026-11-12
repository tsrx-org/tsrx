---
'@tsrx/core': patch
---

Parsing a file with many statements before a distant comment no longer slows down quadratically. Comment attachment scanned all the code between each statement and the next comment, once per statement. It now checks for a blank line only when that gap is whitespace, and looks for a `)` only after a statement header (#990).
