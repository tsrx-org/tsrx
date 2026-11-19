---
'@tsrx/core': patch
'@tsrx/vue': patch
---

On the Vue target, a server-rendered element whose child is an `@if` without `@else` (or with an empty `@else {}`) now hydrates when its condition was false on the server. Hydration used to throw `Cannot read properties of null (reading 'insertBefore')`: vue-jsx-vapor makes the shared lowering's `null` branch `createNodes(null)`, which doesn't take the server's `<!---->`. When the branch is one element or component, the choice now renders as that element with `v-if`, which hydrates both the `<!---->` and a rendered branch and then follows the condition.

Client behaviour that changes with it:

- **Sibling expressions.** The `v-if` is a `createIf` of its own, so its branch keeps its components' state when an expression child beside it changes (part of #1402). An `@if` with a non-empty `@else` there still renders again.
- **Slot fallback.** When a component's child content is only such `@if`s and all of them are false, the component's `<slot>` fallback now shows on the client too, as it does on the server. Hydrating that fallback and then toggling the `@if` leaves the server's fallback text in place beside the new one (`fallbackfallback`), a gap in vue-jsx-vapor's `<slot>` output.

These keep the shared lowering, and still fail to hydrate when false on the server:

- an `@else if` chain, whose nested ternary gives a keyed `createIf` that `VaporKeepAlive` caches, where vue-jsx-vapor's `v-else-if` doesn't;
- a branch with setup statements, a host element with a spread (`<p {...attrs}>`), or a dynamic tag;
- a `<template>`, `<slot>` or `<component>` branch;
- a branch element with any `v-` attribute of its own, plain or namespaced (`v-slot`, `v-slot:name`, `v-focus`);
- a choice whose next element, past any text or expression children, has its own `v-else` or `v-else-if`.

An `@if` with a non-empty `@else` already hydrated and keeps the shared lowering too.

`@tsrx/core` exports its `@if` lowering as `ifStatementToJsxChild`, for a platform's `controlFlow.ifStatement` hook.
