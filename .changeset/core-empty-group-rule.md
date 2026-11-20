---
'@tsrx/core': patch
---

A rule in a `<style>` block whose `@media`, `@supports`, `@container` or `@scope` rules hold nothing the output keeps is now commented out as empty, as a rule with only empty or unused rules in it already was. `.p { @media print { .y {} } }` was kept as `.p.<hash> { @media print { /* (empty) .y {}*/ } }`, which styles nothing. A `@layer` block still counts as something, since even an empty one sets the order of layers.
