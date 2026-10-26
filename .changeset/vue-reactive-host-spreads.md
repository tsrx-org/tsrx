---
'@tsrx/core': patch
'@tsrx/vue': patch
---

On Vue, a host spread now updates when its expression changes, as in
`<button {...bag.value} />` after `bag.value = { disabled: true }`. Before,
the compiler read the spread once in a setup declaration, so the element kept
its first attributes and a button stayed enabled. The bag is now assigned
where it is spread, `{...(bag = __normalize_spread_props_for_ref_attr(expr))}`,
inside vue-jsx-vapor's render effect, which reads it again when it changes and
sets the element's template ref after it.
