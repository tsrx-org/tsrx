---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
---

Import and export specifier lists now format the way Prettier formats them. An
export list that doesn't fit breaks one specifier per line with a trailing comma,
like an import list, and follows `bracketSpacing`. A single named import stays
on the line (`import { a } from "…"` no longer breaks into three lines when the
module path is long). An alias that repeats the name (`a as a`) is kept.

An import with empty braces keeps them: `import {} from "mod"` used to print as
`import "mod"`, and `import type {} from "mod"` as `import type "mod"`, which
isn't valid TypeScript.

Comments inside imports and exports are no longer deleted. A comment on a
specifier, an alias, a default or namespace import, a namespace re-export, the
module source, or an import attribute stays where it was written, and a line
comment in a specifier list keeps the list broken. The parser now attaches a
comment after the last specifier, before `}` or `from`, to that specifier, so
the formatter prints it inside the braces.

A block comment between a list element and the comma after it now stays with
that element in arrays, call and `new` arguments, objects, parameters, object
patterns, enums, and specifier lists, as in Prettier. `[a /* c */, b]` used to
format as `[a, /* c */ b]`, which moved the comment onto the next element, and a
list written across lines changed again on the second pass. A comment after
the comma still leads the next element.
