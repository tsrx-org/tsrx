---
'@tsrx/prettier-plugin': patch
---

A comment before or after a lone `@{ … }` child, or before its element's closing tag, stays where it is, and the code block no longer hugs the tags then. The comment before it moved onto the opening tag's line, where it rendered a space and moved again on the next format; the one before the closing tag was deleted. Block comments after a `{" "}` keep the spaces between them when a line break follows them (`{" "}/* a */ /* b */`).
