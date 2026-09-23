---
'@tsrx/core': patch
---

A `<style>` selector with a CSS hexadecimal escape now compiles and scopes
correctly. The whitespace that ends a hex escape is part of the escape, so
`.\31 23` is the class `123` rather than a descendant selector, and an assigned
block exposes it as `theme['123']`. Hex escapes also decode to their code
points when matching elements and naming theme entries, so `.\31` matches
`class="1"` and appears as `theme['1']` instead of `theme['31']`.
