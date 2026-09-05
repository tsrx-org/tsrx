---
'@tsrx/core': patch
---

Fix loose-mode Volar mappings for recovered unclosed tags: the synthesized closing name now maps to the opening tag name (`span`) instead of `<spa`, and the opening `<` keeps its mapping.
