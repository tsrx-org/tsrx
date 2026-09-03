---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
'@tsrx/vite-plugin-solid': patch
'@tsrx/vite-plugin-vue': patch
'@tsrx/rspack-plugin-react': patch
'@tsrx/rspack-plugin-preact': patch
'@tsrx/rspack-plugin-solid': patch
'@tsrx/rspack-plugin-vue': patch
'@tsrx/turbopack-plugin-react': patch
'@tsrx/bun-plugin-react': patch
'@tsrx/bun-plugin-preact': patch
'@tsrx/bun-plugin-solid': patch
'@tsrx/bun-plugin-vue': patch
---

Dead code can now be removed from compiled output.
Pass `optimize: true` to a target compiler or to any Vite, Rspack, Turbopack, or
Bun integration to turn it on. It is off by default.

The pass folds statically known expressions and drops the code they prove dead.
This covers `@if` branches with a false test, `@switch` cases that cannot match,
`@for` over an empty iterable, statements after a `return`, and declarations
nothing reads. It also picks the arm of a `?:`, `&&`, `||`, or `??` whose test
is always truthy, keeping the test when it still has to run. Editor tooling never runs it, so hovers and diagnostics still
match the authored source.
