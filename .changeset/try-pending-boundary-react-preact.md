---
'@tsrx/core': patch
'@tsrx/react': patch
'@tsrx/preact': patch
---

On React and Preact, when rendering on the client, a `@pending` body now runs
only while the `@try` body suspends, as it already does on Solid, and a throw in
it reaches `@catch`. Before, the body ran on every render of the parent
component, even when nothing suspended, and a throw in it escaped the same
`@try`'s `@catch` and rejected the render. The fallback now renders as the
`TsrxTryBody` component that the `@try` body already uses.

What moves with it:

- Hooks in a `@pending` body now belong to the fallback rather than the parent
  component, so their state starts fresh each time the fallback appears.
- `useContext` in a `@pending` body now sees providers that the same component
  renders around the `@try`. Before, it saw the parent's context.
- A `@pending` body that uses `await` or `yield` still runs inline in the
  enclosing function, which has to settle it, so it still runs on every render
  and a throw in it still escapes the same `@try`'s `@catch`.

Limits:

- On Preact, when the `@pending` body itself suspends, nothing renders in its
  place until the `@try` body resolves. React shows the enclosing `@pending`
  instead, and so did Preact before this change. preact/compat's `Suspense`
  counts a suspension thrown by its own fallback as one more suspension of its
  children.
- On the server, `@catch` doesn't apply, because React's server renderer doesn't
  run error boundaries. When a `@pending` body throws while the `@try` body
  suspends, `renderToString` now fails with React's "A component suspended while
  responding to synchronous input" message instead of the thrown error.
- React Server Components render the fallback eagerly, so there the `@pending`
  body still runs even when nothing suspends.

Hono keeps the inline fallback. Its DOM renderer can't recover when a `Suspense`
fallback component throws, and with the inline fallback an enclosing `@catch`
still catches the throw. A new `jsx.pendingFallback` platform option selects the
new behavior.
