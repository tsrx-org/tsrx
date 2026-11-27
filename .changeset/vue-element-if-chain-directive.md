---
'@tsrx/vue': patch
---

On the Vue target, a host element's child `@if` with `@else if` branches now renders as `v-if` / `v-else-if` / `v-else` elements when each branch is one element or component, as `@if` / `@else` already did. So does an `@else` whose only output is an `@if`. A branch element can now also have `v-show`, in an `@if` and in a `@switch` case. The shared lowering was a nested ternary, which caused these problems, now fixed:

- **State loss** (#1402). Beside another expression child, vue-jsx-vapor evaluated the ternary inside that child's `setNodes` effect, so the branch rendered again, components and all, whenever what the conditions read changed. The branch now stays while its condition does.
- **Hydration.** Beside an expression child, hydrating threw `No current hydration node was found` or `Cannot read properties of null (reading 'nodeType')`, or left the page frozen. Alone, the server rendered a later branch inside a fragment (`<!--[-->…<!--]-->`) that the client's inner `createIf` didn't expect, so Vue reported a mismatch and rendered the branch again. A `v-show` branch alone threw `Cannot read properties of null (reading 'insertBefore')` when its condition was false on the server. The server now renders the branch without the fragment, and each element branch, and each component branch with one root, hydrates.

These keep the shared lowering, as before:

- a component's child (such as `KeepAlive`'s), whose branches vue-jsx-vapor's server build would pass as separate children;
- a chain with a branch that has setup statements, a spread host element, a dynamic tag, a `<template>`, `<slot>` or `<component>`, or a `v-` attribute other than a plain `v-show` (`v-show:arg` included);
- a chain whose next element has its own `v-else` or `v-else-if`.

vue-jsx-vapor's server build still renders a `v-show` element shown when its value is false, in a branch or not, so hydrating it logs a style mismatch before the client hides it. A component branch whose root is a fragment still hydrates with a mismatch, as it does outside a branch.
