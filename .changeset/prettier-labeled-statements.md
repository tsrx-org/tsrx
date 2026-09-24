---
'@tsrx/prettier-plugin': patch
---

The formatter no longer deletes labeled statements. A label and the loop or
block it labels, such as `outer: for (…) { … continue outer; }` or
`block: { break block; }`, used to print as a `/* Unknown: LabeledStatement */`
comment. The output then either failed to compile, because a `break` or
`continue` still named the label, or ran without the loop. Labeled statements
now print the way Prettier prints them:

- An empty body prints as `label:;`, and an empty labeled block prints as
  `label: {` followed by `}` on the next line.
- A comment between the label and its body moves above the label when it is on
  its own line or ends its line, so `outer: // note` followed by a loop prints
  `// note` and then `outer: for …`. A block comment that shares its line with
  the label and the body stays where it is.
- A `// prettier-ignore` right after the label keeps the whole labeled
  statement's source.
