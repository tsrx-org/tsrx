---
'@tsrx/core': patch
'@tsrx/vue': patch
'@tsrx/vite-plugin-vue': patch
---

On the Vue target, a component whose only output is an `@if`, a `@switch` or an `@for` that renders through `map_iterable` now follows its props. A Vapor component's setup runs once, and it returned the `@if`'s choice, the `@switch`'s IIFE or the `map_iterable` call, so the component kept rendering what they gave at mount (a status badge stayed `Online` after its prop changed to `idle`). The client output now puts them in a fragment, which vue-jsx-vapor renders as it does the same child of an element: an `@if` becomes a `createIf`, and a loop is evaluated in an effect. A `@switch` whose cases each render one element, component or fragment renders as a `@switch` row does since #1388 (a `computed` picks the case, and `createIf`s render it), so the case keeps its components' state while it stays chosen; an `@if` branch of that kind does too. A branch or case with setup statements renders again for each change it reads, as it does inside an element. A plain function that returns an `@if`, a `@switch` or an `@for` expression changes the same way. The type-only output doesn't change.

`compile` in `@tsrx/vue` takes an `ssr` option for a server build that vue-jsx-vapor compiles with `ssr` on, and `@tsrx/vite-plugin-vue` sets it for Vite's server build. A server render runs once, so that output returns the control flow as it is: the server markup and the component's inherited attributes stay as they were, and the client output hydrates a branch that rendered on the server and then follows its props. When the server rendered nothing for the component (an `@if` without `@else` whose condition was false, or a `@switch` with no matching case), hydrating it hits the same vue-jsx-vapor error as an `@if` inside an element whose condition was false on the server.

`@tsrx/core` exports its `@if` lowering as `ifStatementToJsxChild`, for a platform's `controlFlow.ifStatement` hook.
