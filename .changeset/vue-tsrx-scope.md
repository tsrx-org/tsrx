---
'@tsrx/vue': minor
'@tsrx/vue-runtime': patch
---

On the Vue target, an `@if` branch or a `@switch` case whose body has setup statements now renders through a new `TsrxScope` component from `@tsrx/vue-runtime`, which runs the statements as its setup: once each time the branch mounts, as a component's own setup does. A branch that renders a spread host element, whose ref the compiler keeps in such a statement, does too. The shared lowering ran the statements in an effect of their own, so these problems are fixed:

- **State loss** (#1401, #1402). Whenever anything the statements read changed, such as a keyed `@for` row's item or a `ref` the branch reads, the branch rendered again, components and all: inputs lost what was typed and counters reset. The branch now stays while its condition does.
- **A keyed `@switch` row whose case has setup statements** stayed on the case it picked first. It now follows its value.
- **Hydration.** The server rendered such a branch inside a fragment (`<!--[-->…<!--]-->`), and hydrating it threw `No current hydration node was found` or `Cannot read properties of null (reading 'nodeType')`, reported a mismatch, or, for a branch alone in its element, rendered it a second time. The server now renders the branch's element as it is, and it hydrates.
- **A `@switch` nested in an `@if` branch's element, a `@switch` case's element or a branch with setup statements** didn't hydrate either (#1403), and in a keyed `@for` row's element it rendered its case again whenever the row's item was replaced. Its cases are now `v-if` / `v-else-if` elements, with the `computed` that picks the case in the branch's `TsrxScope` or the row's slot.
- **Hooks.** `onMounted`, `onUnmounted`, `provide` and `inject` in the statements now act for the branch on the client: `onMounted` runs each time it mounts, `onUnmounted` when it goes away, `inject` reads what the components around it provide, and `provide` no longer warns. On the server the statements still run where the branch is rendered, in the setup of the component around it, so `provide`, `onServerPrefetch` and a `@catch` around them work as before. There, unlike on the client, `inject` doesn't see what that component itself provides, and `provide` reaches the rest of that component: keep `provide` and `inject` of a component's own keys in its own setup statements, or the server and the client render different values.

Migration: a value the statements compute now keeps the value it had when the branch mounted. Before, it followed what it read, at the cost of rendering the branch again. For example, in

```tsrx
@if (user.online) {
	const label = user.name + '!';
	<Badge {label} />
}
```

renaming the user no longer changes the label while the branch stays. To follow it, compute it where it's read (`<Badge label={user.name + '!'} />`) or in a `computed` (`const label = computed(() => user.name + '!');`, then `label.value`).

`useSlots()` and `useAttrs()` called in those statements now return the scope's own slots and attributes: none, unless the branch is the component's whole output, where the scope takes the component's fallthrough attributes. Call them in the component's own setup statements and read the result in the branch. A `ref` given as a string through a binding or a spread (`ref={name}`, `{...{ ref: 'field' }}`) in such a branch now registers with the scope, so the component's `useTemplateRef` doesn't see it; write the name as a literal (`ref="field"`), which keeps the branch in its component, or pass a `ref()` object.

These keep the shared lowering: a branch whose output after the statements is not one element (a choice, a fragment of several nodes, a loop, a nested `@{ }` block), a dynamic tag branch, a branch that awaits or yields, a branch that renders a `<slot>` or has a string `ref` (both resolve against the component rendering them, so a scope would change what they find), a branch or case that is the child of a component with `include` or `exclude`, or of a `KeepAlive` with a spread (a `KeepAlive` matches its child component's name, which a scope would replace), and keyed `@for` bodies with setup statements that render through `map_iterable`, which still lose state on reorder (#1401). An `@if` that is a component's whole output still keeps its first branch (#1400).
