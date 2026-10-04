---
'@tsrx/core': patch
---

Comments now attach to the same code whatever line breaks a file uses. Before, in a file with U+2028 or U+2029 line breaks, a comment at the end of a line became a leading comment of the code on the next line: `const a = 1 // note` led `const b = 2` instead of trailing `const a = 1`. In a file with only CR line breaks, a comment between two blank lines led the next statement, and a block comment over several lines kept its indentation. Now CR, U+2028 and U+2029 end a line like LF and CRLF, as in Prettier.
