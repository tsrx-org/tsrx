---
'@tsrx/core': minor
'@tsrx/prettier-plugin': patch
---

Give an `@case` or `@default` arm its `{ … }` body as a node: its `consequent` is one `BlockStatement` from the `{` to the `}`, as a JavaScript `case 1: { … }` has in every parser and as the `@if`, `@for` and `@try` bodies are. Tools that read an `@case`'s `consequent` as its statements read `consequent[0].body` now. A comment in an empty arm is the block's inner comment.

`@tsrx/prettier-plugin` keeps the comments of an empty `@switch`, `@case` or `@default` body inside it, and a comment before an arm's `{` where Prettier puts it in a `switch` (#774).
