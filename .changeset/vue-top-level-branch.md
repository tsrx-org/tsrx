---
'@tsrx/core': patch
'@tsrx/vue': patch
---

On the Vue target, a component whose only output is an `@if`, a `@switch` or an `@for` that renders through `map_iterable` now follows its props. A Vapor component's setup runs once, and it returned the `@if`'s choice, the `@switch`'s IIFE or the `map_iterable` call, so the component kept rendering what they gave at mount (a status badge stayed `Online` after its prop changed to `idle`). The output is now a fragment around them: vue-jsx-vapor makes the `@if` a `createIf` and evaluates the loop in an effect, and the `@switch` renders as a `@switch` row does since #1388 (a `computed` that picks the case, and `createIf`s), so a branch or case keeps its components' state while it stays chosen. This holds for a plain function that returns an `@if`, a `@switch` or an `@for` expression too. The type-only output doesn't change.

Server rendering still works for these components, but the fragment adds `<!--[-->`/`<!--]-->` markers around the output, and hydrating that markup logs a hydration mismatch, after which Vue renders the component on the client and it follows its props. Before, an `@if` or a `@switch` hydrated without a warning and then never updated.

`@tsrx/core` exports its `@if` lowering as `ifStatementToJsxChild`, for a platform's `controlFlow.ifStatement` hook.
