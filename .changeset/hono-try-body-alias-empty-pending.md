---
'@tsrx/core': patch
'@tsrx/hono': patch
---

The React, Preact and Hono targets now import the `TsrxTryBody` that renders a `@try` or `@pending` body as `__TsrxTryBody`, as they already did for `Suspense`, `Fragment` and `TsrxErrorBoundary`. An authored binding named `TsrxTryBody`, imported or local, no longer collides with the generated import or takes the place of the generated element, which then rendered the authored component instead of the body.

On Hono, an empty `@pending`, and one that can render nothing, such as a lone `@if`, now passes an empty fragment as the `Suspense` fallback instead of `null`. Once the body suspended, Hono's server renderer called `fallback.toString()`: the `@catch` showed `TypeError: Cannot read properties of null (reading 'toString')`, or without one the stream closed empty. Hono's DOM renderer let the suspension through, so `render()` threw the promise and nothing rendered.
