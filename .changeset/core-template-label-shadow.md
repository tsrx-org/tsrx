---
'@tsrx/core': patch
---

Let a label in a template body reuse the name of a label around the template, as in a nested function. Every target runs an `@if`, `@for`, `@empty`, `@switch`, `@try`, `@pending` or `@catch` body, and a nested `@{ … }` block, in a function of its own, where TypeScript reads the two labels as unrelated, but the parser reported TS1114 (`Label 'outer' is already declared`).

A label still can't reuse one around it in the same body or function. Nor can it in a code-only `@{ … }` that is inlined before a `return`, in the same function or body: a returned one, a child of a returned fragment, and one of these in a `{ … }` child of a returned fragment, also inside a render-only `@{ … }` (`return <>{<>@{ … }</>}</>`). A `{ … }` in an element isn't inlined. TS1114 also stays for a few such `{ … }` shapes that the lowering runs in a function of their own, as before.
