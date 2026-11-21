---
'@tsrx/core': patch
---

A JSX tag or attribute name with a Unicode escape after its first character (`<Inn\u0065r />`, `data-\u0061`) is now read as one name, the one the escape spells, as TypeScript reads it. The JSX tokenizer stopped at the escape, so `<Inn\u0065r n={3} />` compiled to `<Inn er n={3} />` (the tag `Inn` with an attribute `er`), the editor reported TS2304 on `Inn`, `data-\u0061="1"` became two attributes, and a closing tag spelled with an escape (`</Inn\u0065r>`) or an attribute name that starts with one and has a `-` (`\u0061ria-label`) didn't parse, so the editor lost the whole file. The build output now has `<Inner n={3} />`, and in the editor the name's hover, definition, references, rename and diagnostics cover all of its written text. TypeScript itself also reports such an escape (TS17021); the compiler doesn't. A JSX name with a character outside the BMP, which threw "Unexpected character", parses too.
