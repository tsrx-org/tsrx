---
'@tsrx/vue': patch
---

On the Vue target, a host element's child `@if` / `@else` whose branches are each one element or component now renders as `v-if` / `v-else` elements. Alone or beside other elements, that is the same `createIf` as before, with the same flags. Beside another expression child, including an `@for` or a `@switch`, vue-jsx-vapor used to evaluate the `@if`'s ternary inside that child's `setNodes` effect. That caused these problems, now fixed:

- **State loss.** The branch rendered again, and its components lost their state, whenever what the condition read changed, even when its value didn't (#1402). The branch now stays while the condition does.
- **Hydration.** Hydrating server markup there threw `No current hydration node was found`. The server's branch now hydrates. One case still breaks: when an expression just before the choice rendered nothing on the server (a `<!---->`), hydration logs a mismatch and renders the branch a second time. On main this case threw, and an `@if` without `@else` behaves the same.
- **Fallthrough.** A component branch there was created as its parent's single root, so it took the parent component's fallthrough `class`, `data-*` attributes and listeners, and a parent's `onClick` fired twice. It no longer does.
- **Teleport.** A `VaporTeleport` branch there left a `<!--teleport start-->` comment behind on each toggle. It no longer does.

A `v-if` anchor comment now marks the choice.

These keep the shared lowering, and beside an expression child they still render their branch again:

- `@else if` chains;
- branches with setup statements, a spread host element, a dynamic tag, or a `<template>`, `<slot>` or `<component>`;
- an element with any `v-` attribute of its own;
- a choice whose next element has its own `v-else` or `v-else-if`.

A component's child (such as `KeepAlive`'s) also keeps the shared lowering, because vue-jsx-vapor's server build would pass `v-if` / `v-else` to it as two children. Slot content already compiled to a `createIf` that keeps its state.
