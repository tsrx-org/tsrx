---
'@tsrx/core': patch
---

On Vue, the helper component that renders a `@catch` body under `@pending` takes the component's name as a prefix (`App__StatementBodyHook1`) when the component is inside another function or a namespace, as it already did at module level. Before, it was declared under the bare name `StatementBodyHook1`, so a setup local of that name failed the build with "Identifier `StatementBodyHook1` has already been declared", and a binding of that name in the enclosing function rendered the helper in its place. The helper's name also skips any name the module source already uses, so an authored `App__StatementBodyHook1` no longer collides with it either.
