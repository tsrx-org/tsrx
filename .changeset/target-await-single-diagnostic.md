---
'@tsrx/core': patch
'@tsrx/solid': patch
'@tsrx/vue': patch
'@tsrx/hono': patch
---

On Solid, Vue and Hono DOM, whose components can't be async, each `await` in a component is now reported once, as TSRX2021 with the target's own message. Before, an `await` in a part of the template that renders through a callback (an `@for` body on Solid and Vue, an `@try` or `@pending` body on Vue, an `@catch` body on all three, an `@if` or `@switch` body with setup statements on Solid) was reported twice: once by the target and once by the shared check, whose advice to await the value in the component body doesn't apply on these targets. An `@for await` on Vue and Hono DOM is no longer also reported as TSRX2024. In collecting mode and in the editor, every `await` of a component is now reported, not only the first. An `await` in a nested function is still allowed.

The three messages now live in the error tables in `@tsrx/core/diagnostics`: `TARGET_COMPONENT_AWAIT_UNSUPPORTED` (`Solid TSRX components do not support \`await\`.`, and the same for Vue) and `HONO_DOM_COMPONENT_AWAIT_UNSUPPORTED`, which keeps Hono DOM's advice to use `use(promise)` with `<Suspense>`. Solid's message was `` `await` is not allowed inside Solid components. `` and Vue's was `` `await` is not yet supported in Vue TSRX components. ``.
