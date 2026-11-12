---
'@tsrx/solid': patch
---

A Solid `@if` with a condition that can't change, such as `@if (true)` or
`@if (import.meta.env.DEV)`, whose body keeps `<Show>` (for example because it
has setup statements) now lowers that body once. Before, the body was lowered
twice: its diagnostics were reported twice, and generated names in it skipped a
number.
