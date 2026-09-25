---
'@tsrx/prettier-plugin': patch
'@tsrx/core': patch
---

`prettier-ignore` comments and multi-line template literals now format like
Prettier.

- Any `prettier-ignore` comment attached to a node keeps it as written: one
  that trails a statement or member on its line (`foo(  a ); // prettier-ignore`),
  one followed by another comment (`// prettier-ignore` then
  `/* #__PURE__ */ bar(  1 )`), and one inside an empty body.
- An ignored statement's `;` follows the `semi` option like Prettier's, a
  comment before that `;` no longer prints twice, an ignored node over several
  lines no longer breaks the list around it, and an exported class keeps the
  decorators written before `export`.
- Like Prettier, a `prettier-ignore` comment on its own line between union
  members keeps the member after it as written and stays before its `|`. The
  parser marks that member (`metadata.prettierIgnore`) and the comment
  (`unignore`), so the member before the comment is still formatted.
- A template literal over several lines breaks the call arguments, array,
  object, or condition around it, one item per line. A lone template argument
  that starts on the call's line stays there, except in a member chain.
