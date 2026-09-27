---
'@tsrx/core': patch
---

End a shorthand attribute's braces (`{name}`) at its `}`: with a comment before the `}`, as in `{name /* c */}` or a line comment on its own line, the `JSXExpressionContainer` ended one character after the name, so the comment fell outside the braces and a formatter moved it out of them. The comment is now inside, after the name, as in the long form `name={name /* c */}`.
