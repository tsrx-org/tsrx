---
'@tsrx/core': patch
---

A custom property's name followed by many U+00A0 (or other non-ASCII whitespace) characters and no colon is now read in linear time. Both the name and the whitespace before a colon could take such a character, so the check for a custom property tried every way to split the run: 40,000 of them took 0.9 s, and now take 5 ms. What the check accepts is unchanged.
