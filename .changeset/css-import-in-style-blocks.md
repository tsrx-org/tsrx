---
'@tsrx/core': minor
---

`@import` in a `<style>` block is now the `tsrx-css-import` compile error
(`DIAGNOSTIC_CODES.CSS_IMPORT`). The compiler scopes only the rules written in
the block and passed `@import` through, so the bundler inlined the imported
rules unscoped and they applied to the whole page. Share scoped styles through
an assigned block (`const theme = <style>…</style>`) and `apply={theme}`. For
global CSS, use `:global` in the block, or import the stylesheet in JavaScript:
`import './global.css'`.
