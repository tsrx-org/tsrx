---
'@tsrx/vue': patch
'@tsrx/vue-runtime': patch
---

On the Vue target, server rendering a `@try` now renders its body, or its `@catch` when the body throws as it renders. Before, `TsrxErrorBoundary` called Vue's Vapor `renderEffect`, which Vue's server build doesn't have, so every `@try` with a `@catch` rendered as an empty comment and `app.config.errorHandler` got `TypeError: vapor.renderEffect is not a function`. On the server the boundary now renders as a functional VDOM component. A component in the body that throws as the server renders it still goes to `app.config.errorHandler` and leaves a comment, as it does without a `@try`.

A `@try` among an element's or fragment's children now compiles to a child component instead of an expression child (`{<__TsrxErrorBoundary … />}`). vue-jsx-vapor renders an expression child through a text placeholder, which can't hydrate a component: hydrating a `@try` inside an element stopped with `No current hydration node was found`, and its body no longer updated. In client-only rendering, a `@try` with siblings after it in an element now leaves an empty comment (`<!---->`) after its output: the anchor vue-jsx-vapor gives a child component that has siblings after it. A hydrated page keeps the server's nodes and has none.

Some shapes still don't hydrate cleanly. With `@pending`, the body hydrates but stops updating. A body that is a fragment hydrates with a mismatch warning. When the server rendered the `@catch`, the client mismatches and leaves an empty node of the body beside it. A `@try` that reaches an element through another expression child, such as a `@switch` case, still can't hydrate, like any component there.
