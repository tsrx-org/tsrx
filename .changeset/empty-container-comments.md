---
'@tsrx/core': patch
---

Keep the comments inside an empty block, function or class body, interface, namespace, type literal or array when a comment comes right before it (`class A /* e */ { // c }`). The comment before the container took them, so `@tsrx/prettier-plugin` deleted them (#741).
