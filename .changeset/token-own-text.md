---
'@tsrx/core': patch
---

When a platform's AST pass wraps an expression in a call that has the expression's location (as Octane does for template reads, #1392), a name in it no longer maps to the wrapper's callee when the callee starts with the name: in `read(re)`, `count(count)` or `a.read(a.re)`, the editor mapping of `re`, `count` or `a`, which carries hover, completion, go to definition and rename, started at the callee, so hovering the name showed the wrapper. The name now maps where it is printed, which is also where its own text ends.
