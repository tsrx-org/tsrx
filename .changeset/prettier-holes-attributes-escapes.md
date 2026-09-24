---
'@tsrx/prettier-plugin': patch
---

The formatter no longer changes values when it reprints arrays, JSX attributes,
and strings:

- Trailing array holes keep their comma. `[1,,]` used to become `[1, ]`,
  which has length 1 instead of 2, and `const [,] = values()` used to become
  `const [] = values()`, which skips an iterator step. They now print as
  `[1, ,]` and `const [,] = values()` with any `trailingComma` setting.
- JSX attribute strings keep their entities and stay valid.
  `title="Say &quot;hello&quot;"` and `title={'Say "hello"'}` used to print as
  `title="Say "hello""`, which no longer compiles. They now print as
  `title='Say "hello"'`, and the quote that needs fewer entities is chosen, as
  in Prettier. A string container such as `title={"hello"}` still becomes
  `title="hello"`, but it keeps its braces when the string uses escapes,
  contains `&`, or contains both quote characters. Before, `title={'&amp;'}`
  became `title="&amp;"`, which changes the value to `&`.
- String literals keep the escapes the author wrote, and only their quotes
  change. An escaped lone surrogate such as `'\ud800'` used to be written as a
  raw character, which becomes U+FFFD when the file is saved as UTF-8. This
  could merge object keys that were different. Other escapes such as `'\x1b'`,
  `'é'`, and `'\0'` also stay as they were written instead of becoming raw
  characters.
