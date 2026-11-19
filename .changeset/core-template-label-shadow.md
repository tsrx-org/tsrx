---
'@tsrx/core': patch
---

Let a label in a template body reuse the name of a label around the template, as in a nested function. Every target runs an `@if`, `@for`, `@empty`, `@switch`, `@try`, `@pending` or `@catch` body, and a nested `@{ … }` block, in a function of its own, where TypeScript reads the two labels as unrelated, but the parser reported TS1114 (`Label 'outer' is already declared`). A returned code-only `@{ … }`, and a code-only `@{ … }` child of a returned fragment, are inlined before the `return`, in the same function, so a label there still can't reuse one around the `return` (TS1114), and a label still can't reuse one around it in the same body or function.
