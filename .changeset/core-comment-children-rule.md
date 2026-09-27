---
'@tsrx/core': minor
---

Read comments between template children the way TSX reads `{/* … */}`:

- A `//` starts a comment when whitespace comes right before it, at the start of a line, or right after a tag, an expression container, or a `@{ … }` or directive block. It runs to the end of the line, a closing tag on it included. A `//` that touches other text stays text, so `https://example.com` and `a//b` are text; write `&#47;/` for text that starts a line or follows a space.
- A comment renders like `{/* … */}` in TSX: the text on each side of it follows JSX's whitespace rules on its own. For example, `<b>t</b>`, a line break, then `/* c */ <i />` renders a space before `<i />`, as TSX does, where it rendered none before. The parser records the text between the comments in `metadata.text_pieces`, and `analyzeTsrx` splits the text into those pieces, with an empty `{}` between two of them, so every target's JSX compiler reads it as TSX.
