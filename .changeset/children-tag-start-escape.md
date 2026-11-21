---
'@tsrx/core': minor
---

A `<` in children, a template's or a JSX element's, now opens a tag before a Unicode escape for a character a name can start with (`<\u0049nner n={5} />`), and before a letter outside ASCII (`<é />`, `<Ω>…</Ω>`), as TypeScript reads them. The escaped name then gets TS17021, as it does everywhere else, instead of compiling to the text `&lt;Inner n={5} /&gt;`. Before, `<é />` was text too, and `<Ω>x</Ω>` failed with a closing tag that doesn't match. A `<` before an escape for another character (`<\u0031`) is still text.

Migration: to write a `<` as text before a letter outside ASCII, write `&lt;` or `{'<'}`, as before an ASCII letter. A comparison whose `<` starts a line, right before such a letter, after a left operand on the line before, now reads as a tag too, as before an ASCII letter: put a space after the `<`.
