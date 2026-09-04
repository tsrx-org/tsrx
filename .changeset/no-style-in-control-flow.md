---
'@tsrx/core': patch
'@tsrx/eslint-plugin': patch
---

Add an opt-in way to forbid `<style>` blocks that author CSS inside `@if`/`@for`/`@switch`/`@try` bodies. Enable the `tsrx/no-style-in-control-flow` ESLint rule, or pass `forbidStyleInControlFlow: true` to `analyzeTsrx`. Both are off by default; self-closing `<style apply={theme} />` is still allowed.
