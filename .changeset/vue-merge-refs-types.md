---
'@tsrx/vue-runtime': patch
---

On the Vue target, `ref={mergeRefs(a, b)}` now type-checks, and so does the merged ref the compiler writes for a host element with a spread and a `ref` in a plain expression position, such as a ternary arm. Before, the editor and `tsrx-tsc` reported TS2322, because Vue types a `ref` callback as receiving an element, a component instance or `null`, and the merged callback accepted only the element. `mergeRefs` from `@tsrx/vue/ref` and `@tsrx/vue-runtime/ref` now returns a callback that accepts all three.

A merged ref's cleanups now run on Vue. Vue ignores what a function ref returns and calls it with `null` when it unsets the ref, so a callback's returned cleanup never ran; the merged ref now runs it (and clears ref objects) on that `null` call, or when a re-created merged ref replaces it on the same element, which Vue does without calling the old one.
