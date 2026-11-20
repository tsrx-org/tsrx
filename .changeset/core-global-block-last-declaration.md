---
'@tsrx/core': patch
---

A `:global { … }` block in a rule whose last declaration has no `;` no longer runs into what follows it. The output drops the block's braces, so `.c { :global { color: red } .k { color: blue } }` gave `.c.<hash> { color: red .k.<hash> { color: blue } }` (the braces only commented out), invalid CSS that lost both the declaration and the `.k` rule. The output now ends that declaration with a `;`.
