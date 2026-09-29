---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/prettier-plugin': patch
---

A `JSXText` node's `value` now has its character references decoded, as in
every JSX parser, and `raw` keeps the text as written. Before, both held the
text as written. For `<p>a &quot;b&quot; &amp; c</p>`:

```text
value: a "b" & c
raw:   a &quot;b&quot; &amp; c
```

`value` also reads each CRLF line break as LF.

Compiled and formatted output doesn't change: the compilers and the formatter
print `raw`, and JSX's whitespace rules read it, so text that is only a
reference, such as `<>&nbsp;</>`, is still text. A tool that prints JSX text
from `value`, or decodes it again, should use `raw` instead, or `&amp;lt;`
renders `<` instead of `&lt;`.
