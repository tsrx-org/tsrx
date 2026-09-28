---
'@tsrx/core': patch
---

Attach comments after a bare `continue`, `break`, `debugger`, or `return` keyword
and before its semicolon to the statement. They no longer attach to the next
statement or the surrounding statement's body.
