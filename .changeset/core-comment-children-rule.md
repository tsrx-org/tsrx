---
'@tsrx/core': minor
---

Read comments between template children the way TSX reads `{/* … */}`:

- A `//` starts a comment when whitespace comes right before it, at the start of a line, or right after a tag, an expression container, or a `@{ … }` or directive block. It runs to the end of the line, a closing tag on it included. A `//` that touches other text stays text, so `https://example.com` and `a//b` are text; write `&#47;/` for text that starts a line or follows a space.
- A comment renders like `{/* … */}` in TSX: the text on each side of it follows JSX's whitespace rules on its own. For example, `<b>t</b>`, a line break, then `/* c */ <i />` renders a space before `<i />`, as TSX does, where it rendered none before.
- The parse tree gives text with comments the children TSX has for it, so every target's JSX compiler reads it as TSX: the text between the comments, each piece exactly as written, with an empty `{}` (a `JSXExpressionContainer` whose `expression` is a `JSXEmptyExpression`, and no braces in the source) between two pieces that render. The comments in it are the `JSXEmptyExpression`'s `innerComments`. A piece that is whitespace with a line break is left out, as such text is anywhere, except around a tooling comment such as `// @ts-expect-error`, which gets a `{}` of its own so that the editor's TypeScript reads it as `{/* @ts-expect-error */}`. Before, such text was one `JSXText` with the comments cut out of it and attached to it; tools that read the tree see the new children.
