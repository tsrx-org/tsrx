---
'@tsrx/solid': patch
---

On Solid, the setup statements of an `@else`, `@default`, `@empty`, `@try`,
`@pending`, or `@catch` body now run once, as setup does in an `@if` or
`@case` body. Before, the body ran inside the `<Show>`, `<Switch>`, `<For>`,
`<Loading>`, or `<Errored>` memo that reads it, so each signal its setup read
became a dependency there: the setup ran again and the body's output was
recreated whenever one changed. The body now runs through `untrack`, as
`fallback={untrack(() => { … })}`, `<Errored>{untrack(() => { … })}</Errored>`,
or `fallback={(err, reset) => untrack(() => { … })}`. Reads in the rendered
output stay reactive, and `reset()` still runs the `@try` body again.
