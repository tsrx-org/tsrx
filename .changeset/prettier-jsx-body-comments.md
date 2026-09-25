---
'@tsrx/prettier-plugin': patch
'@tsrx/core': patch
---

Comments in the tags and children of an element now stay where they were
written. A comment right after an opening tag (`<div>/* c */x</div>`), inside
a closing tag (`</div /* c */>`, `</ /* c */ div>`, `</ /* c */>`), or in a
shorthand attribute (`{/* c */ key}`) is no longer deleted, and a comment
between words of text no longer moves to the closing tag. A comment in text
keeps the text's meaning: the formatter no longer adds or drops a space next to
it, and a line comment after a child no longer ends up after the next word,
where it would read as text.

The parser now gives a comment in text to the text (`innerComments`), even on
the line of the child or opening tag before it, but a `prettier-ignore` after
the text's last word still leads the next child. A comment between a closing
fragment's `</` and `>` dangles on the closing fragment.
