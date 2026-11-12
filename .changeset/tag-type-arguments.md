---
'@tsrx/core': patch
---

Any type arguments after a tag name now parse, as in TSX: `<Tag<T, U> />`, `<List<string | number> />`, `<a.b<[T]> />`, `<Tag<{ a: T }> />`, `<Tag<() => void> />` and the like. Only a single name, a literal or a nested generic used to parse; anything else failed with "Unexpected token", except inside an element's `{ }`.
