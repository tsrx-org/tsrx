---
'@tsrx/core': patch
'@tsrx/vue': patch
'@tsrx/vue-runtime': patch
---

On Vue, `@catch` now handles errors under `@pending`. When an async child's
loader rejects, the `@catch` fallback replaces the `@pending` one instead of
`@pending` staying up with an unhandled rejection
([#1078](https://github.com/tsrx-org/tsrx/issues/1078)), and `reset()` renders
the body again after it threw while setting up
([#937](https://github.com/tsrx-org/tsrx/issues/937)); it did nothing before.

The boundary also catches errors from child components when the app sets
`app.config.errorHandler`, and in production builds, including a `@try` inside
element children, which now compiles to a boundary component like every other
`@try`. It used to rely on Vue re-throwing unhandled errors, which Vue does only
in development and only when no `errorHandler` is set. As with Vue's
`errorCaptured`, an error that `@catch` handles no longer reaches
`app.config.errorHandler`.

An error now goes to the boundary around the component it came from, even when
another boundary is rendering at the time; `reset()` also recovers after a
thrown `null`; and the boundary's `fallback` and `content` props no longer
appear as attributes on the element it renders.
