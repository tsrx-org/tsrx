---
'@tsrx/core': patch
---

A lone `:global` that shares its selector list outside a rule, as in `:global, .z { color: red }`, now gets one `TSRX3011` in the editor and when errors are collected, the one that says the `:global` can't share its list. It also got a second `TSRX3011` on its declaration, saying a `:global { … }` block outside a rule leaves its declarations outside every rule, which repeated the first. A compile still stops at the first.
