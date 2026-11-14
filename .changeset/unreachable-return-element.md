---
'@tsrx/core': patch
---

TypeScript's errors on an authored `return` of an element, such as TS7027 `Unreachable code detected.` for `return; return <div></div>;`, now map back to the `.tsrx` file, in `tsrx-tsc` and the editor. The `return` that the element lowers to keeps the authored statement's location, so its keyword and its end map as for any other `return`, also when the output hoists the element out of it or the `return` has no `;`.
