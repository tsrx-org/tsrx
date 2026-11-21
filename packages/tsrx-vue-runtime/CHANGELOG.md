# @tsrx/vue-runtime

## 0.2.6

### Patch Changes

- [#1442](https://github.com/tsrx-org/tsrx/pull/1442)
  [`fea1e90`](https://github.com/tsrx-org/tsrx/commit/fea1e90e93f95cfedf31f0755864cf09b9c3bc4a)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - `TsrxErrorBoundary` and
  `TsrxPendingBody` are marked as Vapor components (`__vapor`) on the client.
  After a page hydrated a `@try` with `createVaporSSRApp`, an app it mounted later
  with `createVaporApp` printed `@try` bodies as text, such as
  `[object HTMLButtonElement]`. vue-jsx-vapor renders a function component through
  one proxy per function, shared by every app, and the app that first makes the
  proxy decides whether it says the component is a Vapor one: a hydrating app,
  which has no `vaporInteropPlugin`, made one that didn't, so the later app, which
  the bundler plugins give that interop, mounted the boundary as a VDOM component.
  Any app without the interop that rendered a boundary first did the same. The
  boundaries' own flag now gives every app the same answer. The flag is set only
  where Vue's Vapor renderer is present, as the boundary already decides between
  its client and server paths: with Vue's Node build, the server renders them as
  functional VDOM components, unflagged, and its markup is unchanged.

- [#1446](https://github.com/tsrx-org/tsrx/pull/1446)
  [`2bf746a`](https://github.com/tsrx-org/tsrx/commit/2bf746a04c40d2a5793036f2079f423e2a4b2a62)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target, a
  `@try` with `@pending` whose `@catch` parameter pattern throws, such as
  `@catch ({ response: { status } })` for an error without a `response`, runs that
  pattern once and passes its error to the next `@catch` out, or to
  `app.config.errorHandler`, as a `@try` without `@pending` does. When the body
  threw as it rendered, or an async component rejected after the `Suspense` had
  resolved, the boundary inside the `Suspense` ran the pattern, and the boundary
  around the `Suspense`, which renders the same `@catch`, took its error as the
  body's and ran the pattern again before passing it on. A rejection while the
  `Suspense` is pending already ran it once. What the body's own code throws as
  the `@try` goes away, such as a throwing `onBeforeUnmount` the body registered,
  also goes on now, as it does without `@pending`: when the app unmounts, or when
  a `@try` around it shows its `@catch`, before, the boundary around the
  `Suspense` took it and it was lost. After the `@catch` calls `reset`, what the
  replaced body still throws stays in that `@catch`, as before, while the `@try`
  is mounted.

- [#1463](https://github.com/tsrx-org/tsrx/pull/1463)
  [`aa926f2`](https://github.com/tsrx-org/tsrx/commit/aa926f238565970d89b99bf10de717729571941c)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A `@try` now
  server-renders on Vue's bundler build, which a server resolves without the
  `node` condition (an edge or worker runtime, or an SSR bundle). That build has
  the Vapor renderer, so the boundary took its client path on the server: every
  `@try` rendered `<!---->`, and `app.config.errorHandler` got
  `ReferenceError: Node is not defined`. The boundary now detects a server render
  by the SSR context Vue's server renderer provides, as `useSSRContext` does, and
  renders as it does with Vue's Node build. `TsrxErrorBoundary` and
  `TsrxPendingBody` report themselves as Vapor components (`__vapor`) only where
  both Vue's Vapor renderer and a DOM are present when Vue asks, so a server on
  the bundler build doesn't see the flag either; it would make the server renderer
  drop what a component adds to a cloned slot child. A realm that has a DOM and
  also server-renders, such as a jsdom test, still sees the flag.

- [#1465](https://github.com/tsrx-org/tsrx/pull/1465)
  [`34366c2`](https://github.com/tsrx-org/tsrx/commit/34366c2d909c12241eb08459231b8f2b6d356b67)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target, an
  error a component throws as it is torn down, such as from `onBeforeUnmount`, now
  goes on from a `@try` that is going away, to the next `@catch` out or to
  `app.config.errorHandler`, as it does without the `@try`. When the app
  unmounted, or a `@try` around showed its `@catch` and removed it, the boundary
  took the error and it was lost, also for a `@try` with `@pending`. An `@if` that
  removes a `@try` hands the error to the `@catch` around it, as it does for a
  component without the `@try`. And a `@try` whose `@catch` just replaced its
  content, with or without `@pending`, no longer shows what that content throws as
  it is torn down in place of the error it was swapped in for: that error goes on
  to the next `@catch` out or to `app.config.errorHandler`. A teardown error that
  comes later, from `onUnmounted` or an async `onBeforeUnmount`, still replaces
  it. A loader that a `@try` with `@pending` reset away still doesn't reach the
  new body.

  An `onScopeDispose` that throws in content a `@try` removes no longer stops the
  `@try` from rendering: before, the old content stayed on screen and the `@try`
  stopped updating, and when it was swapping in its `@catch`, both errors were
  lost. Now the `@try` shows its `@catch`, or its content again after a reset, and
  the error goes on as above; when the content's own update removed the component,
  the `@catch` shows it, as for a component inside an `@if`. In development with
  nothing to take the error, it is logged rather than thrown, so the `@try` still
  renders. Vue's teardown of that component still stops partway, as it does
  without a `@try`: its `onBeforeUnmount` can run again as the `@try` removes it,
  and other parts of the removed content can stay mounted, or on screen, such as
  what a `Suspense` in it held.

## 0.2.5

### Patch Changes

- [#1421](https://github.com/tsrx-org/tsrx/pull/1421)
  [`5724d86`](https://github.com/tsrx-org/tsrx/commit/5724d86747970f313178fb88154c1253e636136b)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target, a
  `@try` whose body throws while an async component in it is still loading under a
  pending `Suspense` no longer leaves that `Suspense` on its fallback for good.
  Before, the boundary swapped in the `@catch` at once, which unmounted the async
  component the `Suspense` was waiting for: when an async component resolved to
  one that throws in setup, when a component beside a loading async component
  threw, or when one async component rejected while another was still loading. A
  `@try` with `@pending` now shows its `@catch` at once from the boundary around
  the `Suspense`, which replaces the whole `Suspense`, as React's error boundary
  around a `Suspense` does. That includes an error as the body renders again while
  the `Suspense` is pending, which before swapped in the `@catch` inside the
  `Suspense`, unmounting a component it still waited for. A plain `@try` inside an
  authored `Suspense` shows its `@catch` once the async components the `Suspense`
  waits for in its body have settled: one the error came through, one at the top
  of its body (through fragments, but not inside an element), and what those
  render once they resolve; one inside an element beside the component that threw
  is still missed. A waiting `@catch` is dropped if the `@try` resets, shows
  another error or unmounts first, or if a later error waits too, so the latest
  error shows. If the `Suspense` stops waiting for that round, for example by
  going back to the branch it was showing, the `@catch` stops waiting too. A
  `@try` with nothing loading, or in a `Suspense` that has resolved or isn't
  waiting for it, still shows its `@catch` at once.

- [#1423](https://github.com/tsrx-org/tsrx/pull/1423)
  [`62f4625`](https://github.com/tsrx-org/tsrx/commit/62f4625dc32eeed9307909cee158c3ce1808d893)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target, a
  `@try` now shows its `@catch` for an error its body's own inline code throws
  after the first render: an expression that throws on an update, such as
  `{props.item.price.amount}` once `price` is gone, or an event handler written in
  the body. Before, Vue passed such an error over the `@try`, because that code
  belongs to the boundary that renders the body, and Vue starts at that instance's
  parent. The error went to `app.config.errorHandler` while the body kept its last
  output, or a `@try` inside another one's body lost it to the outer `@catch`; the
  same code in a child component was caught. Each boundary now puts a hook first
  among its parent's error hooks, and that hook takes the errors the boundary
  itself is the source of while it shows its content.

  An `onErrorCaptured` hook in the component around the `@try` no longer sees the
  body's inline errors, since the `@catch` handles them, as it already didn't see
  a child component's errors in the body. Errors from a sibling of the `@try`,
  from a child component in the body, and from the `@catch`'s inline code while
  the `@catch` shows reach the same places as before.

  Some errors still go on as before: what the `@catch`'s own inline code throws
  while it shows, what the body throws while the `@try` unmounts, and what it
  throws while a `Suspense` around the `@try` is still pending, also in the branch
  a `Suspense` keeps showing while a new one loads, where swapping in the `@catch`
  could unmount a component the `Suspense` waits for. One case changes: a
  `@catch`'s inline async handler that calls `reset()`, and then fails after the
  body has rendered again, now brings that same `@catch` back over the recovered
  body. Before, its error went to the next `@try` out or to
  `app.config.errorHandler` and the body stayed. The `@catch`'s inline code
  belongs to the same boundary as the body, so once the body shows again, the
  boundary can't tell them apart. This matches what an error from a component in
  the `@catch` already did.

## 0.2.4

### Patch Changes

- [#1413](https://github.com/tsrx-org/tsrx/pull/1413)
  [`70f7d64`](https://github.com/tsrx-org/tsrx/commit/70f7d642950483081dbede9fe3a2cbbcb32070bf)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target, an
  error from a `@catch` body now goes to the next `@catch` out, or to
  `app.config.errorHandler` when there is none. React and Preact do the same for
  an error a `@catch` throws as it renders; they don't send an event handler's
  error to a boundary at all. Before, `TsrxErrorBoundary` caught it itself and
  rendered the same `@catch` again with it. When the `@catch` threw again as it
  rendered, that looped until Vue stopped with
  `Maximum recursive updates exceeded in component <TsrxErrorBoundary>`, and the
  enclosing `@catch` never showed. It happened when an async component in a `@try`
  with `@pending` rejected or the `@pending` body threw and the `@catch` then
  threw, and when a component the `@catch` rendered threw after the `@catch` had
  rendered, such as a VDOM component, the content of a `Teleport` or `Suspense`,
  or a watcher.

  An error counts as the `@catch`'s when its path reaches the boundary through a
  component created after the `@catch` first rendered. That includes an error a
  component of the `@catch` throws later, from an event handler or a watcher, also
  right after it calls `reset`: before, the `@catch` showed it in place of the
  first error, or looped when it threw as it rendered. An error from the body
  still shows in the `@catch`, also one that comes while or after the `@catch`
  renders. When it comes while the `@catch` first renders inside an outer `@try`,
  it now shows in that `@catch` too, not the outer one. A component created right
  under the boundary after the `@catch` first rendered counts as the `@catch`'s,
  even when body code created it, so its error goes on rather than showing in the
  `@catch`. That happens when the body threw as it first rendered and one of its
  `@if` branches, which go on updating out of sight as before, later renders a
  component, and when a watcher in a detached effect scope renders one while the
  `@catch` renders. A `@try` inside an authored `Suspense` in a `@catch`, whose
  body's inline code throws while that `Suspense` is pending, now sends the error
  to the next `@catch` out, or to `app.config.errorHandler`, and its body keeps
  its last output; before, its own `@catch` showed it. A `@try` with `@pending`
  renders its `@catch` from two boundaries, and the compiler now marks the inner
  one `sharesCatch`, so that the `@catch` runs once and its error goes on from
  both. A `@catch` that doesn't throw, and its `reset`, work as before.

- [#1416](https://github.com/tsrx-org/tsrx/pull/1416)
  [`390af1c`](https://github.com/tsrx-org/tsrx/commit/390af1c3857c60f51da2afe0ca203df039c1a923)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target,
  server rendering a `@try` now renders its body, or its `@catch` when the body
  throws as it renders. Before, `TsrxErrorBoundary` called Vue's Vapor
  `renderEffect`, which Vue's server build doesn't have, so every `@try` with a
  `@catch` rendered as an empty comment and `app.config.errorHandler` got
  `TypeError: vapor.renderEffect is not a function`. On the server the boundary
  now renders as a functional VDOM component. A component in the body that throws
  as the server renders it still goes to `app.config.errorHandler` and leaves a
  comment, as it does without a `@try`.

  A `@try` among an element's or fragment's children now compiles to a child
  component instead of an expression child (`{<__TsrxErrorBoundary … />}`).
  vue-jsx-vapor renders an expression child through a text placeholder, which
  can't hydrate a component: hydrating a `@try` inside an element stopped with
  `No current hydration node was found`, and its body no longer updated. In
  client-only rendering, a `@try` with siblings after it in an element now leaves
  an empty comment (`<!---->`) after its output: the anchor vue-jsx-vapor gives a
  child component that has siblings after it. A hydrated page keeps the server's
  nodes and has none.

  Some shapes still don't hydrate cleanly. With `@pending`, the body hydrates but
  stops updating. A body that is a fragment hydrates with a mismatch warning. When
  the server rendered the `@catch`, the client mismatches and leaves an empty node
  of the body beside it. A `@try` that reaches an element through another
  expression child, such as a `@switch` case, still can't hydrate, like any
  component there.

## 0.2.3

### Patch Changes

- [#1378](https://github.com/tsrx-org/tsrx/pull/1378)
  [`c4e6c8f`](https://github.com/tsrx-org/tsrx/commit/c4e6c8f0c1be4b82de6f86ce501f0b31c1245304)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target, a
  keyed `@for` whose body can skip a row (an `@if` without `@else`) or that has
  `@empty` now keeps each row's state when its rows move
  ([#178](https://github.com/tsrx-org/tsrx/issues/178)). These loops went through
  `map_iterable`, which rendered every row again on each change; they now render
  through `VaporFor` like other keyed loops with a one-element body. A skipped row
  renders an empty fragment. `@empty` and the rows read the source through one
  `computed`, so it is walked once
  ([#863](https://github.com/tsrx-org/tsrx/issues/863)). Such a loop keeps
  `map_iterable` when it has no key, when its body has setup statements, when its
  source, head, key, body or `@empty` awaits or yields, when its head destructures
  an array, has a default or a computed key, or collects the rest of an object
  (`{ id, ...rest }`), and, with `@empty`, when its row is a `@switch`. In a loop
  that moves, the key is read for every item, also one the body skips, so a key
  that only holds for the rows the body renders (`key item.data!.id` with
  `@if (item.data)`) now throws when the loop mounts; and the source is walked to
  the end before the rows render, as in other `VaporFor` loops.

  `VaporFor` now gets its items from `for_items`, a new helper in
  `@tsrx/vue-runtime/iterable`, so it walks the source the way `for...of` does
  ([#1147](https://github.com/tsrx-org/tsrx/issues/1147)): it follows an array's
  own `Symbol.iterator` and reads a `Symbol.iterator` getter once. A reactive
  array (`reactive([])`, or `ref([]).value`) is passed as it is, so `VaporFor`
  still tracks it when it is changed in place. A missing source (`null` or
  `undefined`) still renders no rows, and a keyed loop with `@empty` now renders
  `@empty` for it, where `map_iterable` threw. A number or a plain object, which
  `for...of` can't walk, now throws
  `TypeError: The loop target has to be an Iterable`, as it already did in the
  loops that use `map_iterable`; `VaporFor` rendered the numbers from 1 or the
  object's values.

  A `VaporFor` row that picks between `@if` and `@else` now switches branch when
  its condition changes. The row returned the choice, which Vapor evaluated once;
  it is now a fragment around the choice, which vue-jsx-vapor turns into a
  `createIf`.

  Two limits that every `VaporFor` loop already had now apply to the keyed loops
  that moved to it, as a deliberate trade for keeping their rows. With
  vue-jsx-vapor 3.2.29 they don't render on the server: `VaporFor` calls
  `createFor`, which Vue's server build doesn't have, so server rendering throws
  (a loop with `@empty` still renders it for an empty source). And a plain array,
  such as a `shallowRef`'s value, changed in place and then announced with
  `triggerRef` doesn't update them, since Vapor hands a component prop on only
  when its value changes.

  The `renderForOf` platform hook in `@tsrx/core` gets a fifth argument that
  builds the `@empty` block's render statements.

- [#1379](https://github.com/tsrx-org/tsrx/pull/1379)
  [`0a9f334`](https://github.com/tsrx-org/tsrx/commit/0a9f334696e37f2486cc84536e4ef24afd696665)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Vue, a throw in a
  `@pending` body now reaches `@catch`
  ([#1310](https://github.com/tsrx-org/tsrx/issues/1310)). The body renders
  through a new `TsrxPendingBody` component in the `Suspense` fallback slot, which
  hands the throw to Vue's error handling. Before, Vapor rendered the fallback
  slot outside that handling, so the throw ended `app.mount()` and neither
  `@catch` nor `app.config.errorHandler` saw it. The same `@try`'s `@catch` shows
  it now, or an enclosing one when the `@try` has none, and it stays when the
  `@try` body's async component resolves. With no `@catch` anywhere, the throw
  goes to `app.config.errorHandler`.

  That includes a `@try` inside an element, a child component or a keyed `@for`
  row under an outer `@try` with `@catch`: its own `@catch` shows its `@pending`
  throw, where the outer `@catch` used to replace everything, the whole list for a
  row. An error that a showing `@pending` body raises after its render, from a
  reactive expression on an update, an event handler or `onMounted`, now shows
  `@catch` too. Before, nothing showed it or reported it, and 3 nodes stayed in
  the DOM after unmount.

  `TsrxErrorBoundary` can now also replace a `Suspense` it renders when an error
  reaches it after the render, which a component in a `@pending` body that throws
  in setup needs: that left the boundary empty before. When it replaces its
  content after the render, it no longer leaves empty text nodes behind: a
  rejected async component in a `@try` body left one after unmount, each reset
  from an empty `@catch` to a `v-if` root left one, and a `@try` whose body is a
  bare keyed `@for` left two after a row threw and the app unmounted. Content that
  has no anchor of its own, such as a `Suspense` or a VDOM component that is the
  whole `@try` body, now has an empty text node after it; `innerHTML` doesn't
  change.

  The `@pending` body still runs only while the `@try` body suspends, as before.
  Its setup code now runs with `TsrxPendingBody` as the current instance, instead
  of the bridge instance Vue makes for the slot; `inject` there reads the same
  providers as before. Type-only output is unchanged.

## 0.2.2

### Patch Changes

- [#1079](https://github.com/tsrx-org/tsrx/pull/1079)
  [`f50dd3e`](https://github.com/tsrx-org/tsrx/commit/f50dd3ed94cc659ff733c82b66e148357d9b1a35)
  Thanks [@cestercian](https://github.com/cestercian)! - Vue `@for` loops that
  have `@empty`, can skip a row, or have statements in their body now go through
  `map_iterable`, so a `Set`, `Map`, generator or any other iterable works instead
  of throwing on `.map` / `.flatMap`. `@empty` reads that source once. A loop body
  that awaits imports `map_iterable_async` from the same module.

## 0.2.1

### Patch Changes

- [#1338](https://github.com/tsrx-org/tsrx/pull/1338)
  [`85567b6`](https://github.com/tsrx-org/tsrx/commit/85567b6852444e49dd900d00f80ce196c29c7f8f)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target,
  merged refs that another merged ref sets on the same element no longer clean
  each other up. With `mergeRefs(mergeRefs(a), mergeRefs(b))`, or a host element
  whose own `ref={mergeRefs(own)}` sits beside a spread that carries another
  merged ref, the second inner ref ran the first one's cleanup as if it replaced
  it, so `a` (or `own`) stayed `null` while the element was mounted. Each ref a
  merged ref holds now gets the element and is cleared once when the outer merged
  ref is unset or replaced, however the merged refs are nested. If a ref throws
  while a merged ref sets the element, the merged refs it already set are cleared
  on Vue's next `null` call or when another merged ref replaces it.

## 0.2.0

### Minor Changes

- [#1296](https://github.com/tsrx-org/tsrx/pull/1296)
  [`00a238c`](https://github.com/tsrx-org/tsrx/commit/00a238cc95013ca90e1fc2bd5fbb47b80c942664)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The Vue packages now
  need `vue` 3.6 or later, including 3.6.0's prereleases (`>=3.6.0-0`), and
  `vue-jsx-vapor` 3.2.27 or a later stable release (`>=3.2.27`). Until Vue 3.6.0
  is stable, install it as `"vue@^3.6.0-0"`.

  - Vue 3.5 has no Vapor, so a Vue 3.5 project never built. Under npm, the old
    `vue >=3.5` also rejected every Vue 3.6 prerelease, so the documented
    `npm install` failed with ERESOLVE whichever Vue it named.
  - `vue-jsx-vapor` 3.2.27 is the first release that fixes both a dev worker that
    imports a module exporting a function
    ([#186](https://github.com/tsrx-org/tsrx/issues/186)) and the space after an
    element that a `{…}` container renders last
    ([#870](https://github.com/tsrx-org/tsrx/issues/870)).
  - A project on `vue-jsx-vapor` 3.2.26 or earlier now gets an unmet peer warning
    from pnpm, and an install error under pnpm's `strict-peer-dependencies`. That
    is why this is a minor release.

### Patch Changes

- [#1258](https://github.com/tsrx-org/tsrx/pull/1258)
  [`2bc4f1f`](https://github.com/tsrx-org/tsrx/commit/2bc4f1fc5fcb9863c926ab3d01b0407e89bbf639)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - A ref list written on
  an element, `ref={[a, b]}`, now calls every ref in it on React, Preact, Hono and
  Vue, as it already did on Solid. These runtimes take a single ref, so the
  compiler passes the list to `__mergeRefs`: React and Hono share the merged ref
  through `merge_element_refs`'s cache, so an inline list is applied once, and
  Preact gets a new callback per render, as its merged refs already do. A list can
  nest, and a falsy entry such as the `false` of `cond && cb` is left out. Beside
  a spread, Preact and Vue no longer drop the list.

  The public `mergeRefs` now reads a ref list as the refs in it and leaves out a
  value that is not a ref instead of throwing, and its type takes lists and the
  falsy `false`, `0` and `''` of `cond && cb`, so the editor accepts
  `ref={[a, b]}` on every target. `merge_element_refs` merges a lone ref object
  from a list rather than giving it back. The `MULTIPLE_REFS` hint no longer
  limits `ref={[a, b]}` to some targets.

- [#1127](https://github.com/tsrx-org/tsrx/pull/1127)
  [`1310e6a`](https://github.com/tsrx-org/tsrx/commit/1310e6acd55e46e539fca0c63065318cc9bde3bf)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On the Vue target,
  `ref={mergeRefs(a, b)}` now type-checks, and so does the merged ref the compiler
  writes for a host element with a spread and a `ref` in a plain expression
  position, such as a ternary arm. Before, the editor and `tsrx-tsc` reported
  TS2322, because Vue types a `ref` callback as receiving an element, a component
  instance or `null`, and the merged callback accepted only the element.
  `mergeRefs` from `@tsrx/vue/ref` and `@tsrx/vue-runtime/ref` now returns a
  callback that accepts all three.

  A merged ref's cleanups now run on Vue. Vue ignores what a function ref returns
  and calls it with `null` when it unsets the ref, so a callback's returned
  cleanup never ran; the merged ref now runs it (and clears ref objects) on that
  `null` call, or when a re-created merged ref replaces it on the same element,
  which Vue does without calling the old one.

- [#1118](https://github.com/tsrx-org/tsrx/pull/1118)
  [`0246e95`](https://github.com/tsrx-org/tsrx/commit/0246e95f983c2efd83e3e99100d00a5ba24c9233)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - On Vue, `@catch` now
  handles errors under `@pending`. When an async child's loader rejects, the
  `@catch` fallback replaces the `@pending` one instead of `@pending` staying up
  with an unhandled rejection
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

- Updated dependencies
  [[`2bc4f1f`](https://github.com/tsrx-org/tsrx/commit/2bc4f1fc5fcb9863c926ab3d01b0407e89bbf639),
  [`bf6d334`](https://github.com/tsrx-org/tsrx/commit/bf6d3349a59f8ec1769d5a2f789801af7cd74ff7),
  [`2b465b4`](https://github.com/tsrx-org/tsrx/commit/2b465b432b515c07047e3eadeb66ff34df95de2d),
  [`ced2603`](https://github.com/tsrx-org/tsrx/commit/ced260375637359686e521cce628be3057d455df),
  [`9ff7b5d`](https://github.com/tsrx-org/tsrx/commit/9ff7b5d5f80e7697896d91d5674ccccb389a890d),
  [`6b207b6`](https://github.com/tsrx-org/tsrx/commit/6b207b65e8a339d5fe301c60e72db271ffb9a572),
  [`2473538`](https://github.com/tsrx-org/tsrx/commit/247353854e918f119dafe88f6474a2738cb82ed8),
  [`0ca1023`](https://github.com/tsrx-org/tsrx/commit/0ca10232569e9beaad7d1d0d53d209e6520385fa),
  [`153b526`](https://github.com/tsrx-org/tsrx/commit/153b5267ad6445abdb81f85d5ad32409d6101d7e),
  [`384972f`](https://github.com/tsrx-org/tsrx/commit/384972fcdd5eaeb09b92a852bb3d9ee186689286),
  [`0ee439a`](https://github.com/tsrx-org/tsrx/commit/0ee439a5d94e071ecae594229f61e9b5ee022296),
  [`56dd6f5`](https://github.com/tsrx-org/tsrx/commit/56dd6f573f9c7c822db9d33313317bed16f7fa45)]:
  - @tsrx/runtime@0.2.5

## 0.1.13

### Patch Changes

- [#988](https://github.com/tsrx-org/tsrx/pull/988)
  [`f518cb9`](https://github.com/tsrx-org/tsrx/commit/f518cb91a120e8a368cece21efbc954135f99dfe)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Lower a `@catch` body once
  when the target renders it through a fallback component. For Vue, a `@try` with
  `@pending` and `@catch` no longer hoists a static catch body a second time for
  an inline fallback that is never used; the fallback renders the component
  instead.

  Type `TsrxErrorBoundary` as returning Vue's `Block`, so `<TsrxErrorBoundary>` in
  the type-only output for `@try` / `@catch` is a valid `vue-jsx-vapor` JSX
  element. Under `strict` it reported TS2786 because its declared return type
  included `undefined`.

## 0.1.12

### Patch Changes

- Updated dependencies
  [[`baaad3d`](https://github.com/tsrx-org/tsrx/commit/baaad3db8a5ec9add8c584351c2d2040bdee6f49)]:
  - @tsrx/runtime@0.2.4

## 0.1.11

### Patch Changes

- Updated dependencies
  [[`3d6fa8c`](https://github.com/tsrx-org/tsrx/commit/3d6fa8cadecf5c550231101a899960e53796483f),
  [`af6475e`](https://github.com/tsrx-org/tsrx/commit/af6475e7ec2a430d9ef5675d0cd512457572fb16)]:
  - @tsrx/runtime@0.2.3

## 0.1.10

### Patch Changes

- Updated dependencies
  [[`ca84d73`](https://github.com/tsrx-org/tsrx/commit/ca84d7333621ad809593add9f8202c9a16cc6ce3)]:
  - @tsrx/runtime@0.2.2

## 0.1.9

### Patch Changes

- Updated dependencies
  [[`449338e`](https://github.com/tsrx-org/tsrx/commit/449338e4f17ff0e0d0814a1e8dcb8745c5771589)]:
  - @tsrx/runtime@0.2.1

## 0.1.8

### Patch Changes

- Updated dependencies
  [[`6ac7e34`](https://github.com/tsrx-org/tsrx/commit/6ac7e3422a71f19f7defb5dd7df3e8df5d089bfe),
  [`734023b`](https://github.com/tsrx-org/tsrx/commit/734023bbee936d50c67c85396014ad2373f5c550),
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`79c1359`](https://github.com/tsrx-org/tsrx/commit/79c1359650d7e74914e818bbf179b6a41d06370c),
  [`c2bdb3d`](https://github.com/tsrx-org/tsrx/commit/c2bdb3dbd94f9db0a0a075bc53072da343d73091)]:
  - @tsrx/runtime@0.2.0

## 0.1.7

### Patch Changes

- Updated dependencies
  [[`6908ee3`](https://github.com/tsrx-org/tsrx/commit/6908ee3496562e3c989f2f360cc8a848c2e5ff50)]:
  - @tsrx/runtime@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies
  [[`4d8bc9b`](https://github.com/tsrx-org/tsrx/commit/4d8bc9b8ef0b401f4fb0b4186368fdc8895804b2),
  [`8cf6514`](https://github.com/tsrx-org/tsrx/commit/8cf6514f6fecc04e8fb5b9c37c92424f3f8e3532)]:
  - @tsrx/runtime@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies
  [[`de31ea4`](https://github.com/tsrx-org/tsrx/commit/de31ea41a346e072de42bef3b36716077c681ea8),
  [`e3eaa41`](https://github.com/tsrx-org/tsrx/commit/e3eaa419915db5525829b3a401642c4ffcb16433),
  [`20ff7d5`](https://github.com/tsrx-org/tsrx/commit/20ff7d5ca7c03642e51280690f1e1c875bf75848),
  [`ebab7e0`](https://github.com/tsrx-org/tsrx/commit/ebab7e06fc19b3fe596d6024ea98e75bcd8376a5)]:
  - @tsrx/runtime@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies
  [[`f16c113`](https://github.com/tsrx-org/tsrx/commit/f16c1138d1ac9969afe39696ebf9b41579bb27c5)]:
  - @tsrx/runtime@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies
  [[`544ae9a`](https://github.com/tsrx-org/tsrx/commit/544ae9a51f17a39e66cf0eceea862f8b30307047)]:
  - @tsrx/runtime@0.1.3

## 0.1.2

### Patch Changes

- Republish the TSRX runtime packages from the dedicated TSRX repository so their
  npm metadata and provenance identify `tsrx-org/tsrx`.

- Updated dependencies:
  - @tsrx/runtime@0.1.2

## 0.1.1

### Patch Changes

- [#1398](https://github.com/Ripple-TS/ripple/pull/1398)
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)
  Thanks [@aleclarson](https://github.com/aleclarson)! - Split compiler-emitted
  helpers into shared and renderer-specific runtime packages, and add opt-in
  direct runtime imports across supported build integrations.
- Updated dependencies
  [[`2aa2b6f`](https://github.com/Ripple-TS/ripple/commit/2aa2b6f4beff43b61badd1fb7d11433e9e4f52b3),
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)]:
  - @tsrx/runtime@0.1.1
