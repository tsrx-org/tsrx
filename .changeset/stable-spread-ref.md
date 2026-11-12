---
'@tsrx/core': patch
'@tsrx/runtime': patch
'@tsrx/react': patch
'@tsrx/hono': patch
---

On React and Hono, an element with its own `ref` and a host spread no longer
detaches and reattaches its refs on every render. In
`<input ref={log} {...props.rest} />`, every update called `log` with `null` and
then with the element again, because the merged `ref` was a new callback each
time. These targets now merge with the runtime's new `merge_element_refs`,
which returns a single ref as itself and the same callback for the same refs,
so a ref is applied again only when one of the refs changes, as in plain TSX.
A value that is not a ref, such as the `false` of `ref={cond && cb}`, is left
out.

Preact is unchanged: it stores a ref's cleanup on the callback itself, so
elements that shared one merged callback would run each other's cleanups. It
keeps a new `mergeRefs` callback per element and render.

A `ref` written before a spread is still evaluated where it is written: it is
assigned to a binding there, and the merged `ref` follows the spreads. The new
`jsx.shareMergedRefs` platform option selects `merge_element_refs`; a custom
platform that sets it imports `merge_element_refs` from its `imports.mergeRefs`
module, which `@tsrx/runtime/ref` and the first-party `*/ref` modules export.
