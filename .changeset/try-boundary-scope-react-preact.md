---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
'@tsrx/hono': patch
'@tsrx/react-runtime': patch
'@tsrx/preact-runtime': patch
---

On React, Preact and Hono, a `@try` body's setup statements now run inside its
boundary, as they already do on Solid and Vue. A synchronous throw in the body,
such as `const data = load();`, renders the `@catch` fallback instead of escaping
the boundary, and `use(promise)` called in the body shows the `@pending` fallback
instead of leaving the root blank
([#510](https://github.com/tsrx-org/tsrx/issues/510)). The compiled body renders
through a new `TsrxTryBody` component from the new `try-body` runtime modules
(`@tsrx/react/try-body`, `@tsrx/preact/try-body`, `@tsrx/hono/try-body` and the
matching `-runtime` packages). These modules import nothing, so a `@try` with
only `@pending` still works in React Server Components. Each `@try` site is
keyed, so two `@try` blocks rendered in the same place, such as the arms of an
`@if`, no longer share boundary state or body hooks. A body that uses `await` or
`yield` still runs inline in the enclosing function, which has to settle it.

`@catch` now also catches a thrown `null` on React and Preact
([#847](https://github.com/tsrx-org/tsrx/issues/847)). Preact itself turns a
`null` or `undefined` thrown while rendering into a `TypeError`, so on Preact the
value arrives unchanged only when it is thrown from an effect.
