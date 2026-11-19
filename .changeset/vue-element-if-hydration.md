---
'@tsrx/core': patch
'@tsrx/vue': patch
---

On the Vue target, a server-rendered element whose child is an `@if` without `@else` (including an `@else if` chain without one) now hydrates when its condition was false on the server. Hydration used to throw `Cannot read properties of null (reading 'insertBefore')`: vue-jsx-vapor makes the shared lowering's `null` branch `createNodes(null)`, which doesn't take the server's `<!---->`. When each branch is one element or component, the choice now renders as `v-if` / `v-else-if` elements. These hydrate both the `<!---->` and a rendered branch, then follow their conditions, and a branch keeps its state while it stays chosen.

These keep the shared lowering:

- a branch with setup statements, or a `<template>`, `<slot>` or `<component>` branch;
- an `@if` with `@else`, which already hydrated;
- a choice followed, past any other children, by an element with its own `v-else` or `v-else-if`.

`@tsrx/core` exports its `@if` lowering as `ifStatementToJsxChild`, for a platform's `controlFlow.ifStatement` hook.
