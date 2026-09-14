---
'@tsrx/react': minor
'@tsrx/preact': minor
'@tsrx/solid': minor
'@tsrx/vue': minor
---

Stop accepting lazy destructuring (`&{ ... }` / `&[ ... ]`), which is removed from the TSRX language per [RFC #106](https://github.com/tsrx-org/tsrx/discussions/106). Write `({ name }: Props)` for React and Preact, `props.name` (or `splitProps`) for Solid, and `state.count` or `toRefs(state)` for Vue.
