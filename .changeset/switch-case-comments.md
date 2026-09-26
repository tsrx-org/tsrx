---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments in a template `@switch` stay where Prettier keeps them in the same
`switch`:

- The comments in a `@switch` with no cases, or in an empty `@case` or
  `@default` body, stay inside its braces, each on its own line. They used to
  move after the switch, or lose their indentation.
- A block comment between the `:` of a `@case` or `@default` and its `{` stays
  there (`@case 1: /* c */ {`). It used to move before the `:`, or into the
  body. One at the end of its line after a test moves before the `:`, and a
  line comment there moves into the body, as in Prettier's settled output.
- A comment on its own line after the last case body stays in the switch.

In code on one line, a comment after a `switch` no longer moves into its first
case.
