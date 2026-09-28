---
'@tsrx/core': patch
---

The parser now gives a comment in text to the text (`innerComments`), even on
the line of the child or opening tag before it, but a `prettier-ignore` after
the text's last word still leads the next child. A comment between a closing
fragment's `</` and `>` dangles on the closing fragment.
