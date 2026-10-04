---
"@tsrx/core": patch
---

Recognize Unicode line and paragraph separators between setup statements and markup, and in directive trivia, without changing authored text or offsets. End template line comments at these separators and keep UTF-16 locations aligned after JSX text, including lone carriage returns.
