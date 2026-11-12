---
'@tsrx/runtime': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/hono': patch
'@tsrx/vue': patch
---

On React, Preact, Hono and Vue, a host spread whose bag's `ref` is a ref list
now calls every ref in it. `<input {...{ title, ref: [a, b] }} />` called
neither `a` nor `b`: the spread normalizer passed a lone list to the framework
as is, and React warned "Unexpected ref object". Beside the element's own ref,
Preact and Vue also dropped the list. The normalizer now merges a list even
when it is the bag's only ref, as it already did beside a `create_ref_prop`
ref prop. A list of one ref object is merged as well, so a `{ value }` ref is
written as such rather than read as the framework's own kind of ref object. On
React and Hono the merged ref is shared as `merge_element_refs` shares it, so
an inline list written each render is applied once. Solid is unchanged,
because its spread applies a ref list itself.
