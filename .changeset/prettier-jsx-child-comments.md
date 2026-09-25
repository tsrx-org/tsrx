---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments between the children of an element keep their places in one pass:

- In an element inside a `{…}` container or an attribute value, a comment before the first child, or after a `{…}` child, leads the child after it, as in a template. It went to the element's body, which the formatter printed before the closing tag (`{x && <div>{y} /* c */ <i /></div>}` formatted with the comment after `<i />` on the next pass).
- Text after a child that breaks over several lines starts a line of its own (`</span>{" "}` then `3`) when a comment on a line of its own comes before the child, like Prettier with a `{/* c */}` child. It stayed on the child's last line (`</span> 3`), and a block comment on the opening tag's line gave one layout and then the other.
- In an element inside a `{…}` container, a block comment after a `{" "}` that a tag or the closing tag follows prints against the `{" "}`, where the next pass puts it.
