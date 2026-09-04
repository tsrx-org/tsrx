---
'@tsrx/runtime': patch
---

Speed up `map_iterable` for the common single-node `@for` body by preallocating after the first mapped value, and use `Set`/`Map` size so `is_last` does not require peeking the next iterator result.
