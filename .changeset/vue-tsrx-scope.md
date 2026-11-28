---
'@tsrx/vue': minor
'@tsrx/vue-runtime': patch
---

On the Vue target, an `@if` branch or a `@switch` case whose body has setup statements now renders through a new `TsrxScope` component from `@tsrx/vue-runtime` when it is in a host element or in a `@for` row that renders through `VaporFor`, keyed or not. `TsrxScope` runs the statements as its setup: once each time the branch mounts, as a component's own setup does. A branch that renders a spread host element, whose ref the compiler keeps in such a statement, does too. The shared lowering ran the statements in an effect of their own, so these problems are fixed:

- **State loss** (#1401, #1402). Whenever anything the statements read changed, such as a `@for` row's item or a `ref` the branch reads, the branch rendered again, components and all: inputs lost what was typed and counters reset. The branch now stays while its condition does.
- **A keyed `@for` row that is a `@switch` whose case has setup statements** stayed on the case it picked first. It now follows its value.
- **Hydration.** The server rendered such a branch inside a fragment (`<!--[-->…<!--]-->`), and hydrating it threw `No current hydration node was found` or `Cannot read properties of null (reading 'nodeType')`, reported a mismatch, or, for a branch alone in its element, rendered it a second time. The server now renders the branch's element as it is, and it hydrates.
- **A `@switch` nested in an `@if` branch's element, a `@switch` case's element, or a branch or case with setup statements** didn't hydrate either (#1403), and in a keyed `@for` row's element it rendered its case again whenever the row's item was replaced. Its cases are now `v-if` / `v-else-if` elements, with the `computed` that picks the case in the branch's `TsrxScope` or the row's slot.
- **Hooks.** Lifecycle hooks and watchers in the statements now belong to the branch on the client: `onMounted` runs each time it mounts, `onUnmounted` runs and a `watch` stops when it goes away, and `onUpdated` follows the branch's updates. `inject` reads what the components around it provide, and `provide` no longer warns. On the server the statements still run where the branch is rendered, in the setup of the component around it, so `provide`, `onServerPrefetch` and a `@catch` around them work as before. There, unlike on the client, `inject` doesn't see what that component itself provides, `provide` reaches the rest of that component, and a throw in the statements doesn't reach that component's `onErrorCaptured`. Keep `provide` and `inject` of a component's own keys in its own setup statements, or the server and the client render different values.

Migration: when the statements run now depends on where the branch is. In a host element or a `VaporFor` row they run once each time the branch mounts. In a component's children or slot function, a `<template>`, a fragment, or as a component's whole output, they still run again whenever what they read changes. Moving a branch from one of these places to another changes when its statements run.

So a value the statements compute in a host element keeps the value it had when the branch mounted. Before, it followed what it read, at the cost of rendering the branch again. For example, in

```tsrx
<div>
	@if (user.online) {
		const label = user.name + '!';
		<Badge {label} />
	}
</div>
```

renaming the user no longer changes the label while the branch stays. To follow it, compute it where it's read (`<Badge label={user.name + '!'} />`) or in a `computed` (`const label = computed(() => user.name + '!');`, then `label.value`).

A branch whose statements call something that reads or acts on their component keeps rendering as before, so it gets that component on the server and on the client alike: `useSlots`, `useAttrs`, `useModel`, `useTemplateRef`, `useCssModule`, `useVaporCssVars`, `useHost`, `useShadowRoot`, `useInstanceOption`, `getCurrentInstance`, `onErrorCaptured`, and vue-jsx-vapor's `useProps`, `useFullProps` and `defineExpose`. The compiler finds these by name, called directly or as a member (`Vue.useAttrs()`). Called through an aliased import, or from a function of your own, one gets the scope instead, which has no slots, attributes, props or template refs of its own: call it in the component's own setup statements and read the result in the branch. A `ref` given as a string through a binding or a spread (`ref={name}`, `{...{ ref: 'field' }}`) in such a branch registers with the scope, so the component's `useTemplateRef` doesn't see it; write the name as a literal (`ref="field"`), which keeps the branch in its component, or pass a `ref()` object.

These keep the shared lowering, as before:

- a branch or case anywhere but in a host element or a `VaporFor` row: in a component's children or slot function (the component could be a `KeepAlive`, whose `include` and `exclude` match its child component's name, which a scope would replace), a `<template>`, a fragment, or as a component's whole output, which still keeps its first branch (#1400);
- a branch whose output after the statements is not one element (a choice, a fragment of several nodes, a loop, a nested `@{ }` block), a dynamic tag branch, and a branch that awaits or yields;
- a branch that renders a `<slot>`, has a string literal `ref`, or calls one of the functions above;
- a `@for` body with setup statements of its own, outside a branch, which still renders through `map_iterable` and, keyed, still loses state on reorder (#1401).
