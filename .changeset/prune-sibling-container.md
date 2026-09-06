---
'@tsrx/core': patch
---

Keep sibling-combinator rules (`.a + .b`, `.a ~ .c`) whose elements sit at the top of a style scope or of a control-flow branch fragment. Pruning looked for siblings only under the nearest ancestor *element*, so items of a scope's root list — which has no element parent by design — and items of a branch fragment had no siblings and their rules were commented out as unused. `prune_css` now reads the element's actual children list (element or fragment), and the scope pre-pass seeds each scope's paths with a root fragment (`createScopeRoot`, exported for consumer compilers) that ancestor combinators still never match.
