---
'@tsrx/prettier-plugin': patch
---

Property keys, dotted heritage names, and default exports that start with a
function or class format like Prettier.

- Keys follow the `quoteProps` option (`"as-needed"` by default,
  `"consistent"`, `"preserve"`) in objects, classes, interfaces, type
  literals, enums, and import attributes. Interfaces, type literals, and enums
  used to keep every quote, and `quoteProps` was ignored.
- Class fields keep their quotes. With `strictPropertyInitialization`,
  TypeScript doesn't check that a field named by a string (`"d": number`) gets
  a value, so unquoting it could add a type error. `accessor` fields keep
  theirs too, and `quoteProps: "consistent"` doesn't quote a field.
- A key keeps its escapes and its comments when its quotes change. A comment
  before a string key after a modifier, `get`, `async`, or a decorator is no
  longer deleted.
- A short object key is measured by its width, so a key of wide characters
  breaks before its value like in Prettier.
- A dotted name in an interface's `extends` or a class's `implements` breaks
  before its last `.` when the heading doesn't fit, instead of the type
  parameters breaking.
- A default export that starts with a function or class expression prints the
  whole expression in parentheses: `export default (class {}.getInstance());`.
