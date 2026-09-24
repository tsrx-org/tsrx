---
'@tsrx/prettier-plugin': patch
---

A line that holds only a `;` no longer turns into a blank line. The formatter
drops the empty statement, but it counted the line as blank, so `a();`, `;`,
`b();` printed a blank line between `a();` and `b();`. Like Prettier, the
formatter now keeps a blank line only when the line right after a statement or
leading comment, or right before a trailing comment, is empty in the source.
This covers statement lists, class bodies, `@{ … }` code blocks, and the
comments around them. A comment after the `;`, as in `a();` then `; // note`,
stays on the line of `a();`. A comment after a `switch` case keeps at most one
blank line before it.
