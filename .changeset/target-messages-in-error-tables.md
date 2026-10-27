---
'@tsrx/core': patch
'@tsrx/hono': patch
'@tsrx/solid': patch
---

The last target error messages written outside the error tables now come from `@tsrx/core/diagnostics`, with their codes unchanged. Hono DOM's error for an async component it renders is the new `HONO_DOM_ASYNC_COMPONENT_UNSUPPORTED` entry, and now formats `use(promise)` and `<Suspense>` as code. Hono's error for `@catch (error, reset)` is the new `TARGET_CATCH_RESET_UNSUPPORTED` entry (TSRX2026). Solid's error for the `finally` of a JavaScript `try` that throws in a component body raises core's `TEMPLATE_TRY_FINALLY`, so its wording follows core's: `` Solid TSRX does not support JavaScript `try/finally` in TSRX templates. … `` (was "in component templates"). When such a `try` has no `catch`, that is now its only error. Before, Solid also reported `` Solid try statements must have a `pending` or `catch` block. `` over the whole statement. Solid's missing-handler check now raises core's `TEMPLATE_TRY_HANDLER`.
