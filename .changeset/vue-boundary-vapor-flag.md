---
'@tsrx/vue-runtime': patch
---

`TsrxErrorBoundary` and `TsrxPendingBody` are marked as Vapor components (`__vapor`) on the client. After a page hydrated a `@try` with `createVaporSSRApp`, an app it mounted later with `createVaporApp` printed `@try` bodies as text, such as `[object HTMLButtonElement]`. vue-jsx-vapor renders a function component through one proxy per function, shared by every app, and the app that first makes the proxy decides whether it says the component is a Vapor one: a hydrating app, which has no `vaporInteropPlugin`, made one that didn't, so the later app, which the bundler plugins give that interop, mounted the boundary as a VDOM component. Any app without the interop that rendered a boundary first did the same. The boundaries' own flag now gives every app the same answer. On the server, where Vue renders them as functional VDOM components, they stay unflagged, and the server markup is unchanged.
