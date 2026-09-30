---
'@tsrx/vue': patch
---

Stop generating an unused catch fallback component for `@try` / `@catch` without
`@pending`. The component is only rendered by the `@pending` boundary, so without
one the output had an extra `defineVaporComponent` and a second hoisted copy of
a static catch body.
