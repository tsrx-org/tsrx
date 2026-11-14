---
'@tsrx/vue-runtime': patch
---

On the Vue target, merged refs that another merged ref sets on the same element no longer clean each other up. With `mergeRefs(mergeRefs(a), mergeRefs(b))`, or a host element whose own `ref={mergeRefs(own)}` sits beside a spread that carries another merged ref, the second inner ref ran the first one's cleanup as if it replaced it, so `a` (or `own`) stayed `null` while the element was mounted. Each ref a merged ref holds now gets the element and is cleared once when the outer merged ref is unset or replaced, however the merged refs are nested. If a ref throws while a merged ref sets the element, the merged refs it already set are cleared on Vue's next `null` call or when another merged ref replaces it.
