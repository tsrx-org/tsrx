---
'@tsrx/core': minor
---

A bare `:global` anywhere in the argument of a pseudo-class such as `:is()`, `:not()` or `:has()` is now reported as `TSRX3011`, as the specification says. Only one that started the argument's compound was (`:is(:global.x)`); one after another simple selector (`:is(.x:global, .b)`) or after a `:global(...)` compound (`:is(:global(.x) :global .y)`) compiled, the `:global` silently ignored or the rest of the selector left as written.

Migration: drop the bare `:global` from the argument, or wrap the part to leave unscoped in `:global(...)`: `:is(.x:global, .b)` becomes `:is(.x, .b)`.
