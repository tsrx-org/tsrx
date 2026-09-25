---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

A line comment alone in the braces of a JSX child or attribute value prints on
a line of its own with the `}` on the next line, like Prettier, instead of
taking the `}` into the comment, which didn't parse. Several comments alone in
braces print on consecutive lines.

A comment after the expression of a `{…}` stays inside its braces, like
Prettier, instead of moving after them, or, before another attribute, being
deleted. The parser gives it to the expression as a trailing comment.

A comment in the braces of a dynamic tag (`<{Comp /* c */}>`) prints once, in
the tag it was written in, instead of again in the closing tag, and a comment
in the closing tag's braces is no longer dropped. One on its own line stays in
the braces instead of moving into the element's children.
