---
'@tsrx/vue': patch
---

Compile a getter or setter in an object literal as an accessor when it has an `@{ … }` body or returns a local element. The Vue target wrapped one with a capitalized name in `defineVaporComponent(…)` as a component, which printed `get R: defineVaporComponent(…)`, output that doesn't parse.
