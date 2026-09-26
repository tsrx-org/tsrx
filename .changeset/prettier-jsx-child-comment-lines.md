---
'@tsrx/prettier-plugin': patch
---

Comments before an element's child keep their line breaks, like `{/* c */}` children in Prettier:

- A block comment that ends its line after other code (the opening tag, or another comment) keeps the child after it on the next line. When the element had text, the comment joined the next line, and the next pass joined the child to it (`/* a */ /* b */ <i /> 3`).
- In an element with text, a blank line after a comment before a child is removed, as between other children. It stayed. Without text, it stays.
- The comments before a `{…}` child print like those before any other child: block comments on one line stay on it, including one on the line of the `{…}`, and a blank line after them stays in an element without text. Each comment took a line of its own, and the blank line was removed.
