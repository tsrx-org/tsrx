---
'@tsrx/core': patch
---

An assigned `<style>` block no longer hashes the compounds after a bare `:global` later in a selector, so it compiles them as a component's `<style>` block does: `div :global p { … }` gives `div.<hash> p` in both, where an assigned block gave `div.<hash> p:where(.<hash>)`, which kept `p` to the elements carrying the hash instead of any `p` below the `div`.
