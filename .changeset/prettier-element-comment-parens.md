---
'@tsrx/prettier-plugin': patch
---

An element or fragment with a comment that breaks the line now prints the
comment inside its own parentheses, like Prettier. A `return`, `throw`,
`yield`, or `await` whose element starts with a line comment, or a block
comment that ends its line or spans lines, keeps its parentheses instead of
ending at the comment and returning `undefined`. The same element after `=`,
`=>`, `:`, `export default`, or an operator prints as `(`, the comment and the
element, `)`, and a trailing comment inside those parentheses stays there.
