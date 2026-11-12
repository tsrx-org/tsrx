---
'@tsrx/react': minor
'@tsrx/preact': minor
'@tsrx/hono': minor
'@tsrx/react-runtime': minor
'@tsrx/preact-runtime': minor
---

On React, Preact and Hono, the editor now types the `@catch` binding as
`unknown` instead of `Error`, as Vue already does
([#1076](https://github.com/tsrx-org/tsrx/issues/1076)). The binding is the
thrown value as it is, which can be a string, `null` or anything else. On Hono,
`@tsrx/hono/error-boundary` and `@tsrx/hono/dom/error-boundary` now declare
their own `TsrxErrorBoundary` type over Hono's `ErrorBoundary`, whose
`fallbackRender` is typed `(error: Error)`.

Code that type-checked before can now fail: `@catch (e) { <p>{e.message}</p> }`
reports TS18046 (`'e' is of type 'unknown'`), and an annotation such as
`@catch (e: Error)` reports TS2322. To migrate, drop the annotation and check the
value before reading its properties, for example
`e instanceof Error ? e.message : String(e)`.
