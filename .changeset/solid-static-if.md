---
'@tsrx/solid': patch
---

On Solid, an `@if` whose condition cannot change at runtime, a literal or an `import.meta.env.*` read (or the negation of either), now compiles to a plain `condition ? a : b` instead of a `<Show>`, when it has at most an `@else` and its branches hold only output. A branch with setup statements, or an `@else if` chain, still uses `<Show>` or `<Switch>`.
