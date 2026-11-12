---
'@tsrx/core': patch
---

A `//` right after a block comment in element children, as in `<b />/* c */// c`, is now text after an `@if`, `@for`, `@switch` or `@try` block too, as it is without one. After a directive it used to read as a line comment, so the rest of the line disappeared from the output and the comment list had a comment the same source didn't have elsewhere.
