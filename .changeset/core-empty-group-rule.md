---
'@tsrx/core': patch
---

A rule in a `<style>` block whose `@media`, `@supports`, `@container` or `@scope` rules hold nothing the output keeps is now commented out as empty, as a rule with only empty or unused rules in it already was. `.p { @media print { .y {} } }` was kept as `.p.<hash> { @media print { /* (empty) .y {}*/ } }`, which styles nothing. A `@layer` block now always counts as something, even an empty one, since it sets the order of layers: `.p { @layer base {} }` was commented out, which took `base` out of that order. So does a `@keyframes`, even an empty one, since it defines its name: commented out, a scoped `k` is no longer defined, and `animation: k` would bind to a global `k`.
