---
'@tsrx/vue': patch
'@tsrx/vue-runtime': patch
---

On Vue, a throw in a `@pending` body now reaches `@catch` (#1310). The body renders through a new `TsrxPendingBody` component in the `Suspense` fallback slot, which hands the throw to Vue's error handling. Before, Vapor rendered the fallback slot outside that handling, so the throw ended `app.mount()` and neither `@catch` nor `app.config.errorHandler` saw it. The same `@try`'s `@catch` shows it now, or an enclosing one when the `@try` has none, and it stays when the `@try` body's async component resolves. With no `@catch` anywhere, the throw goes to `app.config.errorHandler`.

`TsrxErrorBoundary` can now also replace a `Suspense` it renders when an error reaches it after the render, which a component in a `@pending` body that throws in setup needs: that left the boundary empty before. When it replaces its content after the render, it no longer leaves an empty text node behind: a rejected async component in a `@try` body left one after unmount, and so did each reset from an empty `@catch` to a `v-if` root.

The `@pending` body still runs only while the `@try` body suspends, as before. Its setup code now runs with `TsrxPendingBody` as the current instance, instead of the bridge instance Vue makes for the slot; `inject` there reads the same providers as before. Type-only output is unchanged.
