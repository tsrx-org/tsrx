---
'@tsrx/core': patch
---

Keep `var` bindings declared in an inactive platform branch. When
`if (import.meta.env.platform.web) { var value = 'web'; }` compiled for another
platform, the compilers dropped the whole branch, so `export { value }` failed
with `Export 'value' is not defined` and a function reading `value` threw a
`ReferenceError`. The branch's code is still dropped, but its `var` names are now
declared without initializers, so they read as `undefined`, as in plain
JavaScript with the flag replaced by `false`.
