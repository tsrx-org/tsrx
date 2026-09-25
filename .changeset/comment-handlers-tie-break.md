---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Comments keep the places Prettier gives them in five more spots:

- A block comment with code on both sides of it on one line follows Prettier's
  tie-break: it leads the node after it when only whitespace or `(` sits
  between them, and trails the node before it otherwise. A comment between a
  tag and its template leads the template, which prints a space before it
  (`` tag /* c */ `x` ``), one after the comma of a sequence stays there
  (`(a, /* c */ b)`), one before a type annotation's colon stays before it
  (`x /* c */ : T` on a class property or rest element), and one between a
  default import and the `{` of the named ones trails the default import
  (`import d /* c */, { a }`).
- An own-line comment in a default value (`a = (\n  // c\n  1\n)`) moves before
  the parameter or property, and one at the end of the line after the `=`
  trails the name before it. It used to stay after the `=`, with the value on
  the next line. In a parameter property, it moves before the modifier.
- A comment after an arrow function's element body, in the parentheses around
  it, stays inside them instead of moving after the statement.
- A comment between a parameter list's `)` and the return type stays there in
  function types and TypeScript signatures, and one at the end of that line in
  a function trails the last parameter. A comment in empty parameter
  parentheses stays in them when a return type follows, and in function types
  and signatures.
- A comment after the type a mapped type's key ranges over is no longer
  deleted, a comment right after the `[` stays after it, one at the end of the
  line after the `]` moves before it, and one on its own line before the `]`
  stays there instead of moving after the `:`.

A comment before the `=` of a shorthand property's default value
(`{ a /* c */ = 1 }`) is no longer deleted.
