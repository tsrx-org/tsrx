---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

The parser reads five kinds of code by the token's context, as TypeScript's TSX
parser does:

- A comment between a directive's keyword and what follows it parses, as it
  does after the statement's keyword: `@try /* c */ {`, `@if /* c */ (x) {`,
  `@for /* c */ await (…)`, `@switch // c` with the `(` on the next line. The
  `@` and the keyword still have to touch. In element children, such a
  directive used to be read as text and an expression container.
- `yield` takes an argument that starts with `@`: `yield @{ <div /> }`,
  `yield @if (ok) { <b /> }`, and a decorated class (`yield @dec class {}`).
  A line break after `yield` still ends it.
- A regular expression that starts with `>` (`/>/g`) no longer breaks the code
  after it; `/>` still ends an open tag.
- `</` right after an operand starts a closing tag, as in TSX, instead of a
  less-than and a regular expression. A missing `}` before a closing tag
  (`<p>{count</p>`) now reports `'}' expected.` at the `</` instead of
  `Unterminated regular expression` after the tag. `a < /re/` with a space is
  still a comparison; `a </re/` is now a syntax error, as in TSX.
- An element or fragment isn't a left-hand-side expression, and neither is a
  `@{ … }` value or a directive used as a value. A `(`, `[`, or template literal
  on the line after one starts a new statement instead of calling, indexing, or
  tagging it, and a call, member access, index, non-null assertion, or tagged
  template right after one (`<b />.foo`) is a syntax error. In parentheses
  (`(<b />).foo`, `(@{ … })(x)`) they work as before. Operators after one,
  including on the next line, are unchanged.

The formatter keeps the parentheses around a `@{ … }` value or a directive that
is called, indexed, or used as a tag, as it does for an element.
