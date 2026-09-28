---
'@tsrx/core': minor
---

Give an `@case` or `@default` arm its `{ … }` body as a node: its `consequent` is one `BlockStatement` from the `{` to the `}`, as a JavaScript `case 1: { … }` has in every parser and as the `@if`, `@for` and `@try` bodies are. Tools that read an `@case`'s `consequent` as its statements read `consequent[0].body` now. A comment in an empty arm is the block's inner comment.
