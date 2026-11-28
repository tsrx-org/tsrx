---
'@tsrx/vue': patch
---

On the Vue target, a host element's child `@if` with `@else if` branches now renders as `v-if` / `v-else-if` / `v-else` elements when each branch is one element or component, as `@if` / `@else` already did. So does an `@else` whose only output is an `@if`. A branch element can now also have `v-show`, in an `@if` and in a `@switch` case. The shared lowering was a nested ternary, which caused these problems, now fixed:

- **State loss** (#1402). Beside another expression child, vue-jsx-vapor evaluated the ternary inside that child's `setNodes` effect, so the branch rendered again, components and all, whenever what the conditions read changed. The branch now stays while its condition does.
- **Hydration.** Beside an expression child, hydrating threw `No current hydration node was found` or `Cannot read properties of null (reading 'nodeType')`, or left the page frozen. Alone, the server rendered a later branch inside a fragment (`<!--[-->…<!--]-->`) that the client's inner `createIf` didn't expect, so Vue reported a mismatch and rendered the branch again. A `v-show` branch alone threw `Cannot read properties of null (reading 'insertBefore')` when its condition was false on the server. The server now renders the branch without the fragment, and each element branch, and each component branch with one root, hydrates.
- **Fallthrough.** Beside an expression child, a component branch was created as its parent's single root, so on the client it took the parent component's fallthrough `class` and `data-*` attributes, which the server didn't give it. It no longer does.

Beside an expression child, the conditions now run where an `@if` / `@else` evaluates its condition, after the attribute expressions of the elements before them rather than before them, as the server already did. That only shows if one of those expressions has a side effect a condition reads.

These keep the shared lowering, as before:

- a component's child (such as `KeepAlive`'s), whose branches vue-jsx-vapor's server build would pass as separate children;
- a chain with a branch that has a dynamic tag, a `<template>`, `<slot>` or `<component>`, or a `v-` attribute other than a plain `v-show` (`v-show:arg` included), and one with a branch that has setup statements or a spread host element that `TsrxScope` doesn't take (see its entry);
- a chain whose next element has its own `v-else` or `v-else-if`.

vue-jsx-vapor's server build still renders a `v-show` element shown when its value is false, in a branch or not, so hydrating it logs a style mismatch before the client hides it. A component branch whose root is a fragment still hydrates with a mismatch, as it does outside a branch.

The server markup changes for a chain's later branch, which loses its fragment. While servers and clients from before and after this change are both deployed, the new client hydrating a page the old server rendered logs `Hydration node mismatch` for a chain whose server picked a later branch or none, and renders the chain again. The page keeps working, and it is never worse than before this change, where these chains already mismatched or threw.
