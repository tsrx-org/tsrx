---
'@tsrx/core': patch
---

An element with thousands of children no longer fails to parse with "Not enough stack space to parse input". The parser read each child one call deeper than the one before it, so the limit depended on the available stack, about 2,000 to 4,000 children. It now reads the children in a loop, and stack depth follows how deeply elements nest, not how many children they have.
