---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

More comments now stay where they were written, the way Prettier's comment
handlers place them.

- A comment at the end of a line that ends with a binary or logical operator
  stays after the operator (`a || // note`) instead of moving to its own line.
- A comment inside parentheses after their last operand, on a line after it,
  stays inside the parentheses: in a unary operand like `!( … )`, or before the
  `)` of an `if` or `while` condition. It no longer moves out of them, for a
  condition between its `)` and the body's `{`, which took two passes to settle.
- A comment on its own line before the `.name` of a member lookup prints before
  the `.`, and the member chain breaks one call per line, instead of printing
  after the `.`.
- A comment between union members prints before the next `|`, and a block
  comment right before a union prints after the first `|` when the union breaks.
- A comment between a class or interface heading and its `{` moves into the
  body, and a comment before `extends` or `implements` stays before the keyword
  and breaks the heading. A comment in the heading of a decorated class follows
  the last decorator.
