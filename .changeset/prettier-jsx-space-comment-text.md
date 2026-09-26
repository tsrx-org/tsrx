---
'@tsrx/prettier-plugin': patch
---

A `{" "}` JSX child with a comment next to it (`{" "}/* c */`) counts as text, as it does in Prettier, so the blank lines between the element's children are removed as in any element with text. They stayed when the element had no other text.
