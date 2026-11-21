---
'@tsrx/language-server': patch
---

Typing `>` after a JSX tag whose name has a Unicode escape now inserts the closing tag with the name the escape spells: `<Inn\u0065r>` gets `</Inner>`, and `<st\u0079le>` gets `</style>`. It inserted `</Inn>` and `</st>`, which don't close the element.
