---
'@tsrx/runtime': patch
'@tsrx/solid': patch
'@tsrx/solid-runtime': patch
---

On Solid, an element with several spreads and its own `ref` no longer applies
a bag's refs again when the bag carries more than one ref and they stay the
same. In `<input ref={own} {...first()} {...second()} />`, a `first` of
`{ title, ref: a, extra: named }`, with `named` made by `create_ref_prop`,
called `a` and `named` again on every update to `first`, because the bag's
refs merged into a new callback each time. `spread_ref_bags` now merges them
with the runtime's new `normalize_spread_props_sharing_refs`, which gives a
new bag carrying the same refs the same `ref`, so they are applied again only
when one of them changes.
