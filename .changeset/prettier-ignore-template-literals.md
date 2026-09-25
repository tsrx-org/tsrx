---
'@tsrx/prettier-plugin': patch
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
- A template literal over several lines breaks the call arguments, array,
  object, or condition around it, one item per line. A lone template argument
  that starts on the call's line stays there, except in a member chain.
