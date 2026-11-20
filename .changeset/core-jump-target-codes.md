---
'@tsrx/core': patch
---

A `break` or `continue` with no target gets TypeScript's code for it, in TypeScript's words: TS1107 "Jump target cannot cross function boundary." in a function or class `static` block (also out of a function's `@{ … }` body), TS1116 or TS1115 for a label that no statement around has, or a `continue` to a label that isn't on a loop, and TS1105 or TS1104 only without a label, outside any function. It was TS1105 or TS1104 ("Unsyntactic break", "Unsyntactic continue") for all of them.
