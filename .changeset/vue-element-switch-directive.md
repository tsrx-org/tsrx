---
'@tsrx/vue': patch
---

On the Vue target, a host element's child `@switch` whose cases each render one element or component, or nothing, now renders as `v-if` / `v-else-if` elements, in the JSX a component returns or a declaration outside a loop in its setup holds. A `computed` in the component's setup runs the `switch` and picks the case. The shared lowering put the `switch` in an expression child, which vue-jsx-vapor renders with `setNodes`. That caused these problems, now fixed:

- **Hydration** (#1403). Hydrating server markup there threw `Cannot read properties of null (reading 'nodeType')`, or `No current hydration node was found` for a component case, and the page stopped updating. When the server had rendered a case and the client then matched none, the case's element was emptied instead of removed (`<p></p>`). The server's case, or its `<!---->`, now hydrates and follows the value. The server markup is unchanged.
- **State loss.** The case rendered again, components and all, whenever what the `switch` read changed, even when it picked the same case. The case now stays mounted while it stays picked.
- **Fallthrough.** A component case was created as its parent's single root, so on the client it took the parent component's fallthrough `class` and `data-*` attributes, which the server didn't give it. It no longer does.
- **Teleport.** A `VaporTeleport` case left a `<!--teleport start-->` comment behind each time it was replaced. It no longer does.

The `switch` still runs once for each change it reads, and a throw in it still goes to the nearest `@catch` or the app's error handler. While it throws, the element keeps the case it showed. It now runs where an `@if` in the same place evaluates its condition, after the attribute expressions of the elements before it rather than before them, which only shows if one of those expressions has a side effect the `switch` reads. `v-if` anchor comments now mark the cases.

These keep the shared lowering, as before:

- a `@switch` inside an `@if` branch, a loop row, a `@try` or `@pending` body, a component's children, a keyed element, or an element with a `v-` directive other than `v-show`;
- one whose case has setup statements or renders a fragment, a choice, a `<template>`, `<slot>` or `<component>`, or an element with a `v-` attribute;
- one whose next element has its own `v-else` or `v-else-if`;
- one that is a fragment's own child, or a component's whole output (#1400).
