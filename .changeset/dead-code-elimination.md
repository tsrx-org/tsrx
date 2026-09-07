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

TSRX control-flow branches that can never render are now removed from compiled
output. Pass `optimize: true` to a target compiler or to any Vite, Rspack,
Turbopack, or Bun integration to turn it on. It is off by default.

The pass only rewrites the TSRX keyword directives. It drops `@if` and `@else if`
branches with a provably false test, selects the matching case of a `@switch`
with a known discriminant, and removes a `@for` over an empty iterable or renders
its `@empty` clause instead.

To decide a test it reads constants from the module, so `@if (SHOW)` can be
decided from a `const SHOW = false`. It does not fold expressions, remove unused
declarations, drop unreachable statements, or touch plain JavaScript. Editor
tooling never runs it, so hovers and diagnostics still match the authored source.
