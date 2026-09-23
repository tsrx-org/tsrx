---
'@tsrx/core': patch
---

A scoped class selector for a class that contains a no-break space (U+00A0) or
another non-ASCII space is no longer marked unused. Class attributes are now
split into tokens on ASCII whitespace only, as HTML does, so
`class="a&nbsp;b"` is the one class that `.a\a0 b` matches, not the two classes
`a` and `b`. The `[attr~=value]` attribute selector uses the same splitting.
Editor hover and go-to-definition for such a class now link to its selector.
