---
'@tsrx/core': patch
'@tsrx/vue': patch
'@tsrx/vue-runtime': patch
---

Lower a `@catch` body once when the target renders it through a fallback
component. For Vue, a `@try` with `@pending` and `@catch` no longer hoists a
static catch body a second time for an inline fallback that is never used; the
fallback renders the component instead.

Type `TsrxErrorBoundary` as returning Vue's `Block`, so `<TsrxErrorBoundary>`
in the type-only output for `@try` / `@catch` is a valid `vue-jsx-vapor` JSX
element. Under `strict` it reported TS2786 because its declared return type
included `undefined`.
