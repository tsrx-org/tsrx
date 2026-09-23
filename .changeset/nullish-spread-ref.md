---
'@tsrx/core': patch
'@tsrx/solid': patch
---

Spreading an omitted or `null` props bag onto a host element no longer throws
when the element also has a `ref`: `<input {...props.optional} ref={cb} />`
renders `<input />`, as native JSX does. The compiler read the spread's ref as
`spread.ref`, which threw `Cannot read properties of undefined (reading 'ref')`
on React, Preact, Solid, Vue, and Hono. Vue reads that ref for every host
spread, so it threw even without an explicit `ref`. The generated read is now
`spread?.ref`.
