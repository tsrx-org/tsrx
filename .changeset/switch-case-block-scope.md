---
'@tsrx/core': patch
---

Each `@switch` arm (`@case x: { … }` or `@default: { … }`) is now its own block
scope, so setup locals in different arms can share a name. Before, the whole
switch shared one scope: declaring the same `const` in two arms failed with
`Identifier has already been declared`, and a `<style apply={theme}>` in one arm
could resolve to another arm's `theme`. React, Preact, Vue, and Hono output now
wraps an arm's setup statements in their own block inside the generated `switch`.
