---
'@tsrx/vue-runtime': patch
---

A `@try` now server-renders on Vue's bundler build, which a server resolves without the `node` condition (an edge or worker runtime, or an SSR bundle). That build has the Vapor renderer, so the boundary took its client path on the server: every `@try` rendered `<!---->`, and `app.config.errorHandler` got `ReferenceError: Node is not defined`. The boundary now detects a server render by the SSR context Vue's server renderer provides, as `useSSRContext` does, and renders as it does with Vue's Node build. `TsrxErrorBoundary` and `TsrxPendingBody` report themselves as Vapor components (`__vapor`) only where both Vue's Vapor renderer and a DOM are present when Vue asks, so a server on the bundler build doesn't see the flag either; it would make the server renderer drop what a component adds to a cloned slot child. A realm that has a DOM and also server-renders, such as a jsdom test, still sees the flag.
