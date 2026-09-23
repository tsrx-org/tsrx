---
'@tsrx/prettier-plugin': patch
---

Keep `static` and the trailing `;` on class index signatures
(`static [key: string]: number;`) when formatting TSRX files. Previously
`static` was dropped, which moved the signature from the class to its
instances, and the missing `;` ran the signature into the next member on the
same line, leaving code that no longer parsed.
