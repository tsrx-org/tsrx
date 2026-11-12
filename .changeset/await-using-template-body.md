---
'@tsrx/core': patch
---

An `await using` declaration in a template body now makes that body async, as
`await` does. Before, a body such as `@try { await using resource = acquire(); … }`
compiled into a synchronous function, which is invalid output.
