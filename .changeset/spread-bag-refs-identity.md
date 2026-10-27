---
'@tsrx/core': patch
'@tsrx/runtime': patch
'@tsrx/react': patch
'@tsrx/hono': patch
---

On React and Hono, a host spread whose bag carries several refs, such as a
`ref` and a ref prop made with `create_ref_prop`, no longer detaches and
reattaches them on every render. In
`<div {...{ title, ref: a, extra: named }} />`, each update ran `a(null)`,
`named(null)`, `a(el)` and `named(el)`, with or without a `ref` of the
element's own, because the spread normalizer merged the bag's refs into a new
callback each time. On these targets it now merges them as
`merge_element_refs` does, so a new bag carrying the same refs gets the same
`ref`, and its refs are applied again only when one of them changes.
`merge_element_refs` now also keys a ref list by the refs in it, so an inline
`ref: [a, b]` written each render is applied once as well, and a list whose
refs change is applied again.

Preact is unchanged, for the reason given for `merge_element_refs`. A custom
platform that sets `jsx.shareMergedRefs` with `hostSpreadRefBinding:
'in-place'` imports the runtime's new `copy_spread_props_sharing_refs` and
`copy_spread_props_for_ref_attr_sharing_refs` from its `imports.refProp`
module, which `@tsrx/runtime/ref` and the first-party `*/ref` modules export.
