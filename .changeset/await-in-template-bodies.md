---
'@tsrx/core': patch
'@tsrx/runtime': patch
---

An async component can now `await` inside `@for`, `@empty`, `@switch`, and `@if`
bodies on React, Preact, and the Hono server target. These bodies compile to
callbacks and IIFEs that were not async, so the output was invalid: builds failed
with "`await` is only allowed within async functions" and editors reported
TS1308. The compiler now makes those generated functions async and awaits them in
the component. A loop body with an `await` compiles to the new
`map_iterable_async` runtime helper, which finishes one item before it starts the
next, like a `for...of` loop in an async function. An `await` in a `@catch` body
is now reported at the `await` itself, because the target calls that fallback
during rendering and cannot wait for its result.
