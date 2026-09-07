---
"@tsrx/core": patch
---

Fix shared editor diagnostics for React, Preact, Solid, Vue, and other consumers
of the core tooling pipeline. Generic arrows with a constrained or defaulted
type parameter no longer produce a false trailing-comma error. Typed
destructuring defaults retain their full diagnostic mapping, including when a
multiline default ends in an array type assertion, instead of crashing source
mapping generation.
