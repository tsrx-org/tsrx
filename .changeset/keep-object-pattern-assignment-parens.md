---
'@tsrx/prettier-plugin': patch
---

Keep the parentheses of an object destructuring assignment used as a statement (`({ a } = obj);`), which the formatter dropped, turning the statement into a block.
