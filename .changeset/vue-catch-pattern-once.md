---
'@tsrx/vue-runtime': patch
---

On the Vue target, a `@try` with `@pending` whose `@catch` parameter pattern throws, such as `@catch ({ response: { status } })` for an error without a `response`, runs that pattern once and passes its error to the next `@catch` out, or to `app.config.errorHandler`, as a `@try` without `@pending` does. When the body threw as it rendered, the boundary inside the `Suspense` ran the pattern, and the boundary around the `Suspense`, which renders the same `@catch`, took its error as the body's and ran the pattern again before passing it on. An async rejection already ran it once.
