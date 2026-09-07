---
'@tsrx/runtime': patch
---

Speed up `map_iterable` for `Set`, `Map`, and other non-array iterables by walking them with `for...of` one item behind, storing single-node results without a helper call, and preallocating the result from a real `Set` or `Map` size. The size is only a capacity hint, so `is_last` and callbacks that mutate the collection behave exactly as before. As a side effect of `for...of`, a generator source is now closed when the callback throws.
