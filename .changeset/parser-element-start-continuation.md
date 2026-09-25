---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser reads two more element shapes the way TypeScript does:

- An element or fragment with whitespace or a comment after its `<`
  (`< div>`, `<  >`, or `<` with a comment on the next line) now starts at the
  `<`, and so does its opening tag. It used to start inside the gap, with a
  negative column when the gap crossed a line, so its editor mappings started
  in the gap and the comment ended up before the node that contains it. Like
  Prettier, a comment before the tag name now leads the name, and one between
  a fragment's `<` and `>` dangles on the opening fragment.
- An operator on the line after an element or fragment that starts a statement
  continues the expression, as it does on the element's own line
  (`<div />` with `> 5;` or `? a : b;` on the next line). These used to fail
  with `Unexpected token`, and `+ 1` or `- 1` on the next line split off into a
  separate statement. As in TSX, a `/` on the next line divides, so a regular
  expression that starts the next line needs a `;` after the element. `as` and
  `satisfies` still continue only on the element's line, a `<` that starts the
  next line is still the next element, and a `@{ … }` code block's render node
  and template children don't change.

The formatter keeps a comment between `<` and the tag name, or between a
fragment's `<` and `>`, where it is, like Prettier (`</* note */ div>`), instead
of moving it before the element.
