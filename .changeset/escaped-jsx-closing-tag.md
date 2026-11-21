---
'@tsrx/language-server': patch
'@tsrx/typescript-plugin': patch
---

The closing tag the editor inserts after a JSX tag whose name has a Unicode escape now has the name the escape spells: typing `>` after `<Inn\u0065r` inserts `</Inner>`, and after `<st\u0079le` `</style>`, in the TSRX language server and through the TypeScript plugin. The language server inserted `</Inn>` and `</st>`, the TypeScript plugin `</st\u0079le>`, which doesn't end a `<style>` body. Tags whose names are spelled differently but read the same (`<Inner><Inn\u0065r>`) now count as the same tag when deciding whether one still needs its closing tag.
