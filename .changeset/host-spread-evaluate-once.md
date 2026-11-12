---
'@tsrx/core': patch
'@tsrx/runtime': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/hono': patch
---

On React, Preact, and Hono, a host spread and a `ref` beside it are now
evaluated as they are in plain TSX:

- A getter in a spread bag is read once. In
  `<input {...bag} data-reads={reads} />` with `get title() { return String(++reads); }`,
  the element rendered `title="2" data-reads="2"`: the spread normalizer read
  every getter, handed back the original bag, and the JSX runtime read the
  getters again. The runtime's new `copy_spread_props` and
  `copy_spread_props_for_ref_attr` return the normalized copy instead, and
  these targets import them in place of `normalize_spread_props` and
  `normalize_spread_props_for_ref_attr`. Solid and Vue keep the original bag,
  which their compiled JSX reads property by property.
- A `ref` expression is evaluated where it is written. In
  `<div ref={initRef()} {...{ 'data-ready': String(ready) }} />`, where
  `initRef()` sets `ready`, the element rendered `data-ready="false"`: the
  merged `ref` attribute moved after the spread and every later attribute. The
  merged `ref` now stays where the element's own `ref` is written, and reads
  the ref of a bag spread after it when the ref is applied.

A custom platform with `jsx.hostSpreadRefBinding: 'in-place'` now imports
`copy_spread_props` and `copy_spread_props_for_ref_attr` from its
`imports.refProp` module, so that module must export them. `@tsrx/runtime/ref`
and every first-party `*/ref` module re-export them.
