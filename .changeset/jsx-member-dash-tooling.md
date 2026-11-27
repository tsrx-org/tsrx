---
'@tsrx/core': patch
'@tsrx/prettier-plugin': patch
'@tsrx/eslint-parser': patch
---

A `-` in a JSX member name's part after a `.` (`<X.A-b />`), which a compile reports as TS1003 `Identifier expected.` at the `-` (TS1005 `'>' expected.` in a closing tag), is now rejected by the Prettier plugin, as Prettier's `typescript` parser rejects it, where the plugin formatted it, and reported by the ESLint parser as a parse error, as it does an escape in a JSX name, where it linted the code. The error now comes before a scanner error at the next token, as in TypeScript: `<X.A-b # />`, `<X.A-b " />` and an invalid escape after the `-` report TS1003, where they reported the scanner's TS1127, TS1002 or TS1125. A collecting or loose compile reads on in two more places, so the editor keeps the file: past the `=` of a `-=` (`<X.A-=b />`), and where a closing tag differs from its opening tag only after a `-` in a member's part (`<X.A></X.A-b>`, `<X.A-b></X.A>`), which TypeScript reads as the same name, where they threw TS1012 or TSRX1003.
