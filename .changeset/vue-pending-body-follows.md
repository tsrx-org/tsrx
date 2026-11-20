---
'@tsrx/vue': patch
---

A `@pending` body that is only an `@if`, a `@switch` or a loop now follows what it reads while it shows. `TsrxPendingBody` renders the body once, so such a body kept the branch, case or rows it rendered first: `@pending { @if (slow.value) { <p>{'Still loading'}</p> } }` never showed its message. Its output is now put in a fragment, which vue-jsx-vapor renders reactively: an `@if` becomes a `createIf` that switches when its condition does and keeps its branch's components while the branch stays chosen, and a `@switch` or a loop through `map_iterable` renders again when what it reads changes. A branch that throws when it is chosen reaches the `@catch`. The body's statements still run once, and a body that is one element or fragment is unchanged. An `@if` there now leaves Vue's `<!--if-->` anchor comment, as it does in an element.
