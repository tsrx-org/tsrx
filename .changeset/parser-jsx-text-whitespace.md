---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Template text follows JSX's whitespace rules after closing tags, around
comments, and for non-breaking spaces:

- The text after a closing tag starts at the tag, as it does after a
  self-closing tag. A space there is no longer lost when the closed element's
  body ends in a line break (`<span>` … `</span> 2` rendered `12` instead of
  `1 2`). The text keeps its leading whitespace, which JSX trims as layout when
  it has a line break.
- A comment between children adds nothing to the text around it: the
  whitespace on its two sides is one run, which is layout when it has a line
  break. A block comment on the line after a closing tag
  (`<b>t</b>` then `/* c */ <i />`) no longer makes the space after it render,
  as it didn't after a self-closing tag.
- JSX whitespace is space, tab, and line breaks. Text that is a non-breaking
  space next to a line break is text, and is no longer dropped. The target's
  JSX compiler decides whether it renders at the edge of a line, as it does for
  TSX.

The formatter prints a line comment glued to a closing tag glued to it
(`<b>t</b>// c`), as it does after a self-closing tag, and formats a
non-breaking space that starts a line the same way on the next pass.
