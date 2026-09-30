---
'@tsrx/core': patch
'@tsrx/vue': patch
'@tsrx/solid': patch
'@tsrx/hono': patch
---

Stop moving hooks out of template control flow for Vue, Solid and Hono DOM. A
hook (or, on Vue, a `ref()`, `computed()` or similar call) inside an `@if`,
`@for`, `@switch` or `@try` body now stays in that body, as it already does for
React and Preact, so the Rules of Hooks apply as they do in TSX. Give hook state
that belongs to a branch its own component.

The type-only output for editors no longer declares an untyped
`let <Component>__StatementBodyHook<N>;` cache, which TypeScript 7 reported as
TS7034 and TS7005 under `noImplicitAny`.

Platform authors: the `moduleScopedHookComponents` and `isTopLevelSetupCall`
platform hooks, the `moduleScopedHookComponents` transform option, and the
`planSwitchLift`, `cloneSwitchHelperInvocation` and
`rewriteLoopContinuesToBareReturns` exports are removed. `createHookSafeHelper`
now takes `(bodyNodes, sourceNode, ctx, options)`, and the new
`summarize_switch_case` export returns a `@switch` case's own body.
