---
'@tsrx/core': patch
'@tsrx/hono': patch
---

The React, Preact and Hono targets now import the `TsrxTryBody` that renders a `@try` or `@pending` body as `__TsrxTryBody`, as they already did for `Suspense`, `Fragment` and `TsrxErrorBoundary`. An authored binding named `TsrxTryBody`, imported or local, no longer collides with the generated import or takes the place of the generated element, which then rendered the authored component instead of the body.

On Hono, the `Suspense` fallback is now always a node. An empty `@pending` passes an empty fragment instead of `null`, and any other `@pending` body is wrapped in a fragment, since it lowers to an expression that can still give `null`, such as a lone `@if` that renders nothing. Before, once the body suspended behind a `null` fallback, Hono's server renderer called `fallback.toString()`: the `@catch` showed `TypeError: Cannot read properties of null (reading 'toString')`, or without one the stream closed empty. Hono's DOM renderer let the suspension through, so `render()` threw the promise and nothing rendered.
