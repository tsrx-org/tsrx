---
'@tsrx/vue': patch
---

On the Vue target, an element's child `@if` / `@else` whose branches are each one element or component now renders as `v-if` / `v-else` elements. Alone, that is the same `createIf` as before, with the same flags. Beside another expression child, though, vue-jsx-vapor evaluated the `@if`'s ternary inside that child's `setNodes` effect. So:

- the branch rendered again, and its components lost their state, whenever what the condition read changed, even when its value didn't (#1402);
- hydrating server markup there threw `No current hydration node was found`.

Both now behave as for an `@if` alone: the branch stays while the condition does, and the server's branch hydrates. A `v-if` anchor comment now marks the choice there.

The same branches keep the shared lowering as for an `@if` without `@else`:

- `@else if` chains;
- branches with setup statements, a spread host element, a dynamic tag, or a `<template>`, `<slot>` or `<component>`;
- an element with any `v-` attribute of its own;
- a choice whose next element has its own `v-else` or `v-else-if`.
