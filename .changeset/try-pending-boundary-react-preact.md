---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
---

On React and Preact, a `@pending` body now runs only while the `@try` body
suspends, as it already does on Solid, and a throw in it reaches `@catch`. Before,
the body ran on every render of the parent component, even when nothing
suspended, and a throw in it escaped the same `@try`'s `@catch` and rejected the
render. The fallback now renders as the `TsrxTryBody` component that the `@try`
body already uses. Hooks in a `@pending` body now belong to the fallback rather
than the parent component, so their state starts fresh each time the fallback
appears. A `@pending` body that uses `await` or `yield` still runs inline in the
enclosing function, which has to settle it, so it still runs on every render and
a throw in it still escapes the same `@try`'s `@catch`.

Hono keeps the inline fallback. Its DOM renderer can't recover when a `Suspense`
fallback component throws, and with the inline fallback an enclosing `@catch`
still catches the throw. A new `jsx.pendingFallback` platform option selects the
new behavior.
