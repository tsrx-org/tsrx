---
'@tsrx/runtime': patch
---

Render conditional host spreads such as `<input {...(enabled && { disabled: true })} />`
when the condition is false. `normalize_spread_props` now passes every non-object
value through unchanged instead of throwing `Reflect.ownKeys called on non-object`,
so `false`, `0`, and `''` spread to nothing as they do in native JSX, and
`normalize_spread_props_for_ref_attr` returns an empty bag for `null` or
`undefined` so an element with both a `ref` and a nullish spread no longer throws
reading `.ref`. The helper types accept the falsy values TypeScript allows in a
JSX spread, so editors stop reporting them as errors.
